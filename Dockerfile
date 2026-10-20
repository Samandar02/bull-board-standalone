# Stage 1: Build & Prune
FROM node:22-alpine AS builder

WORKDIR /app
COPY . .

# Enable corepack and install dependencies
RUN corepack enable && corepack yarn install

# Build all workspaces
RUN corepack yarn build

# Prune devDependencies to keep only production packages for @bull-board/server
RUN corepack yarn workspaces focus --production @bull-board/server

# Strip non-runtime bloat from node_modules (source maps, type definitions, docs, tests, unneeded tools)
RUN find /app/node_modules -type f \( \
        -name "*.d.ts" -o -name "*.ts" -o -name "*.map" -o -name "*.md" -o \
        -name "CHANGELOG*" -o -name "README*" -o -name "LICENSE*" -o \
        -name "*.flow" -o -name "*.patch" \
    \) -delete && \
    find /app/node_modules -type d \( \
        -name "test" -o -name "tests" -o -name "docs" -o -name ".bin" -o \
        -name "example" -o -name "examples" -o -name "coverage" -o \
        -name ".github" \
    \) -exec rm -rf {} + 2>/dev/null || true && \
    rm -rf /app/node_modules/node-gyp /app/node_modules/tar /app/node_modules/minipass

# Stage 2: Ultra-Minimal Production Runner using lightweight Alpine + Node.js
FROM alpine:3.21 AS runner

RUN apk add --no-cache nodejs tzdata

WORKDIR /app
ENV NODE_ENV=production \
    PORT=5541 \
    HOST=0.0.0.0

# Copy root workspace definition and stripped production node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Copy only the compiled dist and required runtime files for each package
COPY --from=builder /app/packages/api/package.json ./packages/api/package.json
COPY --from=builder /app/packages/api/dist ./packages/api/dist
COPY --from=builder /app/packages/api/bullMQAdapter.js ./packages/api/bullMQAdapter.js
COPY --from=builder /app/packages/api/bullAdapter.js ./packages/api/bullAdapter.js

COPY --from=builder /app/packages/express/package.json ./packages/express/package.json
COPY --from=builder /app/packages/express/dist ./packages/express/dist

COPY --from=builder /app/packages/ui/package.json ./packages/ui/package.json
COPY --from=builder /app/packages/ui/dist ./packages/ui/dist

COPY --from=builder /app/packages/server/package.json ./packages/server/package.json
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/docs ./docs

VOLUME ["/app/data"]
EXPOSE 5541

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD \
    node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5541)+'/health').then(r=>process.exit(r.status===200?0:1),()=>process.exit(1))"

CMD ["node", "packages/server/dist/index.js"]
