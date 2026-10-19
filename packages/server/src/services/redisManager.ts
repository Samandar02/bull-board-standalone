import fs from 'node:fs';
import { Redis, RedisOptions } from 'ioredis';
import { RedisInstanceRecord, instanceStore } from '../db/instanceStore.js';

export interface DiscoveredQueue {
  name: string;
  prefix: string;
  type: 'bullmq' | 'bull';
}

export interface RedisDatabaseInfo {
  index: number;
  keysCount: number;
  hasKeys: boolean;
}

export class RedisManager {
  private clientPool: Map<string, Redis> = new Map();

  private getPoolKey(instanceId: string, db: number): string {
    return `${instanceId}::${db}`;
  }

  public resolveHost(host: string): string {
    const isDocker = fs.existsSync('/.dockerenv');
    if (isDocker && (host === 'localhost' || host === '127.0.0.1')) {
      return process.env.REDIS_HOST || 'host.docker.internal';
    }
    return host;
  }

  public getRedisOptions(instance: RedisInstanceRecord, overrideDb?: number): RedisOptions {
    const options: RedisOptions = {
      host: this.resolveHost(instance.host),
      port: instance.port,
      db: overrideDb !== undefined ? overrideDb : instance.db,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
    };

    if (instance.username) {
      options.username = instance.username;
    }
    if (instance.password) {
      options.password = instance.password;
    }
    if (instance.tls) {
      options.tls = {};
    }

    return options;
  }

  public async getClient(instanceId: string, overrideDb?: number): Promise<Redis> {
    const instance = instanceStore.getById(instanceId);
    if (!instance) {
      throw new Error(`Redis instance ${instanceId} not found`);
    }

    const db = overrideDb !== undefined ? overrideDb : instance.db;
    const poolKey = this.getPoolKey(instanceId, db);

    let client = this.clientPool.get(poolKey);
    if (!client || client.status === 'end') {
      const opts = this.getRedisOptions(instance, db);
      client = new Redis(opts);
      await client.connect();
      this.clientPool.set(poolKey, client);
    } else if (client.status === 'wait') {
      await client.connect();
    }

    return client;
  }

  public async testConnection(config: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    db?: number;
    tls?: boolean;
  }): Promise<{
    success: boolean;
    latencyMs?: number;
    version?: string;
    databases?: RedisDatabaseInfo[];
    error?: string;
  }> {
    const opts: RedisOptions = {
      host: this.resolveHost(config.host || 'localhost'),
      port: Number(config.port) || 6379,
      db: Number(config.db) || 0,
      lazyConnect: true,
      connectTimeout: 4000,
      maxRetriesPerRequest: 1,
    };

    if (config.username) opts.username = config.username;
    if (config.password) opts.password = config.password;
    if (config.tls) opts.tls = {};

    const client = new Redis(opts);
    try {
      const startTime = Date.now();
      await client.connect();
      const pingRes = await client.ping();
      const latencyMs = Date.now() - startTime;

      if (pingRes !== 'PONG') {
        throw new Error(`Unexpected PING response: ${pingRes}`);
      }

      // Read server info
      const serverInfo = await client.info('server');
      const versionMatch = serverInfo.match(/redis_version:([^\r\n]+)/);
      const version = versionMatch ? versionMatch[1] : undefined;

      // Read keyspace info
      const keyspaceInfo = await client.info('keyspace');
      const databases = this.parseKeyspaceInfo(keyspaceInfo);

      await client.quit();
      return { success: true, latencyMs, version, databases };
    } catch (err: any) {
      try {
        client.disconnect();
      } catch {}
      return { success: false, error: err.message || 'Connection failed' };
    }
  }

  private parseKeyspaceInfo(keyspace: string): RedisDatabaseInfo[] {
    const dbMap = new Map<number, number>();
    const lines = keyspace.split('\n');
    for (const line of lines) {
      const match = line.match(/^db(\d+):keys=(\d+)/);
      if (match) {
        const dbIdx = parseInt(match[1], 10);
        const keys = parseInt(match[2], 10);
        dbMap.set(dbIdx, keys);
      }
    }

    const dbs: RedisDatabaseInfo[] = [];
    for (let i = 0; i <= 15; i++) {
      const keysCount = dbMap.get(i) || 0;
      dbs.push({
        index: i,
        keysCount,
        hasKeys: keysCount > 0,
      });
    }
    return dbs;
  }

  public async getDatabases(instanceId: string): Promise<RedisDatabaseInfo[]> {
    const client = await this.getClient(instanceId, 0);
    const keyspaceInfo = await client.info('keyspace');
    return this.parseKeyspaceInfo(keyspaceInfo);
  }

  private parseQueueKey(
    key: string,
    marker: 'meta' | 'id'
  ): { prefix: string; name: string } | null {
    const suffix = `:${marker}`;
    if (!key.endsWith(suffix)) return null;

    const body = key.slice(0, -suffix.length);
    if (!body) return null;

    const lastColon = body.lastIndexOf(':');
    if (lastColon === -1) {
      // Prefikssiz, masalan: "myQueue:meta" yoki "myQueue:id"
      return { prefix: '', name: body };
    }

    const prefix = body.slice(0, lastColon);
    const name = body.slice(lastColon + 1);
    if (!name) return null;

    return { prefix, name };
  }

  private async scanKeysPattern(
    client: Redis,
    pattern: string,
    onKeys: (keys: string[]) => void
  ): Promise<void> {
    let cursor = '0';
    let iterations = 0;
    const maxIterations = 2000; // Safeguard up to 2,000,000 keys

    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
      cursor = nextCursor;
      iterations++;

      if (keys.length > 0) {
        onKeys(keys);
      }
    } while (cursor !== '0' && iterations < maxIterations);
  }

  public async discoverQueues(instanceId: string, overrideDb?: number): Promise<DiscoveredQueue[]> {
    try {
      const client = await this.getClient(instanceId, overrideDb);
      const discoveredMap = new Map<string, DiscoveredQueue>();
      const bullmqKeys = new Set<string>();

      // 1. BullMQ navbatlarini *:meta patterni orqali SCAN qilish
      await this.scanKeysPattern(client, '*:meta', (keys) => {
        for (const k of keys) {
          const parsed = this.parseQueueKey(k, 'meta');
          if (parsed) {
            const key = `${parsed.prefix}::${parsed.name}`;
            bullmqKeys.add(key);
            discoveredMap.set(key, {
              name: parsed.name,
              prefix: parsed.prefix,
              type: 'bullmq',
            });
          }
        }
      });

      // 2. Bull (v3/v4) navbatlarini *:id patterni orqali SCAN qilish
      await this.scanKeysPattern(client, '*:id', (keys) => {
        for (const k of keys) {
          const parsed = this.parseQueueKey(k, 'id');
          if (parsed) {
            const key = `${parsed.prefix}::${parsed.name}`;
            // Agar navbat BullMQ sifatida topilgan bo'lsa, qayta yozilmaydi
            if (!bullmqKeys.has(key) && !discoveredMap.has(key)) {
              discoveredMap.set(key, {
                name: parsed.name,
                prefix: parsed.prefix,
                type: 'bull',
              });
            }
          }
        }
      });

      // Return queues sorted by prefix then queue name
      const result = Array.from(discoveredMap.values());
      result.sort((a, b) => {
        if (a.prefix !== b.prefix) {
          return a.prefix.localeCompare(b.prefix);
        }
        return a.name.localeCompare(b.name);
      });

      return result;
    } catch (err: any) {
      console.warn(`[RedisManager] discoverQueues failed for instance ${instanceId}:`, err.message);
      return [];
    }
  }

  public closeAll() {
    for (const client of this.clientPool.values()) {
      try {
        client.quit();
      } catch {}
    }
    this.clientPool.clear();
  }
}

export const redisManager = new RedisManager();
