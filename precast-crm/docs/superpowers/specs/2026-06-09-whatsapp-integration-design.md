# WhatsApp Integration — Design

**Status:** DESIGN APPROVED · PARKED (not yet implemented — resume with writing-plans)
**Date:** 2026-06-09
**Goal:** Bring the existing Telegram AI sales agent + CRM to the owner's **WhatsApp** account, with **full feature parity** (text, grounded quotes, orders, floor-plan/photo vision, voice transcription, agent-sent proof media, unified inbox). Precast CRM — Uzbekistan beam-and-block manufacturer.

---

## Decisions locked (during brainstorming)

1. **Access path: UNOFFICIAL — owner's personal number via a WhatsApp-Web library (Baileys).**
   Chosen over the official Cloud API because it preserves the Telegram-Business feel: same number, same app, free, no 24h-window / paid-template limits. Trade-off accepted by the owner: it violates WhatsApp ToS → **real ban risk on the main business line**, and the session is fragile (must stay linked / re-scan QR). We design to contain and mitigate this, not eliminate it.
2. **Scope: full parity from day one** (incl. the media bridge: vision, voice, proof-media).
3. **Architecture: Approach 1 — thin sidecar bridge + internal HTTP, mirroring the Telegram webhook shape.** The brain, tools, DB, and inbox stay in the CRM (one source of truth); the bridge is a small, swappable transport layer.

**Library: Baileys** (TypeScript-native, lightweight, WebSocket-based, no headless browser, actively maintained) — preferred over whatsapp-web.js (Puppeteer-based, heavier).

---

## Architecture

```
Customer WA ⇄ Baileys (whatsapp-bridge) ──POST /api/whatsapp/inbound (secret)──▶ CRM agent pipeline
CRM sendWhatsApp* ──POST {bridge}/send (secret)──▶ Baileys ⇄ Customer WA
Owner ──▶ CRM QR/health page ──(proxied, secret)──▶ bridge /qr · /status
```

The data model is already channel-aware: `Conversation.channel` exists with `@@unique([channel, externalId])`. The agent brain (loop, tools, prompt, KB, vision, voice, pattern-policy, proof-media, order flow), the CRM (projects/calcalculations/orders/clients), and the inbox UI are all **channel-agnostic** and reuse unchanged. WhatsApp = a new adapter + the bridge.

---

## Components

### 1. `whatsapp-bridge/` — new sidecar service (Node + Baileys)
Transport only, no business logic:
- Maintains the Baileys socket + **multi-file auth state persisted to a volume** (survives restarts).
- Handles `connection.update`: QR generation, open/close, **auto-reconnect** (reconnect on drops; on logged-out → `qr` state).
- On inbound (`messages.upsert`, not `fromMe`): **normalizes** the WA message to a clean JSON shape (Baileys types stay in the bridge, out of the CRM), **downloads media** bytes, and POSTs to the CRM inbound endpoint (shared secret).
- HTTP endpoints:
  - `POST /send` — `{ to, kind: text|photo|video|location, text?, mediaBase64?, caption?, lat?, long? }` → sends via Baileys → returns `{ messageId }` or `{ error }`.
  - `GET /qr` — current QR (when not linked).
  - `GET /status` — `{ state: open|connecting|qr|logged_out, me? }`.

### 2. `/api/whatsapp/inbound` — CRM endpoint (new)
Mirrors `/api/telegram/webhook`: verify secret → upsert `Conversation(channel=WHATSAPP)` → persist inbound `Message` (media saved to `/uploads`) → call the **existing** `runAgentForInbound / runVisionForInbound / runVoiceForInbound` (unchanged). The bridge already normalized the payload, so the CRM side is a thin **validator** (`src/lib/whatsapp/parse.ts`), not a Baileys consumer.

### 3. Channel-aware outbound senders (`src/lib/inbox-send.ts`)
`sendBusinessReply / sendBusinessPhoto / sendBusinessProofMedia / sendBusinessLocation` (and a video variant) gain `switch (conversation.channel)`:
- `TELEGRAM` → existing `tgSendBusiness*` path.
- `WHATSAPP` → POST text/bytes/location to the bridge `/send`.
This is the core seam: the agent loop + auto-mode call the same sender functions; only the dispatch is new.

### 4. QR-link + health page (CRM, owner-only)
Renders the bridge QR (proxied through a CRM API route + secret, since the bridge is **not** publicly exposed), shows connection state, "relink", and a "logged out → re-scan" alert. A live health indicator tells the owner whether the WhatsApp line is up.

---

## Data model changes
- `ConversationChannel` += `WHATSAPP` (one enum value).
- **Recommended cleanup:** rename `Message.telegramMsgId` → `externalMsgId` (+ its `@@unique([conversationId, externalMsgId])`) so the external message id is channel-neutral. Touches `telegram/parse.ts` + `inbox-send.ts` persistence + reads. Can be deferred (store the WA id in `telegramMsgId` as a stopgap), but the rename is the correct generalization.
- Baileys auth state → a Docker volume on the bridge (not the DB).

---

## WhatsApp-specific notes that matter
- **Customer phone number is free.** A WhatsApp inbound's JID **is** the sender's number → `sharedContactPhone` is always populated (no "share contact" step like Telegram) → cleaner `lookup_client` + order conversion.
- **Proof media cannot reuse Telegram `file_id`s.** WhatsApp has no file_id concept, so the WhatsApp send path ships the **stored bytes** — the proof library's `previewPath` and the rendered quote-card PNG — to the bridge, which uploads fresh each time. Fine for a small curated library; the proof-media library keeps the local `previewPath` precisely for this.

---

## Reconnection & failure handling
- Auto-reconnect on socket drops; on **logged-out** → `state=qr`, CRM alerts the owner, inbound pauses until relinked.
- `/send` while the bridge is down/disconnected → the sender returns a failure (same contract as a failed Telegram bubble) → auto-mode routes to a human / marks the send failed. A WhatsApp outage **degrades gracefully**, never silently drops a customer.
- Ignore `fromMe` echoes; dedup by WA message id (the unique index).

---

## Rollout & safety (mitigating the unofficial-path risk)
- Start WhatsApp in **shadow** mode (observe, send nothing) → **suggest** → **auto**, the same staged path Telegram used.
- Reply-only (no unsolicited / bulk outreach), human-paced (the pipeline runs per inbound), reasonable volume — to protect the main line from a ban.

---

## Testing
- **Pure units:** the bridge **normalizer** (WA message types → internal shape) and **send-payload mapper**; the CRM **inbound validator** and the **channel-dispatch** in senders (inject a fake bridge-send fn). The socket/Baileys layer is integration-tested (kept thin so most logic is pure).
- The agent pipeline tests carry over unchanged.
- A **WhatsApp `sim-` path** (like Telegram's `simulate-inbound`) to exercise the brain end-to-end with no live socket.

---

## Reuses unchanged (no work)
Agent loop, tools (get_quote, gazoblok, stock, lookup_client, share_proof), prompt + KB, pattern-policy, vision (Gemini extractDimensions), voice (Gemini STT), proof-media library + selection, draft→order conversion, proposals + shadow/suggest/auto modes, the inbox UI + notifications. WhatsApp conversations appear in the **same unified inbox** with a channel badge.

---

## New env / deployment
- `whatsapp-bridge` service in `docker-compose.yml` (build from `whatsapp-bridge/`), **not** publicly exposed (internal network only; QR proxied via the CRM).
- Volume for Baileys auth state.
- New envs: `WHATSAPP_BRIDGE_SECRET` (shared bridge↔CRM auth), `WHATSAPP_BRIDGE_URL` (CRM → bridge).

---

## Open items / risks to revisit at implementation
- **Ban risk** is inherent to the unofficial path — accept + mitigate (rollout/volume above); have a fallback plan (a spare number, or migrate to the official Cloud API) if the line is banned.
- Decide the `telegramMsgId` → `externalMsgId` rename vs stopgap.
- Confirm base64-over-internal-HTTP for inbound media is acceptable (small images/voice notes) vs a shared uploads volume.

---

## Extensibility
The channel-dispatch + adapter pattern generalizes: **Instagram** (see `docs/instagram-integration-setup.md`) becomes another adapter (Meta messaging API) + an `INSTAGRAM` enum value, reusing the same brain/CRM/inbox. The senders' channel-switch is the shared seam.

---

## Next step when resumed
Invoke the **writing-plans** skill to turn this spec into a step-by-step implementation plan (bridge service → schema → channel-aware senders → inbound endpoint → QR/health page → sim path → tests → staged rollout).
