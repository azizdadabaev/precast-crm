# Telegram AI Sales Agent — Build Status & Resume Guide

**Branch:** `feat/telegram-ai-agent` (NOT merged to `main` — feature is mid-build).
**Last updated:** 2026-06-08 (Plans 01–08 done; Plan 09 Slice A + Slice B done; **Slice C Steps 3–4 done — Suggest mode (operator Send/Edit-and-send) + Order-taking live (operator places real Orders from chat, recorded under their CRM identity).** KB tuned to owner voice; get_quote capped at 6.30m beam. **Next: Slice C Step 5 — Auto mode + deploy.** See "▶ RESUME HERE" below.)

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

Then start a Claude session and say: **"Continue the Telegram AI agent — read docs/superpowers/AI-AGENT-BUILD-STATUS.md (▶ RESUME HERE) + the spec + the Plan 09 doc, then let's start Plan 09 Slice B."**

**Fresh-PC runtime setup (the KB + provider keys live in the DB / `.env`, NOT in git):**
```bash
# in precast-crm/
npx tsx scripts/load-knowledge-base.ts          # load the KB into this machine's dev DB
# set QUOTE_SIGNING_SECRET in precast-crm/.env (any random hex) — else get_quote escalates
# enter a provider API key in the /agent page (or GEMINI_API_KEY/ANTHROPIC_API_KEY/OPENAI_API_KEY in .env)
npx tsx prisma/reset-pin.ts "Your Name" 1234     # if you need to recover the local login
```
⚠️ The Telegram token in BotFather is the **LIVE production bot** (@etalontbm_bot → etalontbm.uz) — never repoint its webhook to localhost. Test via the `/agent` console, or a SEPARATE test bot + a cloudflared tunnel.

## ▶ RESUME HERE (2026-06-08)

**Agent conversational quality is dialed in. We're now COMPLETING THE FEATURE (Plan 09 Slice B/C):** turn the headless Shadow engine into a live, operator-in-the-loop agent inside `/inbox`, then order-taking, then deploy.

**Done in the 2026-06-07 night session (committed + pushed to `origin/feat/telegram-ai-agent`):**
- Plan 09 control panel + **provider-key UI** (`/agent`: save Anthropic/Google/OpenAI keys to AppConfig `agent.provider_keys`, write-only) + **multi-turn test console** (`POST /api/agent/test` runs the full Shadow pipeline with conversation history → decision/reply/tools/tokens/latency). This is how we exercise the agent with no Telegram.
- **Gemini fix:** round-trip `thoughtSignature` on functionCall parts (was breaking every Gemini tool turn).
- **Knowledge base** at `precast-crm/scripts/agent-knowledge-base.sample.md`, loaded via `npx tsx scripts/load-knowledge-base.ts` → AppConfig `agent.knowledge_base`. Researched sales playbook + EU beam-and-block/AAC tech, then tuned to owner voice: direct/short seller tone; geometry from the calc engine (pitch 0.58 m, beam 0.12 m, block 0.20 m / 0.45 m gap, full-coverage logic); load facts (2 beams 4-5 t; **600-1000 kg/m²**; honest "not certified yet"); blocks have **no rebar**; beams use **prestressed ВР2 5mm wire (ГОСТ 7348-81)**; "5mm ≈ local 12-14mm rebar" doubt-buster.
- **Grounded cargo weight** in quotes: flooring **180 kg/m²**; gazoblok **D600 density** → `weight_kg` field in `get-quote.ts` / `get-gazoblok-quote.ts`.
- Behavior tuning (prompt.ts STYLE + KB): handle discounts/delivery/stock instead of escalating; untracked stock = available; don't nag for contact details (ask once after a quote); don't pile on proof (confident one-liner, details only if asked).

**Done in the 2026-06-08 session (committed pending push to `origin/feat/telegram-ai-agent`):**
- **Slice B/C build doc** — `docs/superpowers/plans/2026-06-08-ai-agent-09-slice-bc-build.md` (the 3 decisions resolved, below).
- **Step 1 — proposals now PERSIST.** New `AgentProposal` model (`@@map("agent_proposals")`: conversationId FK-cascade, `inboundMessageId @unique` for retry-idempotency + ghost-draft lookup, decision/reply/escalationReason/approvalDraft/screen/modelKey/toolCalls/usage/turns/confidence/escalatedEarly). `src/lib/agent/proposal.ts` (pure `buildProposalRow` + thin injectable-db `saveAgentProposal`, `createMany skipDuplicates` = ON CONFLICT DO NOTHING) + `proposal.test.ts` (8 cases). `webhook-entry.ts` now captures the `runAgentShadow` outcome and writes the proposal (inside the existing try/catch — a write failure never breaks inbox delivery). Verified: 741 unit tests green, full-project `tsc --noEmit` 0 errors, `prisma validate` ✓, `prisma db push` applied the table, real-DB persist/read/idempotency/cascade confirmed. **Persisting is NOT sending — Shadow stays send/write-free.**
- **Step 2 — inbox ghost-draft + "Simulate inbound".** `GET /api/agent/proposals?conversationId=` (owner-gated) returns the latest proposal; `POST /api/agent/simulate-inbound` (owner-gated) injects an INBOUND `Message` and runs the agent on the REAL webhook path (`runAgentForInbound`, awaited) so the full inbound→agent→proposal chain works with NO Telegram — reuses the open chat for multi-turn or spins up a `🧪 Simulated customer` chat; returns a `note` explaining the gate (kill-switch OFF / no key / not AI_HANDLING). `InboxClient.tsx`: a read-only `GhostDraft` above the composer (badges: decision · model · language · tools · suspicious; "shadow · read-only"; Send/Edit deferred to Slice C) + a top-bar **Simulate** button/modal. Verified: tsc 0 errors, routes 401-gated, dev server compiles clean. ⚠️ Producing a real proposal needs a provider key entered in `/agent` + the kill-switch ON.

**NEXT — agreed feature-completion plan:**
0. ✅ **DONE** — Plan 09 Slice B/C build doc.
1. ✅ **DONE (2026-06-08)** — persist agent proposals (`AgentProposal` + `proposal.ts` + `webhook-entry` wiring).
2. ✅ **DONE (2026-06-08)** — inbox ghost-draft + "Simulate inbound" (`/api/agent/proposals`, `/api/agent/simulate-inbound`, `GhostDraft` + Simulate modal in `InboxClient.tsx`).
3. ✅ **DONE (2026-06-08)** — Suggest mode: `AgentProposal.status` lifecycle (PENDING→SENT|EDITED_SENT|DISMISSED); `sendBusinessReply()` (`inbox-send.ts`) shared by the reply route + the new `POST /api/agent/proposals/[id]/act`; `GhostDraft` editable Send/Edit/Dismiss when `mode==='suggest'`; `webhook-entry` runs in suggest too; sim chats send locally for testing. `get_quote` also capped at 6.30m beam (escalates longer).
4. ✅ **DONE (2026-06-08)** — Order-taking live via the inbox. `place-order.ts` (`placeOrderFromProposal`: draftOrder → AWAITING_STAFF → `decidePendingOrder`, committing a real Order under the **operator** as actor + `decidedById`, decision c) + `orderConfirmationMessage`. `POST /api/agent/proposals/[id]/act` gained `place_order` (validates request_approval + quote + customer name/phone/address → places Order → auto-confirms customer → marks proposal ORDER_PLACED). `GhostDraft` shows an order card with Place/Reject in suggest mode. No schema change. The Telegram Action-Card path (`propose-order.ts`/`approval-webhook.ts`) stays built-but-dormant — the inbox UI is the approval surface per decision c.
5. ▶ **START HERE — Auto mode + deploy** — `mode==='auto'`: auto-send straightforward replies (typed-dimension quotes/Q&A allowlist) without the operator click; **orders stay operator-approved** (never auto-place); per the spec §14 rollout gates. `webhook-entry` currently returns on `mode==='auto'` — wire the auto-send there (reuse `sendBusinessReply`). Then deploy to prod in Shadow → watch → graduate. Mind: auto-send is customer-facing with no human in the loop — gate hard (allowlist + confidence + kill-switch).
Parallel/later: voice (`gemini.transcribe()`), vision (drawing photos), KB editor UI, few-shot wiring (curated+anonymized Telegram/IG chats as a TONE guide only), eval/bake-off.

**Decisions (resolved 2026-06-08):** (a) proposals = a **NEW `AgentProposal` table** ✓; (b) Suggest UX = **send + edit** ✓; (c) order-approval = **require CRM identity** (`decidedById` set; approve via the owner-gated `/inbox` UI, not an anonymous Telegram-group tap) ✓.

## 9-plan roadmap
| # | Plan | Status |
|---|------|--------|
| 01 | Safety primitives (media allowlist + rate limiter) | ✅ DONE |
| 02 | Data model + bot service-account auth | ✅ DONE |
| 03 | Approval-button building blocks (callback codec + Bot-API keyboard wrappers) | ✅ DONE |
| 04 | Price-integrity (signed quote tokens + buildSlabQuote) | ✅ DONE |
| 05 | Guardrail text screening (outbound validator + inbound screen) | ✅ DONE |
| 06 | Extract `createOrder` service + the order tool (consumes a verified quote_id) | ✅ DONE |
| 07 | Live `get_quote` tool + gazoblok/stock/lookup read tools | ✅ DONE |
| 08 | Integration: LlmProvider + clients · agent loop · approval commit + callback · live webhook (Shadow) | ✅ DONE (built/tested; write-action activation staged to Plan 09) |
| 09 | **Operator UI + rollout: control panel + API keys + test console (DONE) · inbox ghost-drafts · KB editor · write-action/auto-send activation · voice/vision · bake-off** | 🚧 Slice A + B DONE · Slice C: Suggest (3) + Order-taking (4) DONE · next Auto (5) |
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

**Plan 07 (DONE) — the read-only toolset (every grounded number the agent is forced to use):**
- `precast-crm/src/lib/agent/tools/types.ts` — provider-agnostic `AgentTool` / `AgentToolDefinition` / `ToolResult` (`toolOk`/`toolEscalate`). Plan 08 maps the definitions to Claude/Gemini/OpenAI tool formats.
- `precast-crm/src/lib/agent/tools/get-quote.ts` — **the keystone.** Pure `runGetQuote` wraps `buildSlabQuote` with LIVE `loadPricingConfig()` + `QUOTE_SIGNING_SECRET` to mint the `quote_id` the Plan 06 `draft_order` consumes — closing the price-integrity chain end-to-end.
- `precast-crm/src/lib/agent/gazoblok-quote.ts` (pure `buildGazoblokQuote` + `resolveGazoblokProduct`, mirrors `slab-quote.ts`) + `tools/get-gazoblok-quote.ts` (live catalog; empty/unknown size → escalate, never invent). Mints a `kind:'gazoblok'` token.
- `precast-crm/src/lib/agent/tools/check-stock.ts` — coarse availability (`in_stock`/`low`/`out_of_stock`) for floor (`InventoryItem`) + gazoblok (`GazoblokStock`); never a raw count, never a delivery date.
- `precast-crm/src/lib/agent/tools/lookup-client.ts` — by phone or name with minimal PII (phone match ⇒ id+name+language; name-only ⇒ id+name, ≥2 chars; never another customer's contact details).
- **Hardening from review:** `draft_order` (Plan 06 `order-tool.ts`) now rejects a valid-but-wrong-`kind` token — a `kind:'gazoblok'` quote (same signing secret) can no longer be stored as a slab order.
- Plan doc: `docs/superpowers/plans/2026-06-07-ai-agent-07-read-tools.md`.

**Plan 08 Task 1 (DONE) — verified bake-off model registry:**
- `precast-crm/src/lib/agent/llm/models.ts` (+ test) — the latest models from all three providers, verified 2026-06-07 (USD/MTok): Anthropic Opus 4.8 `claude-opus-4-8` $5/$25 + Sonnet 4.6 `claude-sonnet-4-6` $3/$15; Google Gemini 3.1 Pro `gemini-3.1-pro-preview` $2/$12 (2M ctx) + 3.5 Flash `gemini-3.5-flash` $1.50/$9 (both native audio → voice STT); OpenAI GPT-5.5 `gpt-5.5` $5/$30 + GPT-5.4 `gpt-5.4` $2.50/$15. Classifiers: Haiku 4.5 / Gemini Flash-Lite / GPT-5 Mini. Each carries roles + capabilities + `bakeOff` + `requiresSnapshotPin`; helpers `bakeOffModels()` / `modelsByRole()` / `modelsByProvider()`.
- `.env.example` gained `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY` / `AGENT_MODEL_KEY`. Spec §3 refreshed with these verified ids/prices.
- ⚠️ **Before Shadow:** re-verify ids/prices (`PRICING_VERIFIED_AT`) and pin dated snapshots for anything flagged `requiresSnapshotPin` (Opus 4.8, Sonnet 4.6, Gemini 3.1 Pro preview).
- Plan doc: `docs/superpowers/plans/2026-06-07-ai-agent-08-integration.md` (full integration scope; Task 1 done, Tasks 2–6 next).

**Plan 08 Task 2a (DONE) — the provider-agnostic LlmProvider core:**
- `precast-crm/src/lib/agent/llm/provider.ts` — the `LlmProvider` interface (`generate` / optional `transcribe`) + agnostic types (`GenerateRequest`/`GenerateResult`, `LlmMessage`, `LlmToolCall`, `LlmToolChoice`). The loop talks only to this; the Shadow bake-off swaps clients behind it.
- `precast-crm/src/lib/agent/llm/adapters.ts` (+ test, 18 cases) — PURE translation for Claude/Gemini/OpenAI: tools, tool_choice (incl. force-a-tool), and response normalization, plus `buildClaudeRequest` encoding the verified Claude mechanics from the claude-api skill (`cache_control {ttl:'1h'}` on last tool + system block; render order tools→system→messages; `tool_choice` forcing; adaptive thinking; **no** temperature/top_p/top_k — they 400 on Opus 4.8; caching verified via `cache_read_input_tokens`).
**Plan 08 Task 2b (DONE) — the three concrete clients + factory:**
- `precast-crm/src/lib/agent/llm/claude.ts` (official `@anthropic-ai/sdk`), `gemini.ts` (`@google/genai`, incl. `transcribe()` voice STT), `openai.ts` (`openai`, `max_completion_tokens`), `factory.ts` (`createProvider` / `createProviderByKey` / `createTranscriptionProvider`). Tests in `clients.test.ts`. `adapters.ts` gained `toGeminiContents`/`toOpenAIMessages` (tool round-trip).
- All clients take an **injectable SDK client** → unit-tested without keys (37 LLM tests). The three SDKs are now in `package.json`.
- ⚠️ **Not yet validated against a live API** — needs a provider key. Gemini (incl. voice STT) is validatable first (Google access). Then confirm Claude caching hits via `usage.cache_read_input_tokens`.
- 💡 Side effect: the `npm install` regenerated the Prisma client, so `npx tsc --noEmit` is now **fully clean** (the prior ~40 stale-client errors are gone).
- **Tasks 5–6 NEXT:** the `/api/agent/approve` webhook (commit a `PendingOrder` via `createOrder`), and the guarded live-webhook entry (Shadow).

**Plan 08 Tasks 3–4 (DONE) — prompt/KB assembly + the agent loop:**
- `precast-crm/src/lib/agent/prompt.ts` (+ test) — server-side `detectLanguage` (uz-latin/uz-cyrillic/ru) + `detectPriceIntent` + `buildSystemPrompt` (hard-constraint sections + KB hard-rule + injected owner KB + pinned reply language; deterministic/cache-safe; never interpolates customer text; source codepoint-scanned).
- `precast-crm/src/lib/agent/tools/registry.ts` (+ test) — aggregates the 4 read tools, dispatch-by-name (unknown → escalate), `QUOTE_TOOL_NAMES`.
- `precast-crm/src/lib/agent/loop.ts` (+ test) — `runAgentTurn`: tool-use loop over an injected `LlmProvider`, 12-turn guard, deterministic `escalate_to_human`, price-integrity wired (fresh quote_id gates price replies via the outbound validator), returns a routed `AgentDecision`. Tested with a fake provider (9 cases).
- Reviewed (spec + code-quality subagents): deterministic-escalation fix applied; outbound-validator `PRICE_RE` linearized; deviations documented (single detected-language reply vs §4.2 3-variant; `request_approval`/`confidence`/turn-10 rolling summary deferred). No blockers.
- ⚠️ Loop is tested with a fake provider; **live model behavior validated once the webhook (Task 6) is wired + keys are in `.env.local`** (all 3 keys now configured).

**Plan 08 Task 5a (DONE) — the approval commit/reject service:**
- `precast-crm/src/lib/agent/approve-order.ts` (+ test, 13 cases) — `decidePendingOrder`: staff Approve re-verifies the quote_id's provenance (`ignoreExpiry`; forged/wrong-kind blocked), guards customer info, **atomically claims `AWAITING_STAFF→APPROVED`** and commits a real Order via Plan 06 `createOrder` with a **system actor (`userId: null`)** — the Telegram tapper isn't a CRM user — reverting on any failure (returned or thrown). Reject → `REJECTED` + `Conversation.aiState=HUMAN_ACTIVE`. Idempotent + race-safe (exactly one Order under concurrent taps, asserted). `makeApproveDb()` is the Prisma impl (conditional `updateMany`).
- `quote-token.ts` gained `ignoreExpiry` (commit-path provenance check). Reviewed by spec + code-quality subagents: fixed a real throw-doesn't-revert bug, tightened the approve claim to `AWAITING_STAFF`, added the concurrency + throw tests. No blockers.
- Decisions (documented): order re-priced live at placement (frozen quote price not reused); `scheduledAt` placeholder = approval time (staff set the real delivery date); single-room agent orders.
**Plan 08 Task 6 (DONE) — agent runs in Shadow on the live webhook:**
- `precast-crm/src/lib/agent/runtime-config.ts` (kill-switch `agent.runtime` default OFF + `shouldAgentHandle` gate + KB loader), `shadow.ts` (`runAgentShadow`: screen→lang→prompt→loop→**log only**, suspicious→escalate w/o model call), `webhook-entry.ts` (`runAgentForInbound`: gate→history→KB→provider→Shadow, total try/catch). Wired into `src/app/api/telegram/webhook/route.ts` step 8 (inbound TEXT only, fire-and-forget). Tests: `shadow.test.ts`, `tests/agent-runtime-config.test.ts`.
- Reviewed: no send path exists anywhere in the agent tree; gate read first; default OFF; can't break inbox delivery.
- ▶ **To see it on `npm run dev`:** set AppConfig `agent.runtime` = `{enabled:true, mode:'shadow'}`; proposed replies appear in the `[agent:shadow]` server logs (nothing is sent to customers). Needs the provider key in `.env.local` (all 3 configured).

**Plan 08 Task 5b (DONE — built/tested; propose-execution staged) — approval route + Action Card:**
- ✅ **Wired live:** `callback_query` → `handleApprovalCallback` (`approval-webhook.ts`) → `decidePendingOrder` in the Telegram webhook (`route.ts` step before parse): answers the callback, edits the card to the outcome, sends the customer confirmation on commit. Tested (`approval-webhook.test.ts`, 4 cases).
- ✅ **Loop seam + propose-execution BUILT + tested:** `request_approval` decision (`loop.ts` `REQUEST_APPROVAL_TOOL`) and `proposeOrder`/`formatActionCard`/`approvalKeyboard` (`propose-order.ts`: `draft_order` → `AWAITING_STAFF` → post `[Approve][Reject]` card). `.env.example` gained `AGENT_STAFF_CHAT_ID`.
- ⏸ **Intentionally NOT wired to a live path** (and correct: Shadow must not write — spec §14 "zero write-action leakage"). In Shadow a `request_approval` decision is **logged only**. `proposeOrder` activates with the write-capable rollout mode (Plan 09 suggest/auto), which reads `AGENT_STAFF_CHAT_ID`. Same staged posture as `service-auth` (Plan 02) and `gemini.transcribe()` (voice STT) — built ahead of activation.
- 🔒 **Pre-go-live decision (finding):** the staff tap is authorized only by Telegram staff-group membership (the tapper isn't a CRM user; `decidedById: null`). Decide before enabling write-actions whether CRM-identity auth on the approval is required.

## Plan 08 — COMPLETE (all components built/tested; agent runs in Shadow on the live webhook)
All Tasks 1–6 are built, tested, and wired to the extent Shadow allows. What remains is **rollout** (Plan 09), not Plan-08 construction:
- **Activate write-actions** (wire `proposeOrder` behind a suggest/auto mode + `AGENT_STAFF_CHAT_ID`) and **customer auto-send** — both intentionally off in Shadow.
- **Voice STT wiring** (`gemini.transcribe()` built; webhook is text-only) and photo/floor-plan vision.
- **Live-API validation** of the 3 providers + pin dated model snapshots / re-verify pricing (`requiresSnapshotPin`).
- Coherence-checked end-to-end (price-integrity + HITL chains hold; Shadow leaks nothing; kill-switch default OFF).
- **Defer to Plan 09:** inbox 4-state HITL UX, KB editor, eval/shadow/bake-off.
- Keep the pure-core + thin-shell pattern; reuse the existing primitives rather than re-implementing.

## Gotchas learned
- **Never put literal invisible (zero-width/control) characters in regex/text source.** Use numeric codepoints (e.g. `c === 0x200b`) and `String.fromCharCode(...)` in tests. When a module has Cyrillic/special chars, have the implementer copy verbatim from the committed plan file, and scan the source for codepoints `0x200b/0x200c/0x200d/0xfeff/0x7f` and `< 0x20` (except `0x09/0x0a/0x0d`).
- The repo applies schema with **`prisma db push`** at deploy (no migration files). Schema changes here are validated with `prisma validate` + `prisma generate`; the actual DB change happens at deploy.
- **Stale generated Prisma client ⇒ a full `npx tsc --noEmit` shows ~40 PRE-EXISTING errors** (in `prisma/seed.ts`, `prisma/migrate-pins.ts`, gazoblok/login/audit routes — missing `loginName`/`pinHash`/`gazoblokOrder`/etc.) because `node_modules/.prisma/client` predates recent schema. These are NOT from agent work — filter tsc to the files you changed. Regenerating (`npx prisma generate`) needs the query-engine DLL unlocked, so **stop any running `next dev` first** (it holds the lock on Windows → `EPERM rename`). The deploy regenerates the client anyway.
- Execution mode for this build: **subagent-driven development** (implement → spec review → code-quality review → fix, per task).
