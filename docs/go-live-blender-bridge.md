# Go-Live Runbook — Blender Bridge Merge to `main`

**Audience**: whoever is doing the production deploy (Aziz).
**Risk profile**: low. All schema changes are **additive** —
no existing tables, columns, or rows are touched. The
Blender Bridge feature is owner-only and gated behind a
new permission existing accounts don't yet have, so even
if something in the bridge service fails to start, the
rest of the CRM keeps working.

**Estimated downtime**: ~60 seconds during
`docker compose up -d --build`.

---

## 0. Before you touch the server: data safety check

The merge adds:
- **One new table** `drawing_requests` (empty on first deploy)
- **One new enum** `DrawingRequestStatus`
- **One new permission string** `"blender.bridge"` in the `users.permissions[]` array via a one-time backfill script
- New API routes, UI components, and a new Docker service

The merge does **NOT**:
- Drop any column
- Rename any column
- Change any data type
- Touch any existing row's values (the backfill script only **appends** `"blender.bridge"` to the `permissions` array — no existing items removed)

So the worst case for data is: nothing.

That said — back up before any production change.

---

## 1. SSH into the VPS + take a fresh backup

```bash
ssh root@<VPS-IP>
cd /opt/precast-crm

# Verify what's running right now
docker compose ps

# Pre-deploy DB backup — pgdump of the entire database
mkdir -p backups
docker compose exec -T db pg_dump -U precast precast \
  > backups/pre-blender-bridge-$(date +%Y%m%d-%H%M%S).sql

# Sanity-check the dump landed (should be > 100 KB if you
# have real data; will be < 50 KB if the DB is mostly empty)
ls -lh backups/ | tail -3
```

If you want a belt-and-suspenders copy off-server:

```bash
# Run on YOUR machine, not the VPS:
scp root@<VPS-IP>:/opt/precast-crm/backups/pre-blender-bridge-*.sql \
    ~/Downloads/
```

## 2. Generate the bridge secret

```bash
# On the VPS, still in /opt/precast-crm
BRIDGE_SECRET=$(openssl rand -hex 32)
echo "BRIDGE_SECRET=$BRIDGE_SECRET" >> .env

# Verify it landed
grep BRIDGE_SECRET .env

# Save this value somewhere safe — you'll paste it into the
# Blender addon preferences. If you lose it, just regenerate
# and update both places.
```

## 3. Pull the new code

```bash
git pull origin main

# Verify the new files are there
ls ws-bridge/
ls precast-crm/src/components/blender-bridge/
ls precast-crm/src/app/api/drawings/
```

## 4. Build + start the new stack

```bash
# This builds the new ws-bridge image and brings up the new
# service. Other services (db, app, caddy) restart with
# unchanged images — ~60 seconds total.
docker compose up -d --build

# Watch the logs settle
docker compose ps
docker compose logs --tail=20 ws-bridge
```

Expected output from `ws-bridge`:

```
[bridge] WebSocket server on :8765
[bridge] Internal HTTP on :8766
```

If you see `BRIDGE_SECRET env var is required`, you forgot
Step 2 — re-run it and `docker compose up -d ws-bridge` again.

## 5. Apply the schema change

```bash
# Push the new table/enum into Postgres. This is the project's
# established workflow (no migrations directory). Additive — will
# NOT prompt about destructive changes.
docker compose exec app npx prisma db push

# Expected last line: "Your database is now in sync with your
# Prisma schema."
```

## 6. Grant the new permission to your OWNER account

```bash
# One-time backfill. Idempotent — safe to re-run.
docker compose exec app npx tsx scripts/grant-blender-bridge.ts

# Expected output:
#   + owner@precast.local granted blender.bridge
#   Done. 1 user(s) updated.
```

## 7. Verify end-to-end from outside the VPS

```bash
# From your laptop — just confirm the routes respond.
curl -s https://<your-domain-or-IP>/api/drawings/status \
  -H "Cookie: <paste session cookie>" | jq

# Expected: {"blenderConnected":false,"connectedSince":null,"recentRequests":[]}
```

Then open the CRM in a browser, **hard-refresh** so the new
`/api/auth/me` payload (including `blender.bridge`) reaches
the React app, and verify:

- Sidebar footer shows a small "Blender оффлайн" indicator
- `/orders/<any-id>` and `/projects/<any-id>` show a new
  **"Blender'га юбориш / Send to Blender"** button

Other users (non-OWNER) see nothing — confirm if there are
operators logged in.

## 8. Done. Connect Blender.

Give the Blender addon (the other team's deliverable) two
values:

```
URL    : wss://<your-domain-or-IP>/ws
Secret : <the BRIDGE_SECRET from Step 2>
```

The addon connects to `wss://<host>/ws?secret=<secret>`. The
sidebar indicator flips green within 5 seconds.

---

## Rollback plan (if something goes sideways)

The change is reversible — both code and data.

### To roll back the deploy (keep new schema):

```bash
cd /opt/precast-crm
git log --oneline -10               # find the previous commit
git checkout <previous-commit-sha>  # detached HEAD is fine
docker compose up -d --build
```

The `drawing_requests` table will remain in the DB unused.
That's harmless — purely additive.

### To roll back the schema too (extreme):

```bash
docker compose exec db psql -U precast precast -c \
  'DROP TABLE IF EXISTS drawing_requests; DROP TYPE IF EXISTS "DrawingRequestStatus";'
```

This is safe — only the new table is dropped, no existing
table touched.

### To restore from the backup (nuclear):

```bash
cd /opt/precast-crm
# Stop the app so it doesn't write during restore
docker compose stop app
# Wipe + restore
docker compose exec -T db psql -U precast -d precast \
  < backups/pre-blender-bridge-YYYYMMDD-HHMMSS.sql
docker compose start app
```

---

## Post-go-live monitoring

For the first hour, tail these logs:

```bash
# CRM app — watch for any 500s on /api/drawings/*
docker compose logs -f app | grep -i drawing

# Bridge — should be quiet until Blender connects
docker compose logs -f ws-bridge

# Caddy — confirm /ws path proxies correctly
docker compose logs -f caddy | grep -i "/ws"
```

If `ws-bridge` keeps crashing — `BRIDGE_SECRET` env wasn't read.
If `/api/drawings/status` returns 403 to OWNER — the grant
script didn't run, repeat Step 6.

## Permanent maintenance notes

- **The bridge secret never appears in code.** It lives only in
  `/opt/precast-crm/.env` on the VPS and the Blender addon's
  preferences on the operator's laptop.
- **Rotating the secret**: change `.env`, `docker compose up -d ws-bridge`,
  paste the new value into the Blender addon, reconnect.
- **The `drawing_requests` table grows monotonically.** It's
  fine — each row is ~1KB and the feature is owner-only. If you
  hit a million rows somehow, run:
  `DELETE FROM drawing_requests WHERE "createdAt" < NOW() - INTERVAL '30 days';`
- **The `BlenderStatusIndicator` polls /api/drawings/status every
  5s for every OWNER tab.** Negligible load — but if you ever
  add many owners, consider raising the interval.
