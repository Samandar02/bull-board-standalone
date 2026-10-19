---
name: bull-board-docker-build
description: >-
  Use this skill when building, testing, or troubleshooting Docker images and container deployments for Bull Board Standalone.
---

# Bull Board Docker Build & Container Deployment

This skill guides agents through building the minimal production Docker container and configuring persistent volumes.

## Dockerfile Design

The Docker image employs a two-stage build designed to keep the final image minimal, secure, and fast:

1. **Stage 1: `builder` (`node:22-alpine`)**:
   - Enables Corepack and runs `corepack yarn install`.
   - Executes `corepack yarn build` across all workspaces.
   - Executes `corepack yarn workspaces focus --production @bull-board/server` to prune devDependencies.
   - Cleans up non-runtime files (`*.d.ts`, `*.ts`, `*.map`, `tests/`, `examples/`).

2. **Stage 2: `runner` (`alpine:3.21`)**:
   - Installs minimal runtime dependencies: `nodejs` and `tzdata`.
   - Copies only the pruned production `node_modules` and compiled `dist/` folders.
   - Exposes Port `5541`.
   - Defines volume `/app/data` for SQLite persistence.
   - Includes a native `fetch()` healthcheck against `/health`.

---

## Step-by-Step Procedures

### 1. Building the Docker Image
```bash
docker build -t bull-board-standalone:latest .
```

### 2. Running the Container with Persistent Storage
Map host directory or named volume to `/app/data`:
```bash
docker run -d \
  --name bull-board \
  -p 5541:5541 \
  -v bull_board_data:/app/data \
  bull-board-standalone:latest
```

### 3. Connecting to Host Redis from Container
When running inside Docker:
- On Docker for Mac / Windows: `host.docker.internal` allows reaching the host machine's Redis on port 6379.
- On Linux: use `--add-host=host.docker.internal:host-gateway` or specify `REDIS_HOST`:
```bash
docker run -d \
  --name bull-board \
  -p 5541:5541 \
  -e REDIS_HOST=172.17.0.1 \
  -v bull_board_data:/app/data \
  bull-board-standalone:latest
```

### 4. Validating Container Health
```bash
# Check container status
docker ps --filter name=bull-board

# Direct health query
curl http://localhost:5541/health
```

## Validation Checklist

1. Verify image builds without missing workspace packages.
2. Confirm the `/health` endpoint responds with HTTP 200 `{"status":"ok"}`.
3. Restart container and confirm newly added Redis instances remain preserved in `/app/data/instances.db`.
