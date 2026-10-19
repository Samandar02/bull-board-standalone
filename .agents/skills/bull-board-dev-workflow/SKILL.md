---
name: bull-board-dev-workflow
description: >-
  Use this skill when developing, building, running locally, or testing the Bull Board Standalone monorepo.
---

# Bull Board Development Workflow

This runbook guides agents through running, developing, and building the Bull Board Standalone monorepo.

## Prerequisites

- **Node.js**: Version 22.0.0 or higher (`node -v`).
- **Corepack**: Must be enabled (`corepack enable`).
- **Package Manager**: Yarn Berry 4.x (`corepack yarn`).

## Step-by-Step Procedures

### 1. Starting Redis Services for Local Development
Start the bundled Redis instance using Docker Compose:
```bash
corepack yarn dev:docker
```
This runs:
- Redis server on `localhost:6379`
- Redis Cluster on ports `7101-7103` (optional)
- PostgreSQL on port `5432` (optional)

### 2. Running in Development Mode
To start both UI and Server concurrently with hot-reloading:
```bash
corepack yarn dev
```
- **UI Dev Server**: Powered by Rsbuild at `http://localhost:3000` (proxied or direct).
- **Backend API**: Powered by `ts-node-dev` at `http://localhost:5541`.

Alternatively, run components individually:
```bash
# Terminal 1: Backend Server
corepack yarn dev:server

# Terminal 2: Frontend Rsbuild UI
corepack yarn dev:ui
```

### 3. Building All Packages
Compile TypeScript and bundle the frontend for production:
```bash
corepack yarn build
```
This runs builds in dependency topological order (`-t`) across all workspaces:
1. `@bull-board/api` -> `tsc`
2. `@bull-board/express` -> `tsc`
3. `@bull-board/ui` -> `rsbuild build`
4. `@bull-board/server` -> `tsc`

### 4. Cleaning Build Artifacts
To wipe all compiled `dist` folders:
```bash
corepack yarn clean
```

### 5. Running the Production Server Locally
After building:
```bash
corepack yarn start
```
Verify the server is healthy:
```bash
curl http://localhost:5541/health
# Response: {"status":"ok","timestamp":"..."}
```

## Validation Checklist

1. `corepack yarn build` completes with exit code 0.
2. Server responds on `http://localhost:5541/health`.
3. UI loads at `http://localhost:5541/` displaying the Redis Instances Manager page.
