# Precast CRM — Claude Guidelines

## Working style (ALWAYS)
- **Reiterate the request as an engineering brief before implementing.** Restate
  what the user means in a professional, coding-oriented tone — grounded in the
  actual code (real file paths, components, data shapes) — so a coding agent could
  pick it up unambiguously. Cover: objective, current vs desired behavior, the
  components/files to touch, edge cases, and any decisions that need locking.
  Then confirm before writing code. (The user is an ESL speaker; precise
  restatement prevents wasted work.)

## Stack
Next.js 14 App Router · Prisma + PostgreSQL · Tailwind · shadcn/ui · React Query · Docker + Caddy

## Deploy
```bash
# Pull & rebuild (SSH drops mid-build — nohup keeps it alive)
ssh root@207.154.218.194 "cd /opt/precast-crm && git pull origin main && nohup bash -c 'docker compose build app && docker compose up -d app' > /tmp/deploy.log 2>&1 &"

# Verify (one call, not reading logs)
ssh root@207.154.218.194 "git -C /opt/precast-crm log --oneline -1 && docker ps --format 'table {{.Names}}\t{{.Status}}'"
```
- Repo on server: `/opt/precast-crm` (NOT /root/precast-crm)
- SSH exit 255 = connection reset, not build failure — always verify with above

## Architecture Gotchas
- **App shell layout** (`src/app/(app)/layout.tsx`): must be `h-screen` not `min-h-screen` — `min-h-screen` breaks `position:sticky` everywhere because `main`'s `overflow-auto` never constrains height
- **Two-pane sticky panels**: parent flex row must be `items-stretch` (not `items-start`) so the non-sticky column has height for the sticky element to travel
- **`html-to-image`**: requires inline styles, not Tailwind classes — Tailwind doesn't serialize through `foreignObject`
- **`zoom` not `transform:scale`** for preview scaling — `zoom` affects layout flow; `transform` doesn't

## Data / Config
- `AppConfig` table (key-value JSON) stores app settings — no migration needed for new settings keys
- Table designer config key: `"table.design"`
- Column widths (`colWidths[11]`) must sum to 100 ± 1% or the Save button blocks

## Auth
- Login: name + 4-digit PIN (no email/password)
- Permissions: `order.view`, `pricing.edit`, etc. — checked via `withPermission()` in API routes

## i18n
- Bilingual Uzbek/English throughout — pattern: `"Ўзбекча матн · English text"`
- Use `useT()` hook in client components

## Security (never violate)
- Do NOT read production `.env` into transcript
- Do NOT dump customer PII from prod DB into transcript
- Do NOT exfiltrate BRIDGE_SECRET
