# AI Agent — Plan 09: Operator UI (control panel + inbox integration)

> The agent engine (Plans 01–08) is headless: controlled by env/AppConfig, output only in server logs. Plan 09 gives the owner a cockpit so they can drive and watch it. Build in slices.

**Spec sections:** §10 (inbox 4-state HITL, ghost-draft, kill-switch at top of /inbox, model/confidence surface), §9 (KB editor), §3/§14 (model selection + bake-off), §14 (rollout stages).

## Slice A (this plan) — Agent control panel
- **Backend:** `AgentRuntimeConfig` gains `modelKey`; `loadAgentRuntimeConfig` resolves `modelKey` from AppConfig (→ env `AGENT_MODEL_KEY` → `claude-opus-4-8`). `saveAgentRuntimeConfig` upserts AppConfig `agent.runtime` (validates `enabled:bool`, `mode∈{shadow,suggest,auto}`, `modelKey∈registry`). `webhook-entry` uses `config.modelKey`. Route `GET/PUT /api/agent/runtime` (owner-gated via `inbox.access`) + audit. Pure `validateRuntimeUpdate` unit-tested.
- **Frontend:** `/(app)/agent` page — global ON/OFF kill-switch, model dropdown (brains from `bakeOffModels()`, with price/provider), mode selector (Shadow enabled; Suggest/Auto shown disabled "rollout — Plan 09 slice C"), last-updated, Save. Sidebar item "AI Агент · AI agent" gated `inbox.access`.

## Slice B (next) — Inbox ghost-drafts + test affordance
- Persist the Shadow proposal per conversation (e.g. `Conversation.aiDraft` + `aiDraftMeta` JSON, or an `AgentTurn` row) instead of only console-logging; `runAgentForInbound` writes it.
- `/inbox` (InboxClient) renders the agent's proposed reply as a ghost-draft on the conversation (model + tools + decision badge), per spec §10 — read-only in Shadow.
- A **"simulate inbound"** dev affordance (owner-only) to inject a customer message into a conversation so the agent can be exercised without real Telegram / a tunnel.

## Slice C (later) — write-action activation + review UX + KB editor + bake-off
- Suggest/Auto modes (one-click Send / auto-send per the rollout gates); wire `proposeOrder` (Action Card) behind a write-capable mode; the quote-review queue + write-action Action Card review in `/inbox` (spec §10).
- KB editor admin page (spec §9). Provider bake-off harness + native-Uzbek review surfacing (spec §14).

## Cautions
- Owner-gated (`inbox.access`); kill-switch stays default OFF; Shadow remains send/write-free until Slice C explicitly enables a write-capable mode.
- Model dropdown lists registry models; flag `requiresSnapshotPin` ones (pin dated snapshots before going wide).
