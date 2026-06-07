# Telegram AI Sales Agent — Build Status & Resume Guide

**Branch:** `feat/telegram-ai-agent` (NOT merged to `main` — feature is mid-build).
**Last updated:** 2026-06-07.

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
| 06 | **Extract `createOrder` service + the order tool (consumes a verified quote_id)** | ⬅ NEXT |
| 07 | Live `get_quote` tool + gazoblok/stock/lookup read tools | ⏳ |
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

## Plan 06 (next) — scope + cautions
- **Extract `createOrder` from the inline `precast-crm/src/app/api/orders/route.ts`** into a reusable service function so the (later) approval handler + the order tool can call it without a user session. This is the **heaviest/riskiest** plan: it touches LIVE order-placement code (atomic transaction, monthly orderNumber allocation, client phone-dedup, in-app notifications). Refactor carefully, behavior-preserving, with the existing order tests as the safety net.
- Then add the **order tool**: it accepts ONLY a `quote_id`, calls `verifyQuoteToken` (from `quote-token.ts`) to get the trusted price, and writes a `PendingOrder` — never a free-text price.

## Gotchas learned
- **Never put literal invisible (zero-width/control) characters in regex/text source.** Use numeric codepoints (e.g. `c === 0x200b`) and `String.fromCharCode(...)` in tests. When a module has Cyrillic/special chars, have the implementer copy verbatim from the committed plan file, and scan the source for codepoints `0x200b/0x200c/0x200d/0xfeff/0x7f` and `< 0x20` (except `0x09/0x0a/0x0d`).
- The repo applies schema with **`prisma db push`** at deploy (no migration files). Schema changes here are validated with `prisma validate` + `prisma generate`; the actual DB change happens at deploy.
- Execution mode for this build: **subagent-driven development** (implement → spec review → code-quality review → fix, per task).
