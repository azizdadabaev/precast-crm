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

### Task 4 — Agent loop (spec §4.3 / §6)
- `src/lib/agent/loop.ts` — per inbound message: kill-switch + per-chat `aiPaused` → input-screen (Plan 05 `inbound-screen` + rate-limiter Plan 01 + media-allowlist) → load `Conversation` + history → `LlmProvider.generate` with the Plan 07 toolset, **forcing a quote tool on price-intent turns** → dispatch tool calls (parallel where order-independent) → feed results back → loop to a **12-turn guard**; from ~turn 10 inject a rolling key-facts summary (name, dims, agreed price, quote_id). Structured-output action `{action: reply|escalate|request_approval, message_uz_latin, message_uz_cyrillic, message_ru, confidence, reason_for_escalation}`; route on `action`.
- **Output validation before any send:** Plan 05 `outbound-validator` (price-without-quote_id, links, etc.) + delivery-date / discount / PII / language-mismatch checks. Block+replace on violation.
- **Shadow mode:** generate + log only, send nothing (spec §14 Stage 1). Auto-send is a later gate.
- Tests: loop control (turn guard, tool-forcing on price intent, escalate routing) with a fake `LlmProvider`; the output-validator wiring; Shadow = no send.

### Task 5 — Approval webhook + Action Card (spec §5 / §6.3 / §10)
- `src/app/api/agent/approve/route.ts` — service-auth (Plan 02 `service-auth`); parse `callback_query` via the Plan 03 callback codec; idempotency on UNIQUE `PendingOrder.telegramCallbackId`. **Approve** → `createOrder(input, { userId: null })` (Plan 06) → flip `PendingOrder.status=APPROVED`, set `orderId`, send the customer confirmation. **Reject** → `status=REJECTED`, set `Conversation.aiState=HUMAN_ACTIVE`. Answer the callback (Plan 03 wrapper).
- Posting the staff Action Card: `notify_staff`/`request_approval` builds the `PendingOrder` (Plan 06 `draft_order`) then posts a staff-group message with raw facts (name, phone, line items, price-from-quote_id) + `[Approve][Reject]` inline keyboard (Plan 03 keyboard wrappers). Approval SLA: hold + re-ping every 10–15 min, up to 1 day (spec §10).
- Tests: callback dispatch + idempotency (double-tap → one Order) with a fake db; approve→createOrder happy path; reject→HUMAN_ACTIVE.

### Task 6 — Wire the live webhook entry (guarded)
- Hook the agent loop into the existing Telegram Business webhook so inbound messages reach it — but behind the **global kill-switch** (read first) + per-chat `aiPaused`, defaulting to **Shadow (log-only)**. No auto-send until the owner flips the stage. Telegram 429 → honour `retry_after`; hard send failure → escalate.

---

## Deliberate deferrals → Plan 09
Inbox 4-state HITL UX (`/inbox`), the owner KB editor admin page, and the eval/golden-set + Shadow bake-off harness + native-Uzbek review. Plan 08 makes the agent *run and log*; Plan 09 makes it *reviewable and launch-gated*.

## Self-review (plan author)
- **Spec coverage:** the §11 prerequisites (service-auth ✓ Plan 02, callback handling ✓ Plan 03, outbound auto-send path, LlmProvider, voice STT) are all addressed here or already built; the price-integrity chain (Plans 04/06/07) is consumed, not re-implemented.
- **Risk controls:** live-webhook work ships in Shadow behind the kill-switch; the approval path is idempotent and double-gated; auto-send stays off until Stage-1 gates pass.
- **Reuse:** every guardrail/tool/primitive from Plans 01–07 is wired, not rebuilt; new code is the provider clients, the loop orchestration, the prompt/KB assembly, and the approve route.
