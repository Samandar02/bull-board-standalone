---
name: bull-queue-management
description: >-
  Use this skill when integrating, instantiating, configuring, debugging, or operating Bull (v3/v4) queues on the server backend.
---

# Bull (v3/v4) Server Queue Management Guide

This runbook guides agents on how to instantiate, manage, discover, and operate **Bull (v3/v4)** queues within `@bull-board/server` and `@bull-board/api`.

---

## 1. Bull vs BullMQ Architecture Comparison

Bull (v3/v4) and BullMQ differ in their Redis key layout, connection options, and feature sets:

| Feature | Bull (v3/v4) | BullMQ (v5/v6) |
| :--- | :--- | :--- |
| **Constructor** | `new Queue(name, { redis: redisOpts, prefix })` | `new Queue(name, { connection: redisOpts, prefix })` |
| **Redis Connections** | Creates multiple connections (client, subscriber, bclient) | Connection reuse via shared `ioredis` instance |
| **Discovery Keys** | `<prefix>:<queueName>:id`, `:waiting`, `:active`, `:delayed` | `<prefix>:<queueName>:meta` |
| **Adapter Class** | `BullAdapter` (from `@bull-board/api/bullAdapter`) | `BullMQAdapter` (from `@bull-board/api/bullMQAdapter`) |
| **Completed Retries**| `allowCompletedRetries: false` (by default) | Native retry supported for completed jobs |
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

## 3. Auto-Discovery & Redis Key Signatures

In `packages/server/src/services/redisManager.ts`, Bull queues are automatically detected through non-blocking `SCAN`:

```typescript
// Bull v3/v4 queue key pattern detection
if (k.endsWith(':waiting') || k.endsWith(':id') || k.endsWith(':active') || k.endsWith(':delayed')) {
  const parts = k.split(':');
  if (parts.length >= 2) {
    const queueName = parts[parts.length - 2];
    const prefix = parts.length > 2 ? parts.slice(0, parts.length - 2).join(':') : '';
    // Register as Bull queue
  }
}
```

- **Prefix handling**: If a key is `bull:orders:waiting`, prefix is `'bull'` and queue name is `'orders'`.
- If custom prefix is used (e.g., `app:payments:active`), prefix is `'app'` and queue name is `'payments'`.

---

## 4. Wrapping with `BullAdapter`

To display Bull queues inside the Bull-Board UI, adapt them using `BullAdapter`:

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

## 5. Performing Job Operations

When executing actions via Bull API:

### Adding Jobs
```typescript
await queue.add('sendWelcomeEmail', { userId: '123' }, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  delay: 5000, // delay 5 seconds
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
// Clean completed or failed jobs older than grace period
await queue.clean(60000, 'completed');
await queue.clean(60000, 'failed');
```

### Inspecting Repeatable / Cron Jobs
```typescript
const repeatableJobs = await queue.getRepeatableJobs();
// Remove a repeatable job
await queue.removeRepeatableByKey(repeatableJobKey);
```

---

## 6. Connection Pool & Clean-up Lifecycle

Because Bull queues open background event listeners and Redis connections, unmanaged instances cause connection exhaustion.

In `packages/server/src/services/boardManager.ts`:
1. **Cache Instances**: Cache active `Queue` objects in a `Map<string, { queue, adapter }>`.
2. **Close Stale Queues**: When a queue is deleted from Redis or when refreshing:
   ```typescript
   if (typeof queue?.close === 'function') {
     await queue.close();
   }
   ```
3. **Instance Invalidation**: On server shutdown or instance update, call:
   ```typescript
   boardManager.invalidateInstance(instanceId);
   ```

---

## 7. Troubleshooting Bull Server Issues

1. **Missing Jobs in Dashboard**:
   - Verify Redis DB index (`db: 0-15`). Bull does not search across all DBs; it targets the specific DB specified in options.
2. **Prefix Mismatch**:
   - If keys exist as `myprefix:queueName:*`, ensure the queue was instantiated with `{ prefix: 'myprefix' }`.
3. **MaxListenersExceededWarning**:
   - Occurs when many Bull queues attach event listeners without reusing Redis connections. Always invoke `queue.close()` when removing or updating queues.
