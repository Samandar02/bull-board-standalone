import { Redis, RedisOptions } from 'ioredis';
import fs from 'node:fs';
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

  public async discoverQueues(instanceId: string, overrideDb?: number): Promise<DiscoveredQueue[]> {
    try {
      const client = await this.getClient(instanceId, overrideDb);
      const discoveredMap = new Map<string, DiscoveredQueue>();

      // Fast scan of keys with cursor
      let cursor = '0';
      const pattern = '*';
      let iterations = 0;
      const maxIterations = 100; // Scan up to 100,000 keys

      do {
        const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
        cursor = nextCursor;
        iterations++;

        for (const k of keys) {
          // BullMQ queue metadata pattern: <prefix>:<queueName>:meta or <queueName>:meta
          if (k.endsWith(':meta')) {
            const parts = k.split(':');
            if (parts.length >= 2) {
              const queueName = parts[parts.length - 2];
              const prefix = parts.length > 2 ? parts.slice(0, parts.length - 2).join(':') : '';
              const key = `${prefix}::${queueName}`;
              discoveredMap.set(key, {
                name: queueName,
                prefix,
                type: 'bullmq',
              });
            }
          }
          // Bull v3/v4 queue pattern: <prefix>:<queueName>:id or :waiting or :active
          else if (k.endsWith(':waiting') || k.endsWith(':id') || k.endsWith(':active') || k.endsWith(':delayed')) {
            const parts = k.split(':');
            if (parts.length >= 2) {
              const queueName = parts[parts.length - 2];
              const prefix = parts.length > 2 ? parts.slice(0, parts.length - 2).join(':') : '';
              const key = `${prefix}::${queueName}`;
              // Only add if not already registered (or if registered as bull, keep it)
              if (!discoveredMap.has(key)) {
                discoveredMap.set(key, {
                  name: queueName,
                  prefix,
                  type: 'bull',
                });
              }
            }
          }
        }
      } while (cursor !== '0' && iterations < maxIterations);

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
