# Telegram AI Sales Agent — Build Status & Resume Guide

**Branch:** `feat/telegram-ai-agent` (NOT merged to `main` — feature is mid-build).
**Last updated:** 2026-06-07 (Plan 06 done).

This file is the portable handoff (Claude's per-machine memory does not travel between PCs; this doc + the spec + the plan docs + git history are the authoritative record).

## What this is
An AI sales agent that reads the existing Telegram Business inbox and replies to customers (answer + quote +, with human approval, place orders). Full design + every locked decision:
- **Spec:** [`docs/superpowers/specs/2026-06-06-telegram-ai-sales-agent-design.md`](specs/2026-06-06-telegram-ai-sales-agent-design.md) — read this first.

## How to resume on any machine
```bash
git fetch origin
git checkout feat/telegram-ai-agent
cd precast-crm          # the Next.js app subfolder
npm install
npm test                # all unit tests — pure, no DB/.env needed (should be all green)
```
New env vars (documented in `precast-crm/.env.example`, only needed later for runtime, not for tests): `AGENT_SERVICE_TOKEN`, `QUOTE_SIGNING_SECRET`.

Then start a Claude session and say: **"continue the AI agent build — Plan 6"**. It should read this file + the spec + the plan docs to rebuild context.

## 9-plan roadmap
| # | Plan | Status |
|---|------|--------|
| 01 | Safety primitives (media allowlist + rate limiter) | ✅ DONE |
| 02 | Data model + bot service-account auth | ✅ DONE |
| 03 | Approval-button building blocks (callback codec + Bot-API keyboard wrappers) | ✅ DONE |
| 04 | Price-integrity (signed quote tokens + buildSlabQuote) | ✅ DONE |
| 05 | Guardrail text screening (outbound validator + inbound screen) | ✅ DONE |
| 06 | Extract `createOrder` service + the order tool (consumes a verified quote_id) | ✅ DONE |
| 07 | **Live `get_quote` tool + gazoblok/stock/lookup read tools** | ⬅ NEXT |
| 08 | Webhook `callback_query` dispatch + DB approval handler; LlmProvider + Claude/Gemini/OpenAI clients + Gemini voice STT; agent loop + guardrail wiring | ⏳ |
| 09 | Inbox UX (4-state HITL) · KB editor · eval + shadow + 3-model bake-off | ⏳ |

> Plan boundaries 06–09 are indicative; refine when you get there. Each plan is its own doc in `docs/superpowers/plans/`.

## What's built (all in `precast-crm/src/lib/agent/`, fully unit-tested)
- `media-allowlist.ts` — strict inbound-media allowlist (text/voice/image/PDF only; video→human; `.apk`/others rejected). Spec §7.
- `rate-limiter.ts` — per-user + global message & token caps. Spec §8.
- `service-auth.ts` — constant-time `AGENT_SERVICE_TOKEN` bearer check for the agent's server-to-server endpoints. Spec §11.
- `approval-callback.ts` — encode/parse `approve:`/`reject:` callback_data (64-byte guard). Spec §5.
- `quote-token.ts` — HMAC-signed quote tokens (mint/verify, constant-time, expiry). **The keystone: a `quote_id` is a tamper-proof signed price binding.** Spec §4.2/§6.1.
- `slab-quote.ts` — `buildSlabQuote` composes `calculateSlab` + a quote token.
- `outbound-validator.ts` — blocks a reply with a price-but-no-fresh-quote, or any link. Spec §6.5/§7.
- `inbound-screen.ts` — normalize (codepoint-based) + length cap + 3-language injection/link flags. Spec §6.4/§7.

Plus: Telegram inline-keyboard + callback Bot-API wrappers appended to `precast-crm/src/lib/telegram/api.ts`; schema additions in `precast-crm/prisma/schema.prisma` (`Conversation.aiState`/`aiPaused`, `PendingOrder` + `PendingOrderStatus`, `AGENT_ESCALATION` notification type).

**Plan 06 (DONE) — order placement is now session-free + the order tool:**
- `precast-crm/src/lib/order-totals.ts` — pure `computeOrderTotals` (discount/subtotal/total math), extracted from the order route. Tested in `precast-crm/tests/order-totals.test.ts`.
- `precast-crm/src/lib/create-order.ts` — `createOrder(input, actor)` service: the atomic placement transaction + post-commit audit/notifications, extracted **behavior-preserving** from `precast-crm/src/app/api/orders/route.ts` (which now delegates to it). `OrderActor.userId: string | null` makes it callable WITHOUT a user session — the Plan 08 approval webhook will call it with a service-account actor to commit an approved `PendingOrder`. (Reviewed: route HTTP behavior byte-identical; transaction differs only by `user.id → actor.userId`.)
- `precast-crm/src/lib/agent/order-tool.ts` — the `draft_order` tool. Pure `buildPendingOrderDraft` verifies a `quote_id` (`verifyQuoteToken`) and assembles the `PendingOrder` draft (price lives ONLY inside the verified quote snapshot — no free-text price path); `idempotencyKey` = `sha256(conversationId:confirmationMsgId)` per spec §5; thin `draftOrder` shell writes idempotently (`createMany skipDuplicates` = ON CONFLICT DO NOTHING) with an injectable `db` for unit tests. Tested in `precast-crm/src/lib/agent/order-tool.test.ts`.
- Plan doc: `docs/superpowers/plans/2026-06-07-ai-agent-06-create-order-and-order-tool.md`.

## Plan 07 (next) — scope + cautions
- **Live `get_quote` tool:** wrap `buildSlabQuote` (Plan 04) with the LIVE `PriceConfig` (async, `precast-crm/src/lib/pricing-config.ts` → `loadPricingConfig()`) and `process.env.QUOTE_SIGNING_SECRET`, returning the `{…, quote_id, currency:"UZS", validity_ts}` shape (spec §5). This is what *mints* the `quote_id` the Plan 06 order tool consumes.
- **`get_gazoblok_quote`:** same `{price, quote_id}` shape over `precast-crm/src/services/gazoblok-engine.ts`; empty catalog → structured not-found → escalate, never invent (spec §5).
- **Read tools:** `check_stock` (read-only stock, never promise a delivery date), `lookup_client` (by `Conversation.sharedContactPhone` or name; return minimum PII, require phone match beyond a name). Spec §5.
- All tools are forced/`strict` on price turns and their descriptions list what they do NOT cover → escalate. Keep the pure-core + thin-shell pattern (live config injected; unit-test the pure part).

## Gotchas learned
- **Never put literal invisible (zero-width/control) characters in regex/text source.** Use numeric codepoints (e.g. `c === 0x200b`) and `String.fromCharCode(...)` in tests. When a module has Cyrillic/special chars, have the implementer copy verbatim from the committed plan file, and scan the source for codepoints `0x200b/0x200c/0x200d/0xfeff/0x7f` and `< 0x20` (except `0x09/0x0a/0x0d`).
- The repo applies schema with **`prisma db push`** at deploy (no migration files). Schema changes here are validated with `prisma validate` + `prisma generate`; the actual DB change happens at deploy.
- **Stale generated Prisma client ⇒ a full `npx tsc --noEmit` shows ~40 PRE-EXISTING errors** (in `prisma/seed.ts`, `prisma/migrate-pins.ts`, gazoblok/login/audit routes — missing `loginName`/`pinHash`/`gazoblokOrder`/etc.) because `node_modules/.prisma/client` predates recent schema. These are NOT from agent work — filter tsc to the files you changed. Regenerating (`npx prisma generate`) needs the query-engine DLL unlocked, so **stop any running `next dev` first** (it holds the lock on Windows → `EPERM rename`). The deploy regenerates the client anyway.
- Execution mode for this build: **subagent-driven development** (implement → spec review → code-quality review → fix, per task).
