---
name: bull-board-server-architecture
description: >-
  Use this skill when modifying, extending, or debugging the backend server, Redis connection manager, SQLite database, or dynamic queue discovery.
---

# Bull Board Server Architecture & Backend Services

This skill details the internal architecture of `@bull-board/server`, focusing on multi-instance management, SQLite persistence, non-blocking Redis inspection, and dynamic Bull Board routing.

## Architecture Breakdown

### 1. Database Store (`packages/server/src/db/instanceStore.ts`)
- **Technology**: Built-in Node.js SQLite (`node:sqlite`). No native compilation or C++ node-gyp bindings needed.
- **Location**: Database file is placed at `data/instances.db` relative to `process.cwd()`.
- **Initialization**: Creates `instances` table if not exists and seeds a `Local Redis` instance pointing to `localhost:6379` (or `host.docker.internal` inside Docker).
- **CRUD Operations**:
  - `getAll()`: Returns all saved Redis connections.
  - `getById(id)`: Returns single instance record.
  - `create(dto)`: Generates a UUID and stores instance credentials.
  - `update(id, dto)`: Updates record and triggers board cache invalidation.
  - `delete(id)`: Removes instance and invalidates cached board.

### 2. Redis Connection & Discovery (`packages/server/src/services/redisManager.ts`)
- **Client Pooling**: Maintains an in-memory client pool keyed by `${instanceId}::${db}`.
- **Safe Queue Discovery**:
  - **Never use `KEYS *`**: Calling `KEYS` locks the Redis single-thread process and causes outages on production clusters.
  - **SCAN Pattern**: Implements cursor-based iteration (`SCAN cursor MATCH * COUNT 1000`) with a hard iteration safety cap (100 iterations max).
  - **Key Patterns Recognized**:
    - BullMQ: Keys ending with `:meta`. Format: `<prefix>:<queueName>:meta`.
    - Bull v3/v4: Keys ending with `:waiting`, `:active`, `:id`, or `:delayed`. Format: `<prefix>:<queueName>:<status>`.
- **Docker Host Translation**: Resolves `localhost` and `127.0.0.1` to `host.docker.internal` or `process.env.REDIS_HOST` if running inside a container (`/.dockerenv` check).

### 3. Dynamic Board Manager (`packages/server/src/services/boardManager.ts`)
- **Dynamic Board Instantiation**: Uses `@bull-board/api`'s `createBullBoard` paired with `@bull-board/express`'s `ExpressAdapter`.
- **Router Caching**: Boards are cached in-memory for 60 seconds unless a request specifies `?refresh=true`.
- **Queue Adapters**: Automatically wraps discovered queues with `BullMQAdapter` or `BullAdapter` including display names and prefix segmentation.
- **Lifecycle Clean-up**:
  - Automatically identifies queues removed from Redis and invokes `queue.close()`.
  - Exposes `invalidateInstance(instanceId)` which closes all active connections and wipes the cached router when an instance's configuration is modified.

### 4. REST Endpoints (`packages/server/src/routes/`)
- **`/api/instances`**:
  - `GET /`: Lists all instances with real-time ping latency and online/offline status.
  - `POST /`: Adds a new Redis instance.
  - `GET /:id`: Retrieves single instance configuration (password is masked).
  - `PUT /:id`: Updates instance settings.
  - `DELETE /:id`: Removes instance.
  - `POST /test`: Tests connection with host, port, credentials, db, tls.
  - `GET /:id/databases`: Returns keyspace info for all 16 Redis DBs.
  - `GET /:id/queues`: Returns discovered Bull/BullMQ queues for an instance.
- **`/api/instances/:instanceId/board/*`**:
  - Proxies directly to the cached Express router for that instance and DB.
  - Accepts DB override via query `?db=0` or HTTP header `x-redis-db: 0`.

## Validation Checklist

1. When adding or modifying server routes, verify parameter sanitization (e.g. passwords never returned in plain text).
2. When changing Redis interaction logic, confirm cursor-based `SCAN` is preserved.
3. Test with `corepack yarn build` and run `corepack yarn dev:server` to verify route behavior.
