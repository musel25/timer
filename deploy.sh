#!/usr/bin/env bash
# Verify this checkout, deploy its exact pushed commit, and roll back on failure.
set -euo pipefail
cd "$(dirname "$0")"

revision=$(git rev-parse --verify 'HEAD^{commit}')
if [[ -n $(git status --porcelain) ]]; then
  echo 'DEPLOY REFUSED: commit all changes before deployment.' >&2
  exit 1
fi
git fetch origin
if [[ -z $(git branch -r --contains "$revision" --list 'origin/*') ]]; then
  echo 'DEPLOY REFUSED: push this commit before deployment.' >&2
  exit 1
fi
npm run verify
if [[ $(git rev-parse --verify 'HEAD^{commit}') != "$revision" || -n $(git status --porcelain) ]]; then
  echo 'DEPLOY REFUSED: the checkout changed during verification.' >&2
  exit 1
fi

ssh -o BatchMode=yes -o ConnectTimeout=15 my-vps bash -s -- "$revision" <<'REMOTE'
set -euo pipefail
revision=$1
cd ~/timer
# Only one build/swap may own the rollback tag at a time.
exec 9> /tmp/timer-deploy.lock
flock -n 9 || { echo 'DEPLOY REFUSED: another deployment is running.' >&2; exit 1; }
if [[ -n $(git status --porcelain) ]]; then
  echo 'DEPLOY REFUSED: the server checkout has local changes.' >&2
  exit 1
fi
git fetch origin
if [[ -z $(git branch -r --contains "$revision" --list 'origin/*') ]]; then
  echo 'DEPLOY REFUSED: requested commit is not on origin.' >&2
  exit 1
fi
git checkout --detach "$revision"

previous=$(docker inspect --format '{{.Image}}' timer 2>/dev/null || true)
if [[ -n "$previous" ]]; then
  docker tag "$previous" timer:prev
fi
swapped=0
rollback() {
  local result=$?
  trap - ERR
  if (( swapped )) && [[ -n "$previous" ]]; then
    echo 'DEPLOY FAILED: restoring the previous running image.' >&2
    docker tag "$previous" timer:latest
    if docker compose up -d --no-build; then
      for ((i=0; i<24; i++)); do
        status=$(docker inspect --format '{{.State.Health.Status}}' timer 2>/dev/null || true)
        if [[ "$status" == healthy ]]; then
          echo 'Previous container is healthy.' >&2
          exit "$result"
        fi
        sleep 5
      done
    fi
    echo 'ROLLBACK FAILED: inspect the timer container immediately.' >&2
  elif (( swapped )); then
    echo 'DEPLOY FAILED: no previous image exists for rollback.' >&2
  fi
  exit "$result"
}
trap rollback ERR

# Build while the previous container keeps serving.
docker compose build --build-arg "APP_REVISION=$revision"
swapped=1
docker compose up -d
healthy=0
for ((i=0; i<24; i++)); do
  status=$(docker inspect --format '{{.State.Health.Status}}' timer 2>/dev/null || true)
  case "$status" in
    healthy) healthy=1; break ;;
    unhealthy) break ;;
  esac
  sleep 5
done
if (( ! healthy )); then
  echo "DEPLOY FAILED: container health is ${status:-unknown}." >&2
  false
fi
# Edge reachability and revision are both part of the rollback boundary.
edge=$(curl --fail --silent --show-error --max-time 15 https://timer.musel.dev/api/health)
docker exec timer node -e 'const h=JSON.parse(process.argv[1]); if(h.ok!==true || h.revision!==process.argv[2]) process.exit(1)' "$edge" "$revision"
echo "Live revision: $revision"
REMOTE
