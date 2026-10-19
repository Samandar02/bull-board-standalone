import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import QueueBull from 'bull';
import { Queue as QueueMQ } from 'bullmq';
import { Router } from 'express';
import { instanceStore } from '../db/instanceStore.js';
import { redisManager } from './redisManager.js';

interface CachedBoard {
  router: Router;
  adapter: ExpressAdapter;
  setQueues: (queues: any[]) => void;
  queues: Map<string, any>;
  lastScannedAt: number;
}

export class BoardManager {
  private boardsCache: Map<string, CachedBoard> = new Map();

  private getCacheKey(instanceId: string, db: number): string {
    return `${instanceId}::${db}`;
  }

  public async getBoardRouter(
    instanceId: string,
    overrideDb?: number,
    forceRefresh = false,
    targetQueue?: string
  ): Promise<Router> {
    const instance = instanceStore.getById(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    const db = overrideDb !== undefined ? overrideDb : instance.db;
    const cacheKey = this.getCacheKey(instanceId, db);
    const cached = this.boardsCache.get(cacheKey);

    const now = Date.now();
    // Agar aniq bir navbat so'ralgan bo'lsa va u keshda mavjud bo'lmasa, darhol yangilash
    const queueMissingInCache =
      Boolean(targetQueue) &&
      Boolean(cached) &&
      !Array.from(cached!.queues.keys()).some((k) => k.includes(`::${targetQueue}::`));

    // Cache for 60 seconds unless forced or target queue missing
    if (cached && !forceRefresh && !queueMissingInCache && now - cached.lastScannedAt < 60000) {
      return cached.router;
    }

    if (cached) {
      // Refresh queues in existing board
      await this.refreshQueues(instanceId, db, cached);
      cached.lastScannedAt = now;
      return cached.router;
    }

    // Create new board
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath(`/api/instances/${instanceId}/board`);

    const board = createBullBoard({
      queues: [],
      serverAdapter,
      options: {
        uiConfig: {
          boardTitle: `${instance.name} (DB ${db})`,
          overview: { groupByDelimiter: true },
          miscLinks: [{ text: 'Instances List', url: '/instances' }],
        },
      },
    });

    const cachedBoard: CachedBoard = {
      router: serverAdapter.getRouter(),
      adapter: serverAdapter,
      setQueues: board.setQueues,
      queues: new Map(),
      lastScannedAt: now,
    };

    await this.refreshQueues(instanceId, db, cachedBoard);
    this.boardsCache.set(cacheKey, cachedBoard);

    return cachedBoard.router;
  }

  private async refreshQueues(instanceId: string, db: number, cachedBoard: CachedBoard) {
    try {
      const instance = instanceStore.getById(instanceId)!;
      const redisOpts = redisManager.getRedisOptions(instance, db);

      const discovered = await redisManager.discoverQueues(instanceId, db);
      const adapters: any[] = [];
      const activeKeys = new Set<string>();

      for (const d of discovered) {
        const qKey = `${d.prefix}::${d.name}::${d.type}`;
        activeKeys.add(qKey);

        let qInstance = cachedBoard.queues.get(qKey);
        if (!qInstance) {
          const adapterPrefix = d.prefix ? `${d.prefix}:` : '';
          const delimiter = d.prefix ? ':' : '';

          if (d.type === 'bullmq') {
            const queue = new QueueMQ(d.name, {
              connection: redisOpts,
              prefix: d.prefix || undefined,
            });
            const adapter = new BullMQAdapter(queue, {
              prefix: adapterPrefix,
              delimiter,
              displayName: d.name,
              description: d.prefix ? `Prefix: ${d.prefix}` : undefined,
            });
            qInstance = { queue, adapter };
          } else {
            const queue = new (QueueBull as any)(d.name, {
              redis: redisOpts,
              prefix: d.prefix || undefined,
            });
            const adapter = new BullAdapter(queue, {
              prefix: adapterPrefix,
              delimiter,
              displayName: d.name,
              description: d.prefix ? `Prefix: ${d.prefix}` : undefined,
            });
            qInstance = { queue, adapter };
          }
          cachedBoard.queues.set(qKey, qInstance);
        }

        adapters.push(qInstance.adapter);
      }

      // Clean up queues that were deleted from Redis
      for (const [key, qObj] of cachedBoard.queues.entries()) {
        if (!activeKeys.has(key)) {
          try {
            if (typeof qObj.queue?.close === 'function') {
              qObj.queue.close();
            }
          } catch {}
          cachedBoard.queues.delete(key);
        }
      }

      cachedBoard.setQueues(adapters);
    } catch (err: any) {
      console.warn(`[BoardManager] refreshQueues failed for instance ${instanceId}:`, err.message);
      cachedBoard.setQueues([]);
    }
  }

  public invalidateInstance(instanceId: string) {
    for (const [key, board] of this.boardsCache.entries()) {
      if (key.startsWith(`${instanceId}::`)) {
        for (const qObj of board.queues.values()) {
          try {
            if (typeof qObj.queue?.close === 'function') {
              qObj.queue.close();
            }
          } catch {}
        }
        this.boardsCache.delete(key);
      }
    }
  }
}

export const boardManager = new BoardManager();
