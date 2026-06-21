not# Drawing → Quote → Chat Workflow — Design

**Date:** 2026-06-03
**Branch:** `feat/drawing-to-quote` (off `feat/telegram-business-inbox`, which is itself unmerged)
**Status:** Design approved in brainstorming; awaiting user review of this doc before planning.

## Goal

Let an operator turn a floor-plan drawing a client sends in the Telegram inbox into a saved, multi-room beam-and-block quote — and send the finished quote straight back into the same chat — without ever leaving the CRM or re-typing data they already have.

This is **subsystem #3** of the planned respond.io-style conversation layer (drawing → calculator), minus the AI-vision auto-extraction, which the user deliberately deferred after testing it manually: hand-drawn plans plus uneven client photo quality make the model misread dimensions. AI vision can return later as an *optional pre-fill into the same room-capture UI* once drawings are cleaner; nothing in this design blocks that.

## Scope

Three stages, one cohesive feature, built and shippable in order:

- **① The bridge** — "Calculate from this chat" handoff: open the calculator with the drawing docked beside the table and the client's name/handle pre-filled; permanently link the resulting Project back to the conversation.
- **② Visual room-capture** — draw a box around each room on the docked drawing → it becomes a calculator row; a live coverage tally makes "every room covered" *visible*; the boxed drawing is saved with the quote as a record.
- **④ Close the loop** — from a saved quote, render the summary PNG (existing Table Image Designer) and send it back into the originating Telegram chat as a photo.

(Stage ③ — AI vision — is **out of scope**, see Deferred.)

## Design Principles (the quality bar)

1. **No information leaks.** Every new inbox-touching endpoint is gated by the existing `withInboxAccess` (permission `inbox.access` + per-session unlock). Conversation contents — chat browsing, the link back to Telegram — are never exposed to users who lack `inbox.access`, even via the Project view. See *Security & Privacy*.
2. **No bugs by construction.** Pure logic (contact-phone parsing, box-coordinate normalization, the conversation→calculator prefill schema) is extracted into unit-tested functions. The calculation engine is **not touched** — this feature only feeds it inputs and renders its outputs.
3. **Surgical & reuse-first.** We extend existing machinery (the `?prefill=` URL handoff, the `loadFrom` store reset, the image lightbox, the Table Image Designer, the reply API + SSE) rather than building parallel systems. New schema is additive and nullable; no migration of existing rows.
4. **Best-practice review on every task.** Implementation runs under subagent-driven development: each task gets a spec-compliance review then a code-quality review before it's accepted.

## Current State (grounded)

- A `Project` is a *building*; each `Calculation` is *one room* in it (`prisma/schema.prisma` — `Calculation.projectId` → `Project`, one-to-many). The calculator (`src/components/calculation/MultiRoomCalculator.tsx`) is already a multi-room table over `rows: SlabRow[]`; the engine (`src/services/calculation-engine.ts`) is a pure function (room dims → beams/blocks/m²/pricing). Saving a Project requires only a phone number (`src/app/api/projects/route.ts`).
- The calculator state is a Zustand store persisted per-user to localStorage (`src/store/calculator.ts`). `loadFrom(partial)` resets every session field to defaults, then layers the partial on top — so a handoff cannot leak a prior client/phone. There is already an `?fromProject=`, `?fromOrder=`, and `?prefill=<encoded>` URL-handoff convention (`src/app/(app)/calculations/page.tsx:82-147`), each of which calls `loadFrom` and then strips the query with `router.replace`.
- `SlabRow` (`MultiRoomCalculator.tsx:34-65`) holds `innerWidth/innerLength/bearing/correction/extraBeams/forceStartBeam/patternOverride/result` plus override fields. Stage ② adds one optional field to it.
- The inbox (branch `feat/telegram-business-inbox`): `Conversation` stores `externalId` (Telegram chat id), `businessConnectionId`, `displayName`, `username` — **no phone** (Telegram never exposes a chatter's phone). A "shared contact" message is currently dropped as `OTHER` (`src/lib/telegram/parse.ts:98`), so even a willingly-shared number isn't captured today. Messages with `mediaKind: "IMAGE"` carry `mediaPath` (served from the conversation's media folder). The reply API (`src/app/api/inbox/[id]/reply/route.ts`) sends **text only** today via `tgSendBusinessMessage`. There is **no** link between the inbox and the calculator.

## Data Model Changes (all additive, `prisma db push`)

```prisma
model Project {
  // … existing fields …
  conversationId String?       // nullable link to the originating Telegram chat
  conversation   Conversation? @relation(fields: [conversationId], references: [id], onDelete: SetNull)

  @@index([conversationId])
}

model Conversation {
  // … existing fields …
  sharedContactPhone String?   // captured when a client taps "Share contact"; DIGITS-ONLY
  projects           Project[] // back-relation
}

model Calculation {
  // … existing fields …
  // Stage ② annotation — the box this room was drawn over, normalized to
  // the source image's natural size (each value 0..1), plus the project-
  // owned copy of the drawing it sits on. Null for rooms typed by hand.
  annotationBox       Json?    // { x, y, w, h } each 0..1
  annotationImagePath String?  // served path of the project-owned drawing copy
}
```

- `onDelete: SetNull` on `Project.conversationId`: deleting a conversation (the existing inbox feature) must not delete the quote it produced — the link simply goes null.
- **Drawing evidence outlives the chat.** Inbox media lives under the conversation folder and is `fs.rm`'d when the conversation is deleted. So at project save, referenced drawings are **copied** into a project-owned media dir (`<MEDIA_ROOT>/projects/<projectId>/`), and `annotationImagePath` points at the copy. The quote's visual record survives conversation deletion.

## Stage ① — The Bridge

### Components & interfaces

- **Inbox thread header button** (`src/app/(app)/inbox/InboxClient.tsx`): "Ҳисоблаш · Calculate from this chat". Visible only inside an open conversation. Navigates to `/calculations?fromConversation=<conversationId>`.
- **Conversation context endpoint** — `GET /api/inbox/[id]/context`, gated by `withInboxAccess`. Returns exactly what the handoff needs, nothing more:
  ```ts
  {
    displayName: string;
    username: string | null;
    sharedContactPhone: string | null;
    images: { messageId: string; path: string; createdAt: string }[]; // IMAGE messages, newest first
  }
  ```
- **Calculator handoff** (`calculations/page.tsx`, same mount effect as the existing prefills, ordered before `?fromProject`): when `?fromConversation=<id>` is present and the user is hydrated, fetch the context, then
  ```ts
  loadFrom({ client: { name: displayName, phone: "", address: "", consentGranted: false } });
  setSourceConversationId(id);   // new store field, persisted like draftProjectId
  ```
  then `router.replace("/calculations")` to strip the query (mirrors the existing prefill). The docked drawing rail reads `images` from the fetched context (not persisted — re-fetched on reload while `sourceConversationId` is set).
- **Store addition** (`src/store/calculator.ts`): `sourceConversationId: string | null` + `setSourceConversationId`, added to `INITIAL_STATE`, `PersistedShape`, and `partialize`. `loadFrom`/`clearAll` reset it to null (so a fresh calculation can't inherit a stale chat link).
- **Docked drawing rail** (new component, e.g. `src/components/calculation/DrawingDock.tsx`): a resizable left panel showing a list of drawing URLs, reusing the existing lightbox/zoom/←→ viewer (`src/components/inbox/ImageViewer.tsx`). It is source-agnostic — the URLs come from the live conversation context when launched fresh from a chat, or from the loaded project's `annotationImagePath` copies when a linked draft is reopened. Rendered whenever the session has a drawing source.
- **Phone (the one field Telegram won't give us):** name pre-fills automatically; phone stays the manual save-gate. **Optional sweetener:** extend `parse.ts` so a `contact` message yields `{ kind: "CONTACT", meta: { phone, name } }` (instead of `OTHER`); the webhook stores the digits-only number on `Conversation.sharedContactPhone`; the context endpoint surfaces it; the calculator shows a one-tap "📞 Use 998…" chip that fills the phone field. When the client never shares a contact, behavior is unchanged (manual entry).
- **Save → link** (`src/app/api/projects/route.ts`): accept optional `conversationId` in the POST/PUT body and persist it onto the Project. **Guard:** setting `conversationId` requires the caller to have `inbox.access` — a non-inbox operator cannot attach (and thereby surface) a conversation they aren't allowed to see. If the body carries a `conversationId` but the caller lacks `inbox.access`, drop it silently (save the quote without the link) rather than error.
- **Back-links:**
  - Project/quote view → "Чатни очиш · Open chat" deep-link to `/inbox/<conversationId>`, rendered **only** for users with `inbox.access`.
  - Inbox thread → "Бу чатдан ҳисоб-китоблар · Quotes from this chat": a small list of Projects where `conversationId = this`, each linking to the project. (`GET /api/inbox/[id]/projects`, gated by `withInboxAccess`.)

### Flow

Client sends drawing → operator opens the chat → clicks "Calculate from this chat" → calculator opens with the drawing docked left and the name pre-filled → operator works the rooms (Stage ②) → enters (or one-taps) the phone → Save Project writes `conversationId` → the chat now lists the quote, and the quote links back to the chat.

### Errors

- Malformed/stale `?fromConversation` or a context fetch failure → the calculator still opens on the persisted draft; the rail shows "Чизмани юклаб бўлмади · Couldn't load drawings" (non-blocking), matching the existing "malformed prefill falls through" posture.
- Conversation deleted after handoff but before save → save still succeeds; `conversationId` FK is `SetNull`-safe and the copied drawing is what persists.

## Stage ② — Visual Room-Capture

### Components & interfaces

- **Annotation overlay** layered over the docked drawing image: pointer-drag creates a rectangle → spawns a new `SlabRow` (via the existing `addRow` path) bound to that box; the box is numbered + colored to match its table row. Coordinates are stored **normalized to the image's natural size** (`{x,y,w,h}` each 0..1) so they survive zoom, resize, and re-render.
- **`SlabRow` addition** (`MultiRoomCalculator.tsx`): optional
  ```ts
  box?: { imagePath: string; x: number; y: number; w: number; h: number } | null;
  ```
  The box references its drawing **by path**, not by message id — after save the source becomes the project-owned *copy* (no Telegram message exists), so a path keys the box uniformly across live-capture and reopened-draft states. Hand-typed rows leave it null. The engine ignores it; it's purely presentational + persisted.
- **Two-way highlight:** hovering/selecting a table row highlights its box and vice-versa; deleting a row removes its box and vice-versa.
- **Per-box readout:** once the row has dimensions and a `result`, the box shows its m² (and optionally beams) so coverage reads at a glance on the drawing itself.
- **Coverage tally** (calculator footer or rail header): "N хона · N rooms · ΣX m² · ΣY beams" plus a manual "Чизма тўлиқ · Plan reviewed" affirmation toggle.
  - **Honest framing (stated in the UI):** without AI we cannot know the *true* room count from a hand-drawn plan, so this is a **strong visual aid, not an automatic guarantee** — it shows what's boxed and what bare floor is left, and the operator confirms completeness. The affirmation toggle is UI-only state (not persisted business data) in this version.
- **Persistence:** at save, each room's `box` + the project-owned copy of its source drawing are written to `Calculation.annotationBox` / `annotationImagePath` (see Data Model — drawings are copied into the project media dir). Reopening a draft (`?fromProject=`) rehydrates boxes over the copied images for editing.

### Flow

On the docked drawing, the operator boxes each room and types its two dimensions; the engine computes each live; the tally climbs; when every visible room is boxed and the totals look right, the operator saves — and the quote carries the annotated drawing as proof of what was measured.

### Errors

- Box drawn but no dimensions entered → row is incomplete; Save surfaces the existing per-row validation (an empty room can't price). A box with a zero-area drag is discarded.
- Coordinate clamp: all normalized values clamped to `[0,1]`; a box is rejected if `w` or `h` rounds to 0.

## Stage ④ — Close the Loop

### Components & interfaces

- **"Чатга юбориш · Send to chat"** button anchored in the calculator immediately after a successful Save, shown only when `sourceConversationId` is set *and* the caller has `inbox.access`. This is the natural moment: the summary table is already rendered and the chat link is in hand, so we avoid re-rendering an arbitrary project from a separate view. (It can later also surface on the project-detail view for re-sends; not required for this version.)
- **Render:** reuse the Table Image Designer's existing client-side PNG export (`html-to-image`) to produce the summary image blob — the same path the existing Send button already uses.
- **Send:** `POST /api/inbox/[id]/reply-photo` (multipart, `withInboxAccess`): validates content-type is an image and size ≤ a sane cap (e.g. 10 MB), saves the photo into the conversation media folder, calls a new `tgSendBusinessPhoto(businessConnectionId, chatId, buffer, caption?)` in `src/lib/telegram/api.ts`, then records an `OUTBOUND` `Message` (`mediaKind: "IMAGE"`, `mediaPath` = saved copy) and `emitInbox` so the thread updates live. On Telegram failure, mark the message `failed` (existing failed-bubble pattern).
- This also resolves the separately-raised pain of "download the PNG → find it in folders → drag into Telegram": the quote goes back to the client in one click.

### Errors

- Telegram send fails → failed bubble in the thread (reuse existing handling); the operator can retry.
- Oversize/invalid blob → 400 before any Telegram call.

## Security & Privacy

The user's hard rule is **no information leaks**, and personal chats have leaked into this inbox before. Boundaries:

- **All new inbox endpoints** (`/context`, `/projects`, `/reply-photo`) are gated by `withInboxAccess` (permission + unlock), failing closed like the rest of the inbox.
- **Linking requires `inbox.access`.** The project-save route only honors a `conversationId` from a caller who has `inbox.access`; otherwise it's dropped. This stops a non-inbox operator from attaching (and surfacing) a conversation they can't see.
- **Chat linkage is `inbox.access`-only everywhere.** "Open chat" links and the in-chat "Quotes from this chat" list render only for `inbox.access` holders. A user with `order.view` but not `inbox.access` sees the quote with no path into the conversation.
- **【Decision to confirm with user】 Drawing visibility.** The *copied* drawing under the project media dir is part of the quote's business record (what was measured), so the **default** is: it's viewable by users with the project's normal view permission (`order.view`) — they need to see the plan to fulfill the order — while *browsing the chat* stays `inbox.access`-only. If you'd rather the drawing image itself also be `inbox.access`-only, we gate the project-media route on `inbox.access` instead. (Flagged in the review hand-off.)
- **Bot token / secrets stay server-side** (unchanged); no secret reaches the client. Uploaded photos are validated for type and size before any filesystem write or Telegram call.
- No customer PII is logged; error messages are bilingual and generic.

## Testing Strategy

- **Unit (vitest):**
  - `parse.ts`: a `contact` message → `{ kind: "CONTACT", meta: { phone, name } }`; phone normalized to digits-only; non-contact unchanged.
  - Box-coordinate helper: clamps to `[0,1]`, rejects zero-area, round-trips natural↔normalized.
  - Conversation→calculator prefill: a zod schema for the `/context` response; malformed payload rejected.
- **Engine:** unchanged → existing engine tests must stay green (regression guard).
- **Typecheck:** `npx tsc --noEmit` clean.
- **Manual end-to-end (via the cloudflared tunnel, same as the inbox build):** send a drawing from a second Telegram account → "Calculate from this chat" → box 2–3 rooms + dimensions → Save (verify `conversationId` + copied drawings + boxes persist) → "Send to chat" → confirm the PNG arrives in the real chat and an OUTBOUND bubble appears live.

## Deferred / Out of Scope

- **③ AI vision dimension extraction** — deferred (accuracy on hand-drawn/low-quality images). Designed to slot into Stage ②'s capture UI later as an optional pre-fill.
- Multi-order-per-project; Instagram channel; AI auto-responder + escalation (subsystem #2). Separate specs.
- CAD/DWG parsing; perspective-correction of skewed photos.

## Sequencing

① (foundation: link + handoff + docked drawing) → ④ (small, high-value, reuses existing PNG + reply path; can follow immediately after ①) → ② (largest build; delivers the "every room covered" core goal). The plan will structure these as separate milestones, each independently shippable and reviewable.
