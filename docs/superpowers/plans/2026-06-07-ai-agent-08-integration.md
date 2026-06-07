# AI Agent — Plan 08: Integration (provider clients, agent loop, approval webhook)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire everything built in Plans 01–07 into a *running* agent: a provider-agnostic `LlmProvider` (so the bake-off can swap Claude/Gemini/OpenAI), the hand-written agent loop (input-screen → model+tools → output-validate → send/HITL), Gemini voice-note transcription, and the `/api/agent/approve` webhook that commits an approved `PendingOrder` into a real `Order` via the Plan 06 `createOrder` service. This is the **heaviest plan since 06** and it touches the **live Telegram webhook** — stage it carefully behind the global kill-switch + per-chat pause, and keep auto-send OFF until Shadow (spec §14 Stage 1).

**Status:** Task 1 (model registry) is **DONE** (committed). The rest are planned below and implemented in subsequent sessions; this doc is the authoritative record so the work can resume on any machine.

**Spec sections covered:** §3 (provider-agnostic + bake-off), §4.3 (agent loop), §4.4 (Claude prompt caching), §4.5 (vision & voice), §5 (`transcribe_voice`, `send_reply`, `request_approval`), §6 (guardrail wiring end-to-end), §10 (HITL Action Card + approval SLA), §11 (the missing infra prerequisites), §14 (Shadow staging).

---

## Conventions for this plan
- **App directory:** `precast-crm/`. Branch `feat/telegram-ai-agent` already checked out.
- Pure-core + thin-shell + injected-deps pattern, as in Plans 04/06/07. Unit-test the pure parts; provider HTTP clients are thin and tested with recorded/mocked responses (no live API in unit tests).
- Tests under `src/lib/agent/**` or `tests/**` (vitest globs).

---

### Task 1 — Model registry ✅ DONE
- `src/lib/agent/llm/models.ts` (+ test) — the verified bake-off candidate catalog (provider, exact id, price, capabilities, roles, `bakeOff`, `requiresSnapshotPin`). `.env.example` gained `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY` / `AGENT_MODEL_KEY`. Spec §3 refreshed with the verified 2026-06-07 ids/prices.
- **Before Shadow:** re-verify ids/prices (`PRICING_VERIFIED_AT`) and replace alias ids flagged `requiresSnapshotPin` with dated snapshots.

### Task 2 — `LlmProvider` abstraction + clients

**Task 2a (DONE) — provider-agnostic core + adapters:**
- `src/lib/agent/llm/provider.ts` — the `LlmProvider` interface (`generate` / optional `transcribe`) + provider-agnostic types (`GenerateRequest`/`GenerateResult`, `LlmMessage`, `LlmToolCall`, `LlmToolChoice`).
- `src/lib/agent/llm/adapters.ts` (+ test) — PURE translation for all three vendors: `toClaudeTools`/`toGeminiTools`/`toOpenAITools`, `to{Claude,Gemini,OpenAI}ToolChoice`, `from{Claude,Gemini,OpenAI}Response`, plus `buildClaudeRequest` (the full Messages API body: `cache_control {ttl:'1h'}` on the last tool + system block, `tool_choice` forcing, adaptive thinking, **no** sampling params — they 400 on Opus 4.8) and `toClaudeMessages`. Fully unit-tested (18 cases), no SDK/keys needed.

**Task 2b (DONE) — the three concrete clients + factory:**
- `adapters.ts` also gained `toGeminiContents` + `toOpenAIMessages` (the tool-call/result round-trip converters; `LlmToolResult` gained an optional `name` for Gemini's `functionResponse`). `from*` now accept `unknown` so clients pass SDK responses straight through.
- `claude.ts` — `ClaudeProvider` over official `@anthropic-ai/sdk`: `messages.create(buildClaudeRequest(...))` → `fromClaudeResponse`. No `transcribe` (Claude has no raw audio).
- `gemini.ts` — `GeminiProvider` over `@google/genai`: `models.generateContent({model, contents, config:{systemInstruction, tools, toolConfig, maxOutputTokens}})`; **`transcribe()`** sends an inline base64 audio part (spec §3 voice STT).
- `openai.ts` — `OpenAIProvider` over `openai`: `chat.completions.create` with `max_completion_tokens` (GPT-5.x rejects legacy `max_tokens`).
- `factory.ts` — `createProvider(model)` / `createProviderByKey(AGENT_MODEL_KEY)` / `createTranscriptionProvider()` (always Google).
- All clients take an **injectable SDK client** (lazy real-client construction) so request-assembly + response-normalization are unit-tested without keys/network (37 LLM tests total). SDKs added to `package.json`.
- ⚠️ **Not yet validated against live APIs** — needs a provider key. The Gemini path (incl. voice STT) is validatable first (owner has Google). Confirm Claude caching hits via `usage.cache_read_input_tokens` and that the cached prefix clears Opus 4.8's 4096-token minimum once a key exists.

### Task 3 — System prompt + KB assembly (spec §6.2 / §9)
- `src/lib/agent/prompt.ts` — assemble the labelled hard-constraint system prompt (IDENTITY / CAPABILITIES / HARD PROHIBITIONS / ESCALATION TRIGGERS / UNTRUSTED-CONTENT POLICY) + the few-shot UZ exchanges + the domain glossary, and inject the KB from `AppConfig` key `agent.knowledge_base`. Server-side language+script detection sets the reply language explicitly (not the model). Keep the prefix STABLE for caching.
- Tests: prompt assembly is deterministic; KB injection; the "tool result supersedes KB / never state a price without a tool" hard rule is present; language-detect → reply-language mapping.

### Task 3 (DONE) — System prompt + KB assembly + language detection (spec §6.2 / §9 / §3)
- `src/lib/agent/prompt.ts` (+ test) — `detectLanguage` (uz-latin / uz-cyrillic via markers ўғқҳ / ru; **server-side**, model never picks language), `detectPriceIntent` (Unicode-boundary regex; JS `\b` is ASCII-only), `buildSystemPrompt` (labelled hard-constraint sections + glossary + KB hard-rule + injected owner KB + pinned reply language; deterministic/cache-safe; never interpolates customer text). A test scans the source for the invisible-codepoint gotcha. Few-shot Uzbek is injected (owner/native-reviewed), never authored here.

### Task 4 (DONE) — Agent loop (spec §4.3 / §6)
- `src/lib/agent/loop.ts` (+ test) — `runAgentTurn`: calls the injected `LlmProvider` with the Plan 07 toolset + an `escalate_to_human` terminal tool; dispatches tool calls (all results fed back as one user turn; escalate short-circuits deterministically), loops to a **12-turn guard**; the caller passes `forceFirstTool` for price-intent turns (applied turn-1 only). Price-integrity wired: a successful quote tool sets `freshQuote` → `validateOutbound(hasFreshQuote)` gates price-bearing replies. Returns a routed `AgentDecision` (`reply`/`escalate`/`blocked`/`max_turns`). Tested with a fake provider + fake registry (9 cases incl. block path, multi-tool turn, escalate ordering, turn guard).
- `src/lib/agent/tools/registry.ts` (+ test) — aggregates the 4 read tools + dispatch-by-name (unknown → escalate); `QUOTE_TOOL_NAMES` gates `freshQuote`.
- **Documented deviations/deferrals** (flagged by review, not silent): single detected-language reply instead of the §4.2 3-language structured object (language pinned server-side); `request_approval` write-flow handled by Task 5 (not in the read-loop's decisions); `confidence` surface + the ~turn-10 rolling key-facts summary deferred to Plan 09; the input-screen/rate-limit are the **caller's precondition** (Task 6), not re-run in the loop.
- **Shadow mode** is a property of the caller (the loop only returns a decision; it never sends).

### Task 5 — Approval commit/reject + Action Card (spec §5 / §6.3 / §10)

**Task 5a (DONE) — the commit/reject service:**
- `src/lib/agent/approve-order.ts` (+ test) — `decidePendingOrder(callback, tap, deps)`: **Approve** re-verifies the quote_id's provenance (`verifyQuoteToken {ignoreExpiry}` — order re-priced live, so expiry is irrelevant; forged/wrong-kind → blocked), guards customer name/phone/address, atomically claims `AWAITING_STAFF → APPROVED`, commits via `createOrder(input, { userId: decidedById })` (the staff approver as actor), and links the Order; any failure (returned OR thrown) reverts the claim. **Reject** atomically claims `AWAITING_* → REJECTED` and sets `Conversation.aiState=HUMAN_ACTIVE`. Idempotent + race-safe (atomic claim ⇒ exactly one Order under concurrent taps; verified by test). `pendingOrderToCreateInput` maps the verified quote's dim snapshot → a single placement room; `scheduledAt` is a placeholder (approval time) — the bot never commits a delivery date, staff set it. `makeApproveDb()` is the Prisma impl (conditional `updateMany` claims). 13 tests, no DB needed.
- ⚠️ Quote `ignoreExpiry` added to `quote-token.ts` (provenance-only check). Single-room agent orders only (one quote = one `SlabInput`).

**Task 5b (NEXT) — the route + Action Card posting:**
- Telegram `callback_query` routing into `decidePendingOrder` (lands at the existing `src/app/api/telegram/webhook/route.ts` — Telegram has one webhook; service-auth applies to any server-to-server `/api/agent/*` path). Parse via the Plan 03 callback codec; the route catches a `telegramCallbackId` P2002 (same-tap retry) → no-op; answers the callback + sends the customer confirmation on commit.
- Posting the staff Action Card: `notify_staff`/`request_approval` builds the `PendingOrder` (Plan 06 `draft_order`, flips to `AWAITING_STAFF`) then posts a staff-group message with raw facts + `[Approve][Reject]` (Plan 03 keyboard). Approval SLA: hold + re-ping every 10–15 min, up to 1 day (spec §10).

### Task 6 (DONE) — Wire the live webhook entry, Shadow mode
- `src/lib/agent/runtime-config.ts` (+ test) — `loadAgentRuntimeConfig` (AppConfig `agent.runtime`, **default `{enabled:false, mode:'shadow'}`** — kill-switch OFF until the owner opts in), `loadKnowledgeBase` (AppConfig `agent.knowledge_base`.content), and the pure `shouldAgentHandle` gate (enabled + `aiState==='AI_HANDLING'` + `!aiPaused`).
- `src/lib/agent/shadow.ts` (+ test) — `runAgentShadow`: screen → detectLanguage → buildSystemPrompt(KB) → `runAgentTurn` → structured **log only** (suspicious inbound escalates with NO model call). `toLlmHistory` maps stored messages → loop history. **Sends nothing.**
- `src/lib/agent/webhook-entry.ts` — `runAgentForInbound`: reads the kill-switch + gate first, loads recent history + KB, builds the provider (`createProviderByKey(AGENT_MODEL_KEY ?? 'claude-opus-4-8')`), runs Shadow. Total try/catch — never breaks inbox delivery.
- `src/app/api/telegram/webhook/route.ts` — step 8 fires `void runAgentForInbound(...).catch(...)` for inbound customer TEXT only (not outgoing/edited/media-only), fire-and-forget so the webhook still 200s fast.
- Reviewed (safety): confirmed no send path exists in the whole agent tree (read-only tools, loop returns a decision); gate read before any model work; default OFF; webhook can't be broken by the agent. **Validatable now on `npm run dev`** once `agent.runtime.enabled=true` is set in AppConfig (proposals appear in the `[agent:shadow]` logs).
- **Deferred:** auto-send (Plan 09 rollout); Telegram 429/retry_after handling lands with the send path (Task 5b/Plan 09).

### Task 5b (DONE — built/tested; propose-execution staged to Plan 09)
- ✅ Wired live: `src/app/api/telegram/webhook/route.ts` routes `callback_query` → `handleApprovalCallback` (`approval-webhook.ts`) → `decidePendingOrder` (answer + card-edit + customer commit-confirmation). Tested.
- ✅ Built + tested: the loop's `request_approval` decision (`loop.ts` `REQUEST_APPROVAL_TOOL`) and `proposeOrder`/`formatActionCard` (`propose-order.ts`: `draft_order` → `AWAITING_STAFF` → staff `[Approve][Reject]` card). `.env.example` gained `AGENT_STAFF_CHAT_ID`.
- ⏸ `proposeOrder` is intentionally NOT reachable from the Shadow path — Shadow logs a `request_approval` decision but writes nothing (spec §14 zero write-action leakage). It activates with the write-capable rollout mode (Plan 09). Pre-go-live: decide whether the staff tap needs CRM-identity auth (currently authorized by Telegram staff-group membership; `decidedById: null`).

---

## Deliberate deferrals → Plan 09
Inbox 4-state HITL UX (`/inbox`), the owner KB editor admin page, and the eval/golden-set + Shadow bake-off harness + native-Uzbek review. Plan 08 makes the agent *run and log*; Plan 09 makes it *reviewable and launch-gated*.

## Self-review (plan author)
- **Spec coverage:** the §11 prerequisites (service-auth ✓ Plan 02, callback handling ✓ Plan 03, outbound auto-send path, LlmProvider, voice STT) are all addressed here or already built; the price-integrity chain (Plans 04/06/07) is consumed, not re-implemented.
- **Risk controls:** live-webhook work ships in Shadow behind the kill-switch; the approval path is idempotent and double-gated; auto-send stays off until Stage-1 gates pass.
- **Reuse:** every guardrail/tool/primitive from Plans 01–07 is wired, not rebuilt; new code is the provider clients, the loop orchestration, the prompt/KB assembly, and the approve route.
