#!/usr/bin/env bash
#
# Install the Claude Code session dashboard as an always-on local systemd --user
# service. It serves the timer app (with the /agents board enabled) on
# http://127.0.0.1:8080 and collects events from the Claude Code hooks that POST to
# localhost:8080/cc/ingest. Local only — this is NOT the timer.musel.dev deploy.
#
# Re-runnable: rebuilds, keeps your existing credentials, restarts the service.
#
#   bash scripts/install-cc-dashboard.sh
#   systemctl --user status cc-dashboard      # check
#   systemctl --user stop cc-dashboard         # free port 8080 for `npm run dev`
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$HOME/.config/cc-dashboard.env"
DATA_DIR="$HOME/.local/share/cc-dashboard"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT="$UNIT_DIR/cc-dashboard.service"
PORT="${CC_DASH_PORT:-8080}"

mkdir -p "$DATA_DIR" "$(dirname "$ENV_FILE")" "$UNIT_DIR"

if [ ! -f "$ENV_FILE" ]; then
  SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("hex"))')"
  PASS="$(node -e 'console.log(require("crypto").randomBytes(9).toString("base64url"))')"
  cat > "$ENV_FILE" <<EOF
# Local Claude Code dashboard service config (generated). Keep private.
PORT=$PORT
HOST=127.0.0.1
CC_DASH=1
TIMER_DB=$DATA_DIR/timer.db
CLIENT_DIR=$REPO/client/dist
SESSION_SECRET=$SECRET
ADMIN_EMAIL=admin@localhost
ADMIN_PASSWORD=$PASS
EOF
  chmod 600 "$ENV_FILE"
  echo "Generated $ENV_FILE"
fi

echo "Building dashboard UI + server…"
VITE_CC_DASH=1 npm --prefix "$REPO/client" run build >/dev/null
npm --prefix "$REPO/server" run build >/dev/null

cat > "$UNIT" <<EOF
[Unit]
Description=Claude Code session dashboard (local timer instance)
After=network.target

[Service]
Type=simple
WorkingDirectory=$REPO/server
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v node) $REPO/server/dist/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable cc-dashboard.service >/dev/null 2>&1 || true
# `restart` (not `enable --now`) so a rebuild is actually picked up by an
# already-running service — start it if it's stopped, reload it if it's up.
systemctl --user restart cc-dashboard.service
loginctl enable-linger "$USER" >/dev/null 2>&1 || true

echo
echo "Dashboard service is up:  http://localhost:$PORT/agents"
echo "Login:  $(grep ADMIN_EMAIL "$ENV_FILE" | cut -d= -f2)  /  $(grep ADMIN_PASSWORD "$ENV_FILE" | cut -d= -f2)"
