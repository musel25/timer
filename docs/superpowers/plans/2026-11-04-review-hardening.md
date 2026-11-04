# Review hardening implementation plan

> **For agentic workers:** Use regression tests before behavior changes. Execute the approved review fixes in this session.

**Status:** Implementation and task reviews are complete. Deployment attempts fail because SSH to the configured VPS times out. This historical plan does not authorize future merges or deployments.

**Goal:** Resolve the code and agent workflow findings from the review.
**Architecture:** Keep React, Hono, SQLite, and one Docker container. Split API routes by feature. Keep existing database migrations, with an automatic schema consistency check.
**Tech Stack:** Node 22, TypeScript, Vitest, Bash, Docker, GitHub Actions.
**Spec:** The review and the user's instruction to fix all findings in this session.

## Global constraints

- Keep Node 22 and better-sqlite3 11 compatible.
- Use committed lockfiles and npm ci.
- Preserve existing data and API paths.
- Commit each complete unit, push it, and deploy with deploy.sh.
- Use short, clear progress updates.

## Review focus

- An unhealthy container must cause rollback.
- Deploy only the tested, pushed revision and verify that revision at the edge.
- A session queued during upload must survive upload failure.
- Account changes must not expose cached data or send another account's queue.
- Existing database upgrades and old JSON backups must remain usable.

## Task 1: Safe offline sessions and account caches

Files: client/src/lib/offlineQueue.ts and tests; client/src/App.tsx; client/src/main.tsx; client/src/features/auth/Login.tsx; client/src/features/settings/Settings.tsx; client/vite.config.ts; new cache helper if needed.

- [x] Add failing tests for overlapping queue flushes and account changes.
- [x] Bind queues to account IDs; start flushing only after account discovery; preserve unowned legacy queues without assigning them to another user.
- [x] Serialize uploads and remove only acknowledged sessions.
- [x] Remove shared API response caching and delete its old cache on service worker activation; bypass old workers with unique GET URLs during migration.
- [x] Run client tests and type checks. Review, commit, push, and attempt deployment. Record a blocked deployment explicitly.

## Task 2: Protected, focused API modules and complete backups

Files: server/src/api.ts; server/src/routes/*; server/src/auth.test.ts or new route-auth test; server/src/schema.test.ts; server/src/backup.test.ts.

- [x] Add tests proving new routes require auth and public login/health/Grind routes still work.
- [x] Register default API auth with a short exact public route allowlist.
- [x] Split API routes by feature, using typed contexts and shared request helpers.
- [x] Add a schema test that compares fresh and upgraded SQLite tables to Drizzle metadata. Keep upgrade tests.
- [x] Add export/import tests for rest and vacation dates; preserve old backup compatibility.
- [x] Run server tests. Review, commit, push, deploy.

## Task 3: Verified deployments and automatic checks

Files: deploy.sh; scripts/deploy.test.*; Dockerfile; compose.yaml; server/src/api.ts health metadata; package.json; server/package.json; server tests with type errors; .github/workflows/verify.yml; .nvmrc; package-lock.json.

- [x] Exercise deploy.sh with controlled SSH/Docker/HTTP substitutes. First show the unhealthy status failure.
- [x] Require a clean, pushed revision and npm run verify before deploy.
- [x] Deploy the exact commit. Wait for exact Docker health state. Roll back on startup, health, edge, or revision failures. Serialize remote deploys.
- [x] Add image/runtime revision metadata and verify it at the edge.
- [x] Fix test typing without disabling strictness. Add server type checks and Node version requirements.
- [x] Add npm run verify and CI for tests, types, build, deployment regressions, and the actual image.
- [x] Run all checks. Review, commit, push, deploy.

## Task 4: Consistent project instructions

Files: AGENTS.md; CLAUDE.md; README.md; DEPLOY.md; .env.example; development scripts as needed.

- [x] Track AGENTS.md as the main source. Make CLAUDE.md refer to it.
- [x] Replace stale Node and deployment instructions. Document exact verification and rollback behavior.
- [x] Correct local environment loading and database backup instructions.
- [x] Review instructions against working commands. Commit, push, deploy.

## Completion

- [x] Independent whole-change review. No actionable findings.
- [x] Final verification checks pass: 206 server tests, 288 client tests, 11 deployment cases, both type checks, and the production build.
- [ ] Production serves the final revision. SSH access is required. All completed units are pushed.
