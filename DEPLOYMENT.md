# Deploying Precast CRM to a VPS

This is the step-by-step guide to put Precast CRM on a public internet server. Time required: about 15 minutes from a fresh VPS to a working login screen.

The stack runs in three Docker containers:

- **db** — Postgres 16 (data persisted in a Docker volume)
- **app** — this Next.js app
- **caddy** — reverse proxy on port 80, ready to flip to HTTPS the moment you point a domain at the server

---

## What you need before you start

- A credit/debit card to pay for the VPS (~€5/mo at the cheap end)
- Your laptop's SSH public key — usually at `~/.ssh/id_ed25519.pub` or `~/.ssh/id_rsa.pub`. If you don't have one:
  ```bash
  ssh-keygen -t ed25519 -C "your-email@example.com"
  cat ~/.ssh/id_ed25519.pub
  ```
  Copy the output of `cat`.

---

## Step 1 — Create a VPS (5 min)

Pick **one** provider. They're all fine; cost and region differ.

### Option A — Hetzner (recommended for cheap + reliable, EU only)

1. Sign up at https://www.hetzner.com/cloud → "Cloud Console"
2. **New project** → **Add server**
3. Choose:
   - Location: **Helsinki** or **Nuremberg** (closest to Uzbekistan with low latency)
   - Image: **Ubuntu 24.04**
   - Type: **CX22** (€4.50/mo, 4 GB RAM, 2 vCPU) — plenty for this app
   - SSH key: paste the contents of your `.pub` file
   - Name: `precast-crm`
4. Click **Create & Buy now**. Note the IPv4 address.

### Option B — Contabo (better for Asia latency)

1. Sign up at https://contabo.com
2. **VPS S** ($6.50/mo, 8 GB RAM) → Region: **Singapore** (best for Tashkent)
3. Image: Ubuntu 24.04. Add your SSH key during setup. Note the IPv4.

### Option C — DigitalOcean

1. Sign up at https://www.digitalocean.com
2. **Create → Droplet**: Ubuntu 24.04, Basic plan, **$12/mo Regular** (2 GB RAM minimum)
3. Region: **Frankfurt** or **Singapore**. Add SSH key. Note the IPv4.

---

## Step 2 — Run the bootstrap script (3 min)

SSH into the new server. From your laptop:

```bash
ssh root@<vps-ip>
```

(First connection will ask you to confirm the host fingerprint — type `yes`.)

Once you're in, run the bootstrap:

```bash
curl -fsSL https://raw.githubusercontent.com/azizdadabaev/precast-crm/main/scripts/deploy-bootstrap.sh | bash
```

> **If the URL above is wrong** (you forked the repo or renamed it), get the correct raw URL from your GitHub repo: navigate to `scripts/deploy-bootstrap.sh`, click **Raw**, copy the URL, and substitute it in the command above.

The script will:

1. Install Docker + Docker Compose
2. Clone the repo to `/opt/precast-crm`
3. Generate `.env` with auto-generated Postgres password and JWT secret. Sets `NEXT_PUBLIC_APP_URL=http://<your-vps-ip>` automatically. Cookie security is disabled until you add a domain.
4. Build the app image and start all three containers
5. Run `prisma db push` to create database tables
6. Ask if you want to seed demo users and sample orders (say `y` for first install)

When it finishes, you'll see:

```
════════════════════════════════════════════════════════════
 Precast CRM is live.
 Open: http://<your-vps-ip>
════════════════════════════════════════════════════════════
```

---

## Step 3 — Log in

1. Open `http://<your-vps-ip>` in your browser. You should land on the login page.
2. If you said `y` to seeding, log in with the seeded admin (check `prisma/seed.ts` for credentials — usually `admin@example.com` with a known password).
3. If you skipped seeding, create your first admin manually:
   ```bash
   ssh root@<vps-ip>
   cd /opt/precast-crm
   docker compose exec app npx prisma studio
   ```
   Prisma Studio runs on the server's port 5555. To browse it from your laptop, open a second terminal and run:
   ```bash
   ssh -L 5555:localhost:5555 root@<vps-ip>
   ```
   Then go to `http://localhost:5555` on your laptop. Add a User row with role `ADMIN` and a bcrypt-hashed password (use any online bcrypt generator, cost 10).

---

## Step 4 — Useful commands

All from `/opt/precast-crm` on the VPS:

```bash
docker compose ps                    # show what's running
docker compose logs -f app           # tail app logs (Ctrl-C to stop)
docker compose logs -f caddy         # tail proxy logs
docker compose logs -f ws-bridge     # tail Blender bridge logs (owner-only feature)
docker compose down                  # stop everything (data is preserved)
docker compose up -d                 # start again
docker compose up -d --build         # rebuild after pulling new code

# Update to latest code from GitHub:
git pull && docker compose up -d --build

# Restart a single service:
docker compose restart app
docker compose restart ws-bridge

# DB shell:
docker compose exec db psql -U precast -d precast
```

### Blender Bridge (owner-only)

The `ws-bridge` service forwards saved-room data from the CRM to a
locally-running Blender. It runs as a fourth Docker container
alongside `db`, `app`, and `caddy`.

Setup:

1. **Generate a shared secret** and add it to `/opt/precast-crm/.env`:
   ```bash
   echo "BRIDGE_SECRET=$(openssl rand -hex 32)" >> .env
   ```
2. **Restart** the stack so the new env reaches the container:
   ```bash
   docker compose up -d
   ```
3. **In Blender**, install the precast addon and paste the same
   secret into the addon's preferences. The addon connects to
   `wss://<your-host>/ws?secret=<BRIDGE_SECRET>` (or `ws://…` if no
   TLS yet).

The `/ws` route is proxied by Caddy automatically (see `Caddyfile`).
Port 8765 is **not** published — it's only reachable via the `/ws`
HTTP path. The internal HTTP port 8766 (`/flush` + `/status` for the
Next.js app to consult) stays on the compose network only.

**Schema migration**: this feature adds a `drawing_requests` table.
The schema is synced by `prisma db push` inside the app container on
boot. If you want to verify:
```bash
docker compose exec app npx prisma db push
```

---

## Step 5 — Add a domain (when you're ready)

Skip this until you've bought a domain (Namecheap / Cloudflare Registrar / GoDaddy — ~$10/yr).

1. **Point a DNS A record** at the VPS IP. In your registrar's DNS panel:
   - Type: `A`
   - Host/Name: `crm` (or `@` for the root)
   - Value: `<vps-ip>`
   - TTL: `300`
   - Wait ~5 min for propagation. Verify with `dig crm.yourdomain.com +short` (should show your VPS IP).

2. **Edit Caddyfile** on the VPS:
   ```bash
   ssh root@<vps-ip>
   nano /opt/precast-crm/Caddyfile
   ```
   Change the first line from:
   ```
   :80 {
   ```
   to:
   ```
   crm.yourdomain.com {
   ```

3. **Edit `.env`** to flip cookies to secure mode:
   ```bash
   nano /opt/precast-crm/.env
   ```
   - Change `NEXT_PUBLIC_APP_URL=http://<ip>` → `NEXT_PUBLIC_APP_URL=https://crm.yourdomain.com`
   - Change `COOKIE_SECURE=false` → `COOKIE_SECURE=true` (or delete the line)

4. **Restart**:
   ```bash
   cd /opt/precast-crm
   docker compose up -d
   ```

   Caddy automatically requests a Let's Encrypt cert on the first incoming HTTPS request. Watch logs for confirmation:
   ```bash
   docker compose logs -f caddy
   ```
   Look for `certificate obtained successfully`. Done.

---

## Troubleshooting

**Login screen loads but submitting does nothing / loops.**
The auth cookie isn't being delivered. On HTTP (no domain), `COOKIE_SECURE` must be `false` in `.env`. Check it, then `docker compose up -d` to reload.

**`docker compose ps` shows `app` as `restarting`.**
Check the build/runtime errors:
```bash
docker compose logs app | tail -100
```
Most common cause: missing env var. The compose file enforces required vars with `${VAR:?...}` syntax — it should refuse to start with a clear message naming the missing variable.

**`prisma db push` fails with `Can't reach database`.**
The DB container isn't healthy yet. Wait 10 seconds and retry, or check `docker compose logs db`.

**Caddy fails to issue HTTPS cert.**
The most common cause is DNS not yet pointing at the server. Verify with `dig +short` and try again in 5 minutes. Make sure ports 80 and 443 are open on the VPS firewall (`ufw allow 80,443/tcp`).

**Disk space warning.**
Old images pile up. Clean weekly:
```bash
docker image prune -af
```

---

## Backups (do this before going live with real customer data)

The bootstrap doesn't set up backups. The minimum you should add:

```bash
# Save this as /opt/precast-crm/scripts/backup.sh
#!/usr/bin/env bash
set -e
cd /opt/precast-crm
mkdir -p /var/backups/precast
docker compose exec -T db pg_dump -U precast precast \
  | gzip > "/var/backups/precast/db-$(date +%F-%H%M).sql.gz"
# Keep 14 days
find /var/backups/precast -type f -mtime +14 -delete
```

Then schedule daily with `crontab -e`:
```
0 3 * * * /opt/precast-crm/scripts/backup.sh
```

Copy backups off-server with `rclone` or `scp` regularly — local backups don't help if the VPS dies.

---

## What costs money on this setup

| Item | Cost |
|---|---|
| VPS (Hetzner CX22) | €4.50/mo |
| Domain (optional) | ~$10/yr |
| Backups (S3/B2 if you push them off-server) | ~$1/mo |
| TLS certificate | $0 (Let's Encrypt via Caddy) |

---

## Going further

- **CI/CD** — auto-redeploy on `git push` via a GitHub Actions workflow that SSHes in and runs `git pull && docker compose up -d --build`.
- **Object storage for uploads** — when you outgrow a single VM, swap `public/uploads/` for S3-compatible storage (Cloudflare R2 is cheapest). The upload handler is a single file change.
- **Managed Postgres** — replace the `db` service in compose with a `DATABASE_URL` pointing at Neon/Supabase/Hetzner DB.
