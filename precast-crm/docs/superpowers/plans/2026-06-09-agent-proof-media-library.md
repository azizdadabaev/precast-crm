# Plan — Agent-sendable proof media library (videos + photos)

**Status:** SCOPING (no code yet — review first)
**Why:** For construction materials, visual proof converts better than more persuasion. A customer who asks *"videosi bormi?"* is one step from *"qanday buyurtma qilamiz?"*. Today the agent answers that moment with a **form** ("ism + telefon qoldiring"). This feature lets the agent send 5–10 curated **videos/photos itself, instantly**, the moment the customer reaches the PROOF stage — turning the strongest buying signal into an instant trust-builder instead of a hand-off.

Pairs with the prompt-level CONVERSATION STAGE work (commit `8eb88e4`): the prompt now *recognizes* PROOF and promises proof; this gives it the ability to actually **deliver** it.

---

## What already exists (big head start)

- `tgSendBusinessPhoto(businessConnectionId, externalId, fileId)` — sends media over a Business connection **by `file_id`**.
- `tgUploadPhotoGetFileId(stagingChat, …)` — the proven workaround: Business connections **reject fresh uploads**, so we upload once to a staging channel, capture the `file_id`, and reuse it forever. `TELEGRAM_STAGING_CHAT_ID` is already wired in prod.
- `sendBusinessPhoto` in `inbox-send.ts` is sim-aware (persists locally for `sim-` chats).
- The quote-image flow already establishes the pattern we'll reuse: **a tool call during the turn → a side-effect send after the turn, gated by mode** (auto sends; suggest surfaces to the operator; shadow logs).

So the media-send plumbing is mostly done for photos. The new work is: a **video** send/upload helper, a **curated library + owner UI**, an **agent tool**, and the **send integration + gating**.

---

## Design

### 1. Storage & data model
- Curated, owner-managed — NOT arbitrary media. Expect ~5–10 videos + ~5–10 photos.
- Each item is durably identified by its Telegram **`file_id`** (cheap to resend, no re-upload, no bandwidth). Keep a local copy only for the CRM preview thumbnail (owner-gated; do NOT expose publicly — see the open `/uploads` exposure note).
- **Recommended store:** `AppConfig["agent.proof_media"]` JSON (migration-free, same pattern as the KB and `table.design`). Shape per item:
  ```
  { id, kind: "VIDEO" | "PHOTO", fileId, title, tags: string[], caption?, enabled, order }
  ```
  (A dedicated `AgentMedia` table is the alternative if we later want per-send analytics; AppConfig is the simpler Phase-1 choice.)

### 2. Owner UI — `/agent` → "Proof media" tab
- Upload a video/photo, set **title + tags + optional caption**, enable/disable, reorder, preview.
- On upload the server **stages it once** (upload to `TELEGRAM_STAGING_CHAT_ID` → capture `file_id`) and stores `{fileId, …}`. The owner never deals with file_ids.
- Tags drive selection, e.g.: `montaj` (installation), `tayyor_obyekt` (finished object), `monolit`, `zina`, `gazoblok`.

### 3. Telegram API additions
- `tgUploadVideoGetFileId(stagingChat, …)` + `tgSendBusinessVideo(businessConnectionId, externalId, fileId, caption?)` — mirror the existing photo helpers (same staging→file_id→business-send pattern).
- `sendBusinessVideo` in `inbox-send.ts` (sim-aware), mirroring `sendBusinessPhoto`.

### 4. Agent tool — `share_proof`
- The model calls it when in PROOF stage. Input: `{ topic?: "montaj" | "tayyor_obyekt" | "monolit" | "zina" | "gazoblok", count?: number }`.
- Returns the matched library items (ids + titles) **as data** — it does NOT send by itself (so it composes with mode gating). Falls back to the default set when no tag matches. Caps at **N=3** per call.
- Registered in the tool registry; documented so the model knows: *in PROOF, call `share_proof` and add one short confident line.*

### 5. Send integration (reuse the quote-image pattern)
- After the loop, parse the turn's `share_proof` tool calls (same way `extractQuotedRooms` parses `get_quote`) to get the selected `file_id`s.
- **Mode gating (mirrors auto-mode reply gating):**
  - **AUTO** → send the selected videos/photos via the Business connection (by file_id) + the agent's short text line.
  - **SUGGEST** → surface the selection in the proposal card so the operator sends with one tap (new affordance on the ghost-draft).
  - **SHADOW** → log only, no send.

### 6. Abuse / cost gating
- Rate-limit proof sends **per conversation** (e.g. max 1 batch / few minutes, max X batches / conversation) so a customer can't trigger dozens of sends.
- Real Business chats only; `sim-` chats persist locally (no Telegram call), consistent with existing senders.
- file_id sends are cheap; staging upload happens once at curation time, never in the customer path.

### 7. Prompt wiring (small)
- PROOF stage already says "Albatta… videolar bor 👍". Add: *when in PROOF and proof media exists, call `share_proof` to actually send it (don't just promise).* Keep the never-expose-limits rule.

---

## Build order (each independently shippable)
1. **Telegram video helpers** (`tgUploadVideoGetFileId`, `tgSendBusinessVideo`, `sendBusinessVideo`) + unit tests.
2. **Storage + owner UI** (`agent.proof_media` AppConfig, `/agent` Proof-media tab, staged-upload pipeline).
3. **`share_proof` tool** + registry + selection logic + tests.
4. **Send integration + mode gating** (auto-send; suggest-surface; shadow-log) + rate-limit + tests.
5. **Prompt line** + deploy + live test.

---

## Open questions for the owner
1. **Source media:** do we have 5–10 montaj + 5–10 tayyor-obyekt videos ready, and a few photos? (Quality + which objects.)
2. **Default set:** when the customer asks generically ("videosi bormi?"), which 2–3 clips should be the default send?
3. **Tags we care about:** montaj / tayyor_obyekt / monolit / zina / gazoblok — anything else (e.g. by region, by floor type)?
4. **Caption language:** per-clip caption, or let the agent's accompanying line carry the context? (Captions could be uz-latin only, like the share card.)
5. **Cap:** is 3 clips per send the right ceiling?
