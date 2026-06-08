# AI Agent — Plan 09 Slice B/C build doc

> Companion to [`2026-06-07-ai-agent-09-operator-ui.md`](2026-06-07-ai-agent-09-operator-ui.md) (the Plan 09 outline). Slice A (control panel + provider-key UI + local test console) is DONE. This doc is the concrete build plan for **Slice B** (make Shadow proposals visible + testable in `/inbox`) and **Slice C** (write-action activation + review UX + KB editor + bake-off). Written 2026-06-08.

## Where we are
The agent engine (Plans 01–08) runs in **Shadow** on the live webhook: per inbound text it screens → detects language → builds the prompt+KB → runs the loop → and **logs the proposed decision to the server console** (`[agent:shadow]`), sending/writing nothing. Conversational quality is dialed in. The owner can drive it from `/agent` (kill-switch, model, provider keys) and exercise it from the `/agent` test console — but the proposals are invisible inside the actual inbox and evaporate into the logs.

Slice B turns those ephemeral console logs into **persisted, inbox-visible ghost-drafts**; Slice C makes them **actionable** (send / approve).

## Decisions (resolved 2026-06-08)
- **(a) Proposal storage → a NEW `AgentProposal` table** (not fields on `Message`). Confirmed by the owner. Rationale: a proposal has its own lifecycle and ~10 fields (decision, reply, screen, model, toolCalls, usage, confidence, …), most of which would be null on the vast majority of `Message` rows (inbound media, outbound staff replies). A 1:1-per-inbound-message side table keeps `Message` clean, gives the bake-off/eval its own queryable home, and cascades away with the conversation.
- **(b) Suggest UX → Send + Edit** (spec §10). The ghost-draft renders in the compose box; the operator can one-click **Send** verbatim or **edit then send**. (Not send-only.)
- **(c) Order-approval auth → require CRM identity.** The staff `[Approve][Reject]` that commits a `PendingOrder` → real `Order` must be performed by an authenticated CRM user, recording `PendingOrder.decidedById`. This closes the Plan 08 finding (Telegram-group-membership-only taps left `decidedById: null`, no per-person attribution). Implementation in Slice C: approvals happen through the owner-gated `/inbox` UI (the user is logged in there), not an anonymous Telegram group tap. (A Telegram-user → CRM-user mapping could re-enable in-Telegram taps later, but is out of scope for Slice C.)

## Slice B — persist proposals + inbox ghost-draft + simulate-inbound

### Step 1 (this step) — persist agent proposals  ✅ build target of this session
- **New `AgentProposal` model** (`@@map("agent_proposals")`): `id`, `conversationId` (FK → Conversation, `onDelete: Cascade`), `inboundMessageId` (`@unique` — the triggering `Message.id`; one proposal per inbound message ⇒ webhook-retry idempotency + the natural "latest proposal per conversation" join key), `language`, `decision` (reply|escalate|request_approval|blocked|max_turns), `reply` (String?, full single-language text), `escalationReason` (String?), `approvalDraft` (Json?, the `ApprovalDraft` when decision=request_approval), `screen` (Json — verdict+flags), `modelKey`, `toolCalls` (Json `[{name,ok}]`), `usage` (Json), `turns` (Int), `confidence` (String?, nullable — the loop doesn't surface it yet), `escalatedEarly` (Bool), `createdAt`. Index `[conversationId, createdAt]`. `Conversation` gains the back-relation `agentProposals AgentProposal[]`. No FK on `inboundMessageId` (matches the inbox's no-FK convention for `Message`/user refs; conversation cascade handles cleanup).
- **`src/lib/agent/proposal.ts`** — pure `buildProposalRow(outcome, {conversationId, inboundMessageId, modelKey})` mapping a `ShadowOutcome` → the row, plus a thin `saveAgentProposal(...)` shell over a narrow injectable `db` (lazy `@/lib/prisma`), idempotent via `createMany({ skipDuplicates:true })` on `inboundMessageId` (ON CONFLICT DO NOTHING). Unit-tested with a fake db (`proposal.test.ts`).
- **`webhook-entry.ts`** captures the `runAgentShadow` return and calls `saveAgentProposal` (inside the existing total try/catch, so a persistence failure never breaks inbox delivery). Console logging in `shadow.ts` is left untouched.
- **Verify:** `prisma validate`; `npm test` green; tsc clean on changed files.

### Step 2 — inbox ghost-draft + "Simulate inbound"
- `/inbox` (InboxClient) loads the **latest `AgentProposal`** per open conversation and renders it read-only: the proposed reply in/above the compose box, with badges for model · decision · tools · language · screen-verdict (spec §10 confidence surface: none/amber/red, never a number, staff-side only). Shadow = read-only (no Send button yet).
- API: `GET /api/agent/proposals?conversationId=…` (owner-gated `inbox.access`) returning the latest proposal.
- **Owner-only "Simulate inbound"**: a dev affordance that injects a typed customer message into a conversation (writes an INBOUND `Message`, then calls `runAgentForInbound`) so the full path can be exercised with no Telegram / tunnel. Gated `inbox.access`; clearly labelled as a test tool.

## Slice C — write-action activation + review UX + KB editor + bake-off
- **Suggest mode** (decision b = Send+Edit): the ghost-draft gets **Send** / **edit-then-Send** wired through the existing inbox outbound path (`tgSendBusinessMessage`); each customer-facing message is operator-approved. First customer-facing stage. `webhook-entry` stops short-circuiting on `mode==='suggest'`.
- **Order-taking live**: wire the dormant chain `proposeOrder` → staff Action Card → `approval-webhook` → `createOrder`. Per decision (c), the Approve/Reject action requires a logged-in CRM user and records `decidedById`; the quote-review queue + write-action Action Card review live in `/inbox` (spec §10). Photo/voice quotes stay human-reviewed (spec §2/§10).
- **Auto mode + deploy**: auto-send replies (orders still staff-approved) behind the rollout gates (spec §14); deploy to prod in Shadow → watch → graduate.
- **KB editor** admin page (spec §9): four labelled textareas, per-section counter, Save & Test, last-updated, revert, AuditLog row per save, UZS-number-in-Q&A warning.
- **Provider bake-off** harness + native-Uzbek review surfacing (spec §3/§14): Claude vs Gemini vs OpenAI over the same real messages (the persisted `AgentProposal` rows are the substrate), reviewer scores, owner picks the primary model.
- Parallel/later: voice (`gemini.transcribe()`), vision (drawing photos), few-shot wiring (curated+anonymized chats as a TONE guide only), eval golden set.

## Cautions
- Owner-gated (`inbox.access`); kill-switch stays default OFF; **Shadow remains send/write-free** until Slice C explicitly enables a write-capable mode.
- Persisting a proposal is NOT sending — Slice B writes only to `agent_proposals` (the agent's own log table), never to `Message`/`Order`/Telegram.
- Model dropdown flags `requiresSnapshotPin` models; pin dated snapshots before going wide.
- The repo applies schema with `prisma db push` at deploy (no migration files) — validate locally with `prisma validate` + `prisma generate`.
