# Bull Board Standalone (Redis-Insight Edition) - Agent Operating Manual

Welcome to **Bull Board Standalone**, a multi-instance Redis monitoring dashboard and queue manager built on top of Bull and BullMQ. This repository is configured to operate with AI coding agents under strict architectural, linting, and formatting standards.

This manual serves as the single source of truth for repository structure, coding rules, toolchains, workflow conventions, and backend/frontend standards.

---

## 1. Project Overview & Architecture

Bull Board Standalone is a Yarn Berry monorepo providing a complete queue inspection and administration platform with zero runtime external database dependencies.

### Monorepo Workspaces Layout (`packages/*`)

| Workspace | Package Name | Description & Role |
| :--- | :--- | :--- |
| **`packages/api`** | `@bull-board/api` | Core Bull / BullMQ queue adapters (`bullAdapter`, `bullMQAdapter`, `bullMQProAdapter`), queue typing definitions, schemas, and `valibot` request validators. |
| **`packages/express`**| `@bull-board/express` | Express.js adapter wrapper that bridges `@bull-board/api` to Express router endpoints and renders EJS views. |
| **`packages/server`** | `@bull-board/server` | Standalone Node.js server (Default Port `5541`). Implements multi-instance SQLite storage (`data/instances.db`), dynamic queue auto-discovery (`redisManager.ts`), per-instance board caching (`boardManager.ts`), and REST APIs for instance lifecycle. |
| **`packages/ui`** | `@bull-board/ui` | Modern Single Page Application built with **React 19** and **Rsbuild**. Features Redis Instances Manager (`/instances`), Bull-Board Queue Dashboard (`/board`), Job Inspector, Flows tree, Schedulers, and Metrics. |

---

## 2. Tooling, Engine & Environment Rules

### Package Manager & Scripts
- **Package Manager**: **Yarn 4 Berry** (`yarn@4.17.0`) with Corepack.
- **Commands Execution**: Always prefix yarn commands with `corepack yarn` (e.g., `corepack yarn build`, `corepack yarn dev`). Do **NOT** use `npm`, `npx` (unless for schemas/utilities), or `pnpm`.
- **Node.js Requirement**: **Node.js >= 22.0.0** is strictly required because the backend leverages the native `node:sqlite` module without native C++ compilation bindings.

### Core CLI Commands
```bash
# Install dependencies
corepack yarn install

# Start development (runs UI on Rsbuild and Server on ts-node-dev concurrently)
corepack yarn dev

# Start server only in dev mode
corepack yarn dev:server

# Start UI only in dev mode
corepack yarn dev:ui

# Build all workspace packages
corepack yarn build

# Clean all workspace dist directories
corepack yarn clean

# Linting with oxlint
corepack yarn lint:check
corepack yarn lint           # with --fix

# Formatting with oxfmt
corepack yarn format:check
corepack yarn format

# Local Redis development containers
corepack yarn dev:docker     # docker compose -f docker-compose.redis.yml up -d
```

---

## 3. Mandatory Coding Standards & Constraints

### A. Linting & Formatting Rules (`oxlint` & `oxfmt`)
- **No `console.log`**: Standard `console.log` is strictly forbidden by `.oxlintrc.json`. Use `console.warn(...)` or `console.error(...)` for diagnostic logging, or use conditional debug handlers.
- **Unused Variables**: Any unused variable or parameter must begin with an underscore `_` (e.g., `_req`, `_res`, `_err`).
- **Formatting (`.oxfmtrc.json`)**:
  - Quotes: Single quotes (`'`).
  - Trailing Commas: ES5 format.
  - Print Width: 100 characters.
  - Package JSON & Imports: Auto-sorted without extra newlines between import blocks.

### B. Server Architecture & Persistence (`packages/server`)
- **Database (`instanceStore.ts`)**:
  - Uses native Node.js SQLite: `import { DatabaseSync } from 'node:sqlite'`.
  - Database file path must always resolve to `path.resolve(process.cwd(), 'data/instances.db')`.
  - Ensure the `data/` directory exists before initialization.
- **Queue Auto-Discovery (`redisManager.ts`)**:
  - **Never** execute blocking `KEYS *` queries. Always use cursor-based non-blocking `SCAN` with `COUNT 1000` and iteration safeguards (e.g. limit to 100 iterations max).
  - Inspect `:meta` keys for BullMQ queues and `:waiting` / `:active` / `:id` keys for Bull queues.
  - Connection pooling: Cache client instances by `${instanceId}::${db}` to prevent Redis connection exhaustion.
- **Dynamic Board Router (`boardManager.ts`)**:
  - Board routers are cached in memory for 60 seconds unless `forceRefresh=true` is requested.
  - When an instance is updated or deleted, invoke `boardManager.invalidateInstance(id)` to immediately discard cached routes and close underlying connections.

### C. UI Architecture & Guidelines (`packages/ui`)
- **Styling**:
  - Use **Vanilla CSS** and **CSS Modules** (`*.module.css`).
  - Do **NOT** use Tailwind CSS or introduce ad-hoc utility classes.
  - Respect existing CSS design tokens defined in [theme.css](file:///c:/Users/user/Desktop/apps/bull-board/packages/ui/src/theme.css) and [index.css](file:///c:/Users/user/Desktop/apps/bull-board/packages/ui/src/index.css).
- **Component Primitives**:
  - Use headless primitives from `@base-ui/react` (e.g. `Tooltip`, `Dialog`).
  - Icons are provided by `lucide-react` or custom SVG components in `packages/ui/src/components/Icons`.
- **State Management**:
  - Global user preferences: `useSettingsStore` (Zustand with localStorage persistence).
  - Selected Redis instance & database: `useInstanceStore` (`packages/ui/src/hooks/useInstanceStore.ts`).
  - Server data fetching: TanStack React Query v5.
- **Multi-Instance API Routing (`Api.ts`)**:
  - When an active instance is set in `useInstanceStore`, Axios requests automatically forward queue operations to `/api/instances/:instanceId/board/api/*` and attach the `x-redis-db` header.
  - Instance CRUD requests are directly routed to `/api/instances`.

---

## 4. Docker & Production Deployment

- **Multi-Stage Build (`Dockerfile`)**:
  - Stage 1: `node:22-alpine` builder. Builds all workspaces, executes `corepack yarn workspaces focus --production @bull-board/server`, and prunes unnecessary files (`*.d.ts`, `*.map`, `tests/`, `examples/`).
  - Stage 2: `alpine:3.21` runner with `nodejs` and `tzdata`. Copies only production `node_modules` and compiled `dist` files.
- **Volumes**:
  - Mount `/app/data` to persist `instances.db` across container restarts.
- **Networking**:
  - In Docker, `localhost` / `127.0.0.1` refers to the container itself. `redisManager` automatically detects `/.dockerenv` and resolves local hostnames to `host.docker.internal` or `process.env.REDIS_HOST`.
- **Health Check**:
  - Validates `GET /health` with HTTP 200 response.

---

## 5. Agent Verification Checklist

When contributing or refactoring code in this repository, execute the following steps before completing a task:

1. **Verify TypeScript compilation**:
   ```bash
   corepack yarn build
   ```
2. **Verify Linter compliance**:
   ```bash
   corepack yarn lint:check
   ```
   *(Ensure no `console.log` statements remain and unused arguments are prefixed with `_`)*.
3. **Verify Code Formatting**:
   ```bash
   corepack yarn format:check
   ```
   *(Run `corepack yarn format` if formatting checks fail)*.

---

## 6. Workspace Skills Index

The repository provides modular operational runbooks inside `.agents/skills/`:

- **[`bull-board-dev-workflow`](file:///.agents/skills/bull-board-dev-workflow/SKILL.md)**: Setting up, developing, running, and verifying the Bull Board application.
- **[`bull-board-lint-format`](file:///.agents/skills/bull-board-lint-format/SKILL.md)**: Running oxlint and oxfmt, resolving linting violations and formatting rules.
- **[`bull-board-server-architecture`](file:///.agents/skills/bull-board-server-architecture/SKILL.md)**: Managing Redis connections, SQLite storage, queue scanning, and dynamic Bull Board routing.
- **[`bull-queue-management`](file:///.agents/skills/bull-queue-management/SKILL.md)**: Instantiating, configuring, discovering, and operating Bull (v3/v4) queues on the backend.
- **[`bull-board-ui-development`](file:///.agents/skills/bull-board-ui-development/SKILL.md)**: Building React 19 UI components with Rsbuild, CSS Modules, Zustand, and Base UI.
- **[`bull-board-docker-build`](file:///.agents/skills/bull-board-docker-build/SKILL.md)**: Building minimal Docker images, configuring volume persistence, and managing container runtime.
