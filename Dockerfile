# syntax=docker/dockerfile:1
#
# Node 22, not 24, on purpose. There are no lockfiles, so every rebuild resolves
# fresh minors — and better-sqlite3 ^11 does not support Node 24: its
# Statement destructor trips `RemoveEnvironmentCleanupHook: (env) != nullptr`
# and the process dies with 133 seconds after it starts listening. Node 22 is
# also what `server/package.json` targets (esbuild --target=node22) and what the
# test suite runs on. Do not bump this without moving better-sqlite3 to ^12.

# ── deps: install server production deps (build tools present so better-sqlite3
#    compiles for arm64 if no prebuilt binary is available) ────────────────────
FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/package*.json ./
RUN npm install --omit=dev

# ── build: compile the server bundle and the React SPA ───────────────────────
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# server
COPY server/package*.json server/
RUN cd server && npm install
COPY server/ server/
RUN cd server && npm run build
# client
COPY client/package*.json client/
RUN cd client && npm install
COPY client/ client/
RUN cd client && npm run build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    TIMER_DB=/data/timer.db \
    CLIENT_DIR=/app/public
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/server/dist  ./dist
COPY --from=build /app/client/dist  ./public
COPY server/package.json ./package.json
RUN useradd -r -u 10001 appuser && mkdir -p /data && chown -R appuser /data /app
USER appuser
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
