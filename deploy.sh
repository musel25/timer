#!/usr/bin/env bash
# Deploy timer to production (timer.musel.dev on the Oracle VPS).
#
# Ships whatever is on origin/master. Order matters:
#   1. tag the running image as timer:prev  → there is always a rollback target
#   2. build the new image                  → the live container keeps serving
#   3. swap and wait for the healthcheck    → auto-rollback to timer:prev on failure
#   4. verify the edge answers 200 over HTTPS
#
# The 2026-08-06 outage happened because none of this existed: `compose up -d
# --build` replaced the only image in place, the new one crash-looped (exit 133,
# seconds AFTER logging "listening" — a boot that looks fine and isn't), and
# there was nothing to roll back to.
set -euo pipefail

HOST=my-vps

ssh "$HOST" bash -s <<'REMOTE'
set -euo pipefail
cd ~/timer
git pull --ff-only

# 1. Keep the currently-running image reachable before anything can clobber it.
if docker image inspect timer:latest >/dev/null 2>&1; then
  docker tag timer:latest timer:prev
fi

# 2. Build without touching the running container.
docker compose build

# 3. Swap, then trust only the healthcheck (30s interval, 15s start period —
#    give it a couple of full probes before judging).
docker compose up -d
for i in $(seq 1 24); do
  sleep 5
  status=$(docker compose ps --format '{{.Status}}')
  case "$status" in
    *healthy*) echo "container: $status"; exit 0 ;;
    *Restarting*|*Exited*)
      echo "DEPLOY FAILED ($status) — rolling back to timer:prev" >&2
      docker tag timer:prev timer:latest
      docker compose up -d --no-build
      exit 1 ;;
  esac
done
echo "DEPLOY FAILED: healthcheck never went green — rolling back" >&2
docker tag timer:prev timer:latest
docker compose up -d --no-build
exit 1
REMOTE

# 4. The container being healthy isn't the same as the site being up.
code=$(curl -s -o /dev/null -w '%{http_code}' https://timer.musel.dev/api/health)
echo "edge: https://timer.musel.dev/api/health → $code"
[ "$code" = 200 ]
