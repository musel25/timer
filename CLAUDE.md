# timer

React+Vite PWA (`client/`) + Node/Hono+SQLite server (`server/`), shipped as one
Docker container. Production: **https://timer.musel.dev** on the Oracle VPS
(`ssh my-vps`), container on 127.0.0.1:8002 behind nginx + certbot.

## A change is not done until it is live

After every committed + pushed change, deploy it:

```bash
./deploy.sh
```

Never report a change as finished while prod still runs the old commit. If a
deploy must wait (user says so, or the change is intentionally unfinished), say
that explicitly.

`deploy.sh` is the only sanctioned deploy path. Do **not** hand-run
`docker compose up -d --build` on the VPS: it replaces the only image tag in
place with no rollback, and a bad image can crash-loop *after* logging
"listening" (see below). The script tags the running image as `timer:prev`,
builds while the old container keeps serving, swaps only on a green
healthcheck, auto-rolls-back otherwise, and verifies the edge returns 200.

Manual rollback, if ever needed:
`ssh my-vps 'cd ~/timer && docker tag timer:prev timer:latest && docker compose up -d --no-build'`

## Version pins that must not drift apart

- **Dockerfile is pinned to `node:22-bookworm-slim`** — matches the esbuild
  target (`--target=node22`) and the Node the test suite runs under.
  better-sqlite3 ^11 does not run on Node 24: `Statement::~Statement()` trips
  node's `RemoveEnvironmentCleanupHook` assertion and the process exits 133 a
  few seconds after startup (this took prod down on 2026-08-06 when the
  unpinned `node:24` base re-pulled). Do not bump Node without moving
  better-sqlite3 to ^12 — and test the actual image, not just the suite.
- Lockfiles are committed and the image builds with `npm ci`. Never switch back
  to `npm install` in the Dockerfile; add deps with `npm install <pkg>` locally
  so the lockfile updates, and commit both files.

## Local dev

- Server: `cd server && npx tsx src/index.ts` (port 8080). Fresh DB: seed with
  `ADMIN_EMAIL=... ADMIN_PASSWORD=...` env on first start.
- Client: `cd client && npm run dev` (port 5173, proxies `/api`).
- Tests: `npx vitest run` in each of `server/` and `client/`.
- The PWA service worker caches `/api` responses (NetworkFirst) — after schema
  changes, a stale cached response must not break the UI; treat missing fields
  as their zero value (see `isArchived` in `client/src/features/notes/`).

## Conventions

- Auth is opt-in per route prefix in `server/src/api.ts` — new API routes are
  public until you register `requireAuth` for them.
- Schema changes: raw `CREATE TABLE` in `server/src/db.ts` **plus**
  `addColumnIfMissing(...)` for existing DBs, mirrored in `server/src/schema.ts`
  (drizzle) and `client/src/lib/types.ts`.
