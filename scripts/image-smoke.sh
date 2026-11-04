#!/usr/bin/env bash
# Keep the real image running across several probes to catch delayed exits.
set -euo pipefail
image=${1:?Usage: image-smoke.sh IMAGE REVISION}
revision=${2:?Usage: image-smoke.sh IMAGE REVISION}
name="timer-smoke-$$"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$name" "$image" >/dev/null
healthy=0
for ((i=0; i<24; i++)); do
  status=$(docker inspect --format '{{.State.Health.Status}}' "$name")
  if [[ "$status" == healthy ]]; then healthy=1; break; fi
  if [[ "$status" == unhealthy ]]; then break; fi
  sleep 5
done
if (( ! healthy )); then docker logs "$name"; exit 1; fi
for ((i=0; i<3; i++)); do
  docker exec "$name" node -e 'fetch("http://localhost:8080/api/health").then(async r=>{const h=await r.json();if(!r.ok||h.revision!==process.argv[1])process.exit(1)}).catch(()=>process.exit(1))' "$revision"
  sleep 5
done
