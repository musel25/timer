# timer

React + Vite PWA in `client/`. Node 22 + Hono + SQLite in `server/`.
One Docker container serves the client and API.
Production: https://timer.musel.dev on the Oracle VPS (`ssh my-vps`).
The container binds to 127.0.0.1:8002 behind nginx and certbot.

This file is the main source of project instructions. Keep README.md and
DEPLOY.md consistent with it. CLAUDE.md imports this file.

## Change workflow

1. Use a topic branch. Preserve unrelated user changes. Read the affected
   feature and its tests before editing.
2. Add a regression test before changing behavior.
3. Keep one feature or fix in each Conventional Commit.
4. Run `npm run verify` before committing. It checks types, tests, deploy
   failure cases, and the production build. Do not disable checks to pass.
5. Push each commit. Use `git push -u origin <branch>` for a new branch.
6. Deploy each pushed change with `./deploy.sh` from a clean checkout.
7. Create a reviewable pull request. Follow the current session authorization
   for merging and deployment. Do not rewrite shared history or force-push.
8. Report the deployed revision and the check results.

Historical plans record past scope. They do not authorize a new merge,
deployment, or production-data change.

A change is complete only when production serves its revision. If deployment
fails or the user defers it, state that the change is not live.

`deploy.sh` is the only deployment path. It verifies the local checkout,
requires the commit on origin, deploys that exact commit, and locks concurrent
remote deployments. It keeps the running image as `timer:prev`, builds while
the old container serves, and rolls back after startup, health, edge, or
revision failure. It cannot reverse database migrations.

Do not run `docker compose up -d --build` on the VPS. This replaces the only
image tag before a delayed crash can be detected.

Manual rollback:
`ssh my-vps 'cd ~/timer && docker tag timer:prev timer:latest && docker compose up -d --no-build'`

## Runtime and dependencies

- Keep `.nvmrc`, package `engines`, CI, Docker, and esbuild on Node 22.
- Docker uses `node:22-bookworm-slim`. better-sqlite3 11 caused delayed crashes
  on Node 24. A Node upgrade requires better-sqlite3 12 or later and a test of
  the actual production image. See `./scripts/image-smoke.sh`.
- Commit all lockfiles. Use `npm ci` for setup and image builds. Add packages
  with `npm install <package>` in the affected package and commit its lockfile.
- CI runs `npm run verify`, builds the image, and checks the running image.

## Local development

- Run `npm run install:all` with Node 22.
- Copy `.env.example` to `server/.env` and set admin credentials for a new DB.
- Run `npm run dev`: server on localhost:8080, client on 5173.
- Run `npm test` for all tests. Use `npm --prefix server test -- <file>` or
  `npm --prefix client test -- <file>` for a focused test.
- The optional Claude Code dashboard is local only. Keep its token and host
  binding consistent with the installer in `scripts/install-cc-dashboard.sh`.

## Code boundaries

- `server/src/api.ts` composes feature routes. New API routes require auth by
  default. Public exceptions must use an exact method/path allowlist and tests.
- Keep API input validation and ownership checks at the server boundary.
- Keep timer calculations separate from React components.
- Use typed contexts. Avoid `any` for request bodies and API responses.
- For database changes, update raw SQL and `addColumnIfMissing` in db.ts,
  Drizzle definitions in schema.ts, and affected client types. Keep upgrade
  tests and schema consistency checks green. Preserve old database upgrades.
- Old PWA clients can have stale fields. Treat missing additive fields as their
  zero value. Do not cache authenticated API responses in the service worker.
- Keep pending offline sessions bound to their account. Do not assign an
  unowned legacy queue to the next account that signs in.
- Backups must preserve all Planner records, including rest and vacation days.
  Keep old backup imports valid. Do not export integration secrets.
