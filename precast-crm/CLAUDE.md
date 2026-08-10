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

## Data preservation (CONSTITUTIONAL — overrides every other instruction)

**Existing production data is read-only unless the user's action explicitly asks
to change that exact record.** No feature, refactor, migration, cleanup, or
"improvement" may alter, recompute, normalise, backfill or delete data that is
already in the database. If a task appears to require it, STOP and ask first.

This rule outranks convenience, consistency, elegance, and any other guidance in
this file. When in doubt, do nothing and ask.

### Never, without an explicit written instruction for that specific operation
- `UPDATE`/`DELETE` without a `WHERE` that targets the single record the user
  acted on; any bulk write across historical rows.
- Backfilling, re-normalising, re-pricing, or "fixing" old rows — including
  rows that look wrong. A wrong-looking historical value is evidence, not a bug
  to silently correct.
- Dropping or renaming a column/table that holds data, or changing a column's
  type or nullability. Migrations must be **additive**: new nullable column, or
  new column with a default. Never `prisma migrate reset` on prod.
- Recomputing a stored snapshot (`totalPrice`, `subtotal`, `confirmedPaid`,
  `m2Price`, stock levels) for records the user is not currently editing.
  Pricing snapshots are frozen deliberately — a later tier change must never
  reach back into a placed order.

### When a feature legitimately writes
- Scope every write to the record the user acted on, inside a transaction.
- Prefer append-only: add an adjustment/event row rather than overwriting a
  historical value. Money and inventory history must remain reconstructible.
- Recompute only from values already on that record; never re-derive a frozen
  snapshot from today's config.
- Log it to the entity's event/audit trail so the change is attributable.

### Before deploying anything that touches a write path
Capture the numbers **before** and prove them **after** — do not assume:
```bash
# baseline before deploy, same query after; they must match
docker compose exec -T app node -e "…count/sum by day…"
```
Required evidence: total row count, count per status, and the sum of
`totalPrice` for a fixed historical window (e.g. last 30 days). If any figure
moves and the change did not intend it, treat it as a production incident:
stop, report, and do not continue deploying.

### If data does change unexpectedly
Do not attempt a corrective write. Report exactly what changed, with the
evidence, and wait for instructions. An unauthorised "fix" can destroy the
evidence needed to recover the original values.
