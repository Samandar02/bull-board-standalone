---
name: bull-queue-management
description: >-
  Use this skill when integrating, instantiating, configuring, debugging, or operating Bull (v3/v4) queues on the server backend.
---

# Bull (v3/v4) Server Queue Management & Inspection Guide

This runbook guides agents on how to instantiate, manage, discover, and operate **Bull (v3/v4)** queues within `@bull-board/server` and `@bull-board/api`.

---

## 1. Bull vs BullMQ Architecture Comparison

Bull (v3/v4) and BullMQ differ in their Redis key layout, connection models, and internal data structures:

| Feature | Bull (v3/v4) | BullMQ (v5/v6) |
| :--- | :--- | :--- |
| **Constructor** | `new Queue(name, { redis: redisOpts, prefix })` | `new Queue(name, { connection: redisOpts, prefix })` |
| **Redis Connections** | Opens 3 connections per queue (client, subscriber, bclient) | Connection reuse via shared `ioredis` instance |
| **Discovery Markers** | `<prefix>:<queueName>:id` (counter) & `:waiting` | `<prefix>:<queueName>:meta` (hash) |
| **Adapter Class** | `BullAdapter` (from `@bull-board/api/bullAdapter`) | `BullMQAdapter` (from `@bull-board/api/bullMQAdapter`) |
| **Completed Retries**| `allowCompletedRetries: false` (disabled by default) | Native retry supported for completed jobs |
| **Repeatable Format**| Key-based: `repeat: { cron, every, key }` | Schedulers API & repeat configs |

---

## 2. Instantiating Bull Queues on the Server

### Connection Configuration (`ioredis` format)
Bull expects Redis options passed under the `redis` property:

```typescript
import QueueBull, { Queue } from 'bull';
import { RedisOptions } from 'ioredis';

const redisOpts: RedisOptions = {
  host: 'localhost',
  port: 6379,
  db: 0,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
};

// Instantiating a Bull queue
export function createBullQueueInstance(queueName: string, prefix = 'bull', redis = redisOpts): Queue {
  return new (QueueBull as any)(queueName, {
    redis,
    prefix: prefix || 'bull',
  });
}
```

> [!IMPORTANT]
> When integrating with Docker containers, ensure `host` resolves to `host.docker.internal` or `process.env.REDIS_HOST` rather than `localhost`. Use `redisManager.resolveHost(host)`.

---

## 3. High-Performance Pattern-Based Queue Discovery

In `packages/server/src/services/redisManager.ts`, queue auto-discovery avoids slow `MATCH *` iteration in favor of pattern-based scanning:

### A. Non-blocking Parallel Scan
- **BullMQ**: Keys matching `*:meta`.
- **Bull (v3/v4)**: Keys matching `*:id` (primary counter) and `*:waiting` (fallback for fresh queues).
- Executed concurrently via `Promise.all`:

```typescript
await Promise.all([
  this.scanKeysPattern(client, '*:meta', handleBullMQKeys),
  this.scanKeysPattern(client, '*:id', handleBullKeys),
  this.scanKeysPattern(client, '*:waiting', handleBullKeys),
]);
```

### B. Colon-Delimited Names & Configured Prefixes
When queue names contain colons (e.g. `bull:tenant:1:orders:id`):
1. If the instance specifies a `prefix` (e.g. `bull`): strip the prefix from the beginning so the resulting queue name remains `tenant:1:orders`.
2. If prefix is unknown or wild, split at the last colon (`lastIndexOf(':')`).
3. If a queue was already registered as BullMQ via `:meta`, it is excluded from Bull discovery to prevent duplicate entries.

---

## 4. On-Demand Discovery & Router Caching

To prevent stale router caches from hiding newly added queues:

1. **Board Caching (60s default)**:
   Routers are cached in memory for 60 seconds to prevent Redis discovery overhead on every HTTP poll.
2. **Missing Queue Detection (`targetQueue`)**:
   In `packages/server/src/routes/boardRoutes.ts` and `boardManager.ts`:
   When a user navigates to `/queue/:name` (`activeQueue` query param), if the requested queue is **missing in the cached board**, an **on-demand rescan** is immediately triggered, bypassing the 60s cache and ensuring zero missing queues.
3. **Manual Refresh**:
   Requesting `?refresh=true` forces an immediate rescan of all queues in the instance.

---

## 5. Job Inspection & Retrieval Performance (`getJobs`)

When a user opens a queue page, the dashboard fetches the list of jobs:

### Redis Internal Structure
- Job states (`waiting`, `active`, `completed`, `failed`, `delayed`) are stored as **Redis ZSETs** (Sorted Sets) or **LISTs**. Only the `jobId` and score (timestamp) reside in the set.
- The actual job payload, stacktraces, and options are stored in separate **HASH** keys (`<prefix>:<name>:<jobId>`).

### Pagination Mechanics
- The Bull-Board backend requests jobs using pagination: `queue.getJobs(statuses, start, end)`.
- Complexity is **$O(\log(N) + M)$** where $N$ is total queue size (e.g. 1,000,000) and $M$ is page size (default 10).
- Only the 10 corresponding HASH objects are fetched in a single Redis pipeline.
- Overview cards (`/board`) do not fetch job arrays at all; they only call `queue.getJobCounts()` (`ZCARD` / `LLEN` — **$O(1)$**).

> [!WARNING]
> If producer applications store huge binary data (e.g., base64 images or multi-megabyte payloads) directly in job `data`, fetching 10 jobs can consume bandwidth. Always recommend storing large blobs in S3/disk and passing references in the job payload.

---

## 6. Wrapping with `BullAdapter`

To display Bull queues inside Bull-Board, adapt them using `BullAdapter`:

```typescript
import { BullAdapter } from '@bull-board/api/bullAdapter';
import QueueBull from 'bull';

const bullQueue = new (QueueBull as any)('emailNotifications', {
  redis: redisOptions,
  prefix: 'bull',
});

const adapter = new BullAdapter(bullQueue, {
  prefix: 'bull:',
  delimiter: ':',
  displayName: 'Email Notifications',
  description: 'Transactional email queue',
  readOnlyMode: false,
});
```

### Key Options for `BullAdapter`
- `readOnlyMode`: When `true`, disables mutations (clean, retry, pause, promote) for this queue.
- `displayName`: Custom label displayed in dashboard tabs and queue cards.
- `description`: Metadata subtitle (e.g. prefix info).

---

## 7. Performing Job Operations

When executing actions via Bull API:

### Adding Jobs
```typescript
await queue.add('sendWelcomeEmail', { userId: '123' }, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  delay: 5000,
});
```

### Retrying Failed Jobs
```typescript
const job = await queue.getJob(jobId);
if (job) {
  await job.retry();
}
```

### Cleaning Jobs
```typescript
await queue.clean(60000, 'completed');
await queue.clean(60000, 'failed');
```

### Repeatable / Cron Schedulers
```typescript
const repeatableJobs = await queue.getRepeatableJobs();
await queue.removeRepeatableByKey(repeatableJobKey);
```

---

## 8. Connection Pool & Clean-up Lifecycle

Because Bull creates 3 Redis client connections per queue instance, unmanaged instances will cause connection leaks:

1. **Cache Instances**: Cache active `Queue` objects in `BoardManager`'s `queues: Map<string, { queue, adapter }>`.
2. **Close Stale Queues**: When a queue disappears from Redis or during rescan:
   ```typescript
   if (typeof queue?.close === 'function') {
     await queue.close();
   }
   ```
3. **Instance Invalidation**: When modifying or deleting a Redis instance in the dashboard:
   ```typescript
   boardManager.invalidateInstance(instanceId);
   ```

---

## 9. Troubleshooting Checklist

1. **Queue Not Showing in Dashboard**:
   - Check if Redis DB matches (`db: 0-15`). Bull does not query across multiple DBs.
   - Verify prefix matching. If custom prefix is used, make sure it matches the instance settings.
   - If queue was just created, check if `activeQueue` on-demand rescan triggered or click "Refresh Queues".
2. **`MaxListenersExceededWarning`**:
   - Ensure `queue.close()` is called on deleted or replaced queue instances.
