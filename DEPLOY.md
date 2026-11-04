# Deployment

Production: https://timer.musel.dev. The Oracle VPS uses the SSH alias `my-vps`.
nginx terminates TLS and sends requests to 127.0.0.1:8002. One container serves
the React app and Hono API on port 8080. SQLite is stored in the persistent
`timer_timer-data` Docker volume at `/data/timer.db`.

## Requirements

- Local Node 22 and dependencies installed with `npm run install:all`.
- SSH access to `my-vps` and Docker Compose on the VPS.
- Repository cloned at `~/timer` on the VPS with access to origin.
- nginx configured from `deploy/nginx-timer.musel.dev.conf` and a valid TLS
  certificate. Enable the vhost after `nginx -t` passes.
- A VPS `.env` created from `.env.example` with admin credentials. Compose sets
  `NODE_ENV=production` and the persistent database path.

The image uses `node:22-bookworm-slim`. Keep Node, better-sqlite3, esbuild, and
CI versions consistent. See [AGENTS.md](AGENTS.md).

## Deploy

```bash
npm run verify
git add <changed-files>
git commit -m "fix: describe the change"
git push -u origin <branch>
./deploy.sh
```

Use `./deploy.sh` for first deployment and updates. Do not build and replace
production with `docker compose up -d --build`.

The script requires a clean checkout and a commit on origin. It runs the full
verification command. It fetches and checks out that exact commit on the VPS.
The VPS checkout uses detached HEAD so a pushed branch can be tested without
selecting a different commit from a moving branch.

The script locks concurrent deployments and tags the running image as
`timer:prev`. It builds the candidate while the old container serves. It then
swaps containers and checks the exact Docker health state. Finally, it checks
HTTPS `/api/health` and requires its `revision` to equal the deployed commit.
Startup, health, edge, and revision failures restore the previous image. A
failed first deployment has no previous image to restore. A rollback restores
the image; it does not reverse database migrations.

CI also builds the actual image and runs `scripts/image-smoke.sh` across
several health probes to catch delayed process exits.

## Roll back manually

```bash
ssh my-vps 'cd ~/timer && docker tag timer:prev timer:latest && docker compose up -d --no-build'
curl --fail https://timer.musel.dev/api/health
```

Check the returned revision and container health before reporting recovery.

## Operations

```bash
ssh my-vps
cd ~/timer
docker compose ps
docker compose logs -f
```

## Back up the database

Use SQLite's online backup API. A file copy of a live WAL database can omit
recent transactions. Back up before a database change.

```bash
ssh my-vps
cd ~/timer
docker exec timer node --input-type=module -e 'import Database from "better-sqlite3"; const db = new Database(process.env.TIMER_DB); await db.backup("/data/timer-backup.db"); db.close();'
docker cp timer:/data/timer-backup.db ./timer-backup.db
```

Store a copy outside the VPS. The app's Settings export is a separate JSON
backup of Planner data. It excludes account credentials and integration
secrets. A database backup also includes Grind account progress.

## TLS

certbot renews certificates with its systemd timer.

```bash
sudo certbot certificates
systemctl list-timers | grep certbot
```
