# Deployment

`timer` runs in production at **https://timer.musel.dev** — an Oracle Cloud VM (ARM64), in Docker,
behind nginx. Same pattern as `math.musel.dev`.

## Architecture

```
browser → timer.musel.dev   (DNS A record → 145.241.168.188)
        → nginx :443         TLS termination (Let's Encrypt) + HSTS
        → 127.0.0.1:8002
        → Docker container "timer"   (Hono on :8080, serves SPA + /api)
        → SQLite at /data/timer.db   (Docker named volume "timer_timer-data")
```

- **Container** — built from `Dockerfile` (multi-stage: builds the React SPA + the server bundle,
  runs on `node:24-bookworm-slim`). Declared in `compose.yaml`, bound to `127.0.0.1:8002`,
  `restart: unless-stopped`.
- **Data** — SQLite lives in the named volume `timer_timer-data` (mounted at `/data`), so it
  survives image rebuilds. The app reads `TIMER_DB=/data/timer.db`.
- **Auth** — the app has its own login (closed signup). On first boot it creates a single account
  from `ADMIN_EMAIL` / `ADMIN_PASSWORD` and seeds the default habits.
- **Reverse proxy** — nginx vhost `deploy/nginx-timer.musel.dev.conf` terminates TLS.
- **TLS** — Let's Encrypt via certbot (webroot mode), auto-renewed by the certbot systemd timer.

## Server layout

- Host: `ubuntu@145.241.168.188` (ssh alias `my-vps`)
- Repo checked out at `~/timer` (tracks `main`)
- Ports 80/443 already open (host iptables + Oracle VCN Security List)

## First-time setup

```bash
# 0. DNS: add an A record  timer.musel.dev → 145.241.168.188  (or a *.musel.dev wildcard)

# 1. Clone
ssh my-vps
git clone https://github.com/musel25/timer.git ~/timer
cd ~/timer

# 2. Secrets
cp .env.example .env
# edit .env: set a random SESSION_SECRET and your ADMIN_EMAIL / ADMIN_PASSWORD
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. TLS certificate (DNS must resolve first). Open a temporary :80 vhost for the
#    ACME challenge, then request the cert:
sudo cp deploy/nginx-timer.musel.dev.conf /etc/nginx/sites-available/timer.musel.dev
# (comment out the 443 server block on first run, or run certbot --nginx)
sudo certbot certonly --webroot -w /var/www/html -d timer.musel.dev

# 4. Enable the full vhost
sudo ln -sf /etc/nginx/sites-available/timer.musel.dev /etc/nginx/sites-enabled/timer.musel.dev
sudo nginx -t && sudo systemctl reload nginx

# 5. Build + run
docker compose up -d --build
```

Visit https://timer.musel.dev and log in.

## Deploy an update

```bash
ssh my-vps
cd ~/timer
git pull
docker compose up -d --build   # the named volume preserves the database
```

## Operations

```bash
docker compose ps          # status / health
docker compose logs -f     # follow logs
docker compose restart
docker compose down        # stop (data kept in the volume)
```

## Back up the database

```bash
docker run --rm \
  -v timer_timer-data:/data \
  -v "$PWD":/backup \
  busybox cp /data/timer.db /backup/timer-backup.db
```

You can also export all data as JSON from the in-app **Settings → Export**.

## TLS certificate

certbot auto-renews via a systemd timer.

```bash
sudo certbot certificates
systemctl list-timers | grep certbot
```
