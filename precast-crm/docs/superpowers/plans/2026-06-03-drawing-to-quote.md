# Drawing → Quote → Chat — Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax. TDD for pure logic; interface + behavior + verification for UI. Run `npx tsc --noEmit` and `npx vitest run` from the inner `precast-crm/` app dir. Commit per task.

**Goal:** Turn an inbox drawing into a saved multi-room quote linked to its chat, and send the quote PNG back into that chat — without leaving the CRM.

**Architecture:** Reuse the calculator + engine, the `?prefill=`/`loadFrom` URL-handoff, the image lightbox, the Table Image Designer PNG export, and the inbox reply/SSE. New: a nullable `Project↔Conversation` link, per-room box annotations on `Calculation`, a docked drawing panel + annotation overlay in the calculator, a photo-send on the reply API, and shared-contact phone capture.

**Tech Stack:** Next.js 14 App Router, Prisma + Postgres (`db push`, no migrations), Zustand, React Query, Tailwind/shadcn, vitest. Bilingual UI (`"Ўзбекча · English"`).

**Spec:** `docs/superpowers/specs/2026-06-03-drawing-to-quote-workflow-design.md`.

**Privacy decisions (locked):**
- New inbox endpoints (`/context`, `/projects`, `/reply-photo`) gated by `withInboxAccess` (fail-closed).
- `projects` save only honors `conversationId` from a caller with `inbox.access`; else dropped silently.
- "Open chat" links + "Quotes from this chat" render only for `inbox.access` holders.
- **Drawing image** (project-owned copy) is viewable under normal project view (`order.view`); *chat browsing* stays `inbox.access`-only.

---

## Milestone ① — The Bridge

### Task 1: Schema — link + phone + annotation fields

**Files:** Modify `prisma/schema.prisma`.

- [ ] **Step 1: Stop any running dev server** (prisma generate locks the query-engine DLL on Windows if `next dev` holds it). Verify nothing is serving on the dev port before `db push`.

- [ ] **Step 2: Add fields.** On `model Project` add:
```prisma
  conversationId String?
  conversation   Conversation? @relation(fields: [conversationId], references: [id], onDelete: SetNull)
```
and add `@@index([conversationId])`. On `model Conversation` add:
```prisma
  sharedContactPhone String?   // digits-only; captured from a shared-contact message
  projects           Project[] // back-relation
```
On `model Calculation` add:
```prisma
  annotationBox       Json?    // { x, y, w, h } normalized 0..1
  annotationImagePath String?  // served path of the project-owned drawing copy
```

- [ ] **Step 3: Push + generate.** Run `npx prisma db push` then `npx prisma generate`.
Expected: "Your database is now in sync"; client regenerates with no error.

- [ ] **Step 4: Verify typecheck.** Run `npx tsc --noEmit`. Expected: clean (no consumers reference the new fields yet).

- [ ] **Step 5: Commit.** `git add prisma/schema.prisma && git commit -m "Feat(d2q) · schema: Project↔Conversation link, shared phone, room annotations"`

### Task 2: Capture shared-contact phone (TDD)

**Files:** Modify `src/lib/telegram/parse.ts`, its test `src/lib/telegram/parse.test.ts` (or co-located test), and `src/app/api/telegram/webhook/route.ts`.

- [ ] **Step 1: Failing test.** Add to the parse test file:
```ts
it("extracts a digits-only phone from a shared contact", () => {
  const parsed = parseBusinessUpdate({
    business_message: {
      message_id: 5, chat: { id: 111 }, from: { id: 111, first_name: "Ali" },
      contact: { phone_number: "+998 (90) 123-45-67", first_name: "Ali" },
    },
  });
  expect(parsed?.contact).toEqual({ phone: "998901234567", name: "Ali" });
});
it("leaves contact undefined when no contact present", () => {
  const parsed = parseBusinessUpdate({
    business_message: { message_id: 6, chat: { id: 1 }, from: { id: 1 }, text: "hi" },
  });
  expect(parsed?.contact).toBeUndefined();
});
```

- [ ] **Step 2: Run → fail.** `npx vitest run src/lib/telegram` → FAIL (`contact` undefined / not on type).

- [ ] **Step 3: Implement.** In `parse.ts`: add `contact?: { phone: string; name?: string }` to `ParsedInbound`. In `parseBusinessUpdate`, before the return, compute:
```ts
const contact = m.contact?.phone_number
  ? {
      phone: String(m.contact.phone_number).replace(/\D/g, ""),
      name: [m.contact.first_name, m.contact.last_name].filter(Boolean).join(" ") || undefined,
    }
  : undefined;
```
and include `contact` in the returned object. Leave `classifyMedia` returning `OTHER` for contacts (display unchanged).

- [ ] **Step 4: Run → pass.** `npx vitest run src/lib/telegram` → PASS (existing parse tests still green).

- [ ] **Step 5: Webhook stores it.** In `webhook/route.ts`, where the conversation is upserted on an **incoming** message, if `parsed.contact?.phone` is present, set `sharedContactPhone: parsed.contact.phone` on the conversation update (only on inbound — never overwrite from an outbound/owner message). Do not change message dedupe/bump logic.

- [ ] **Step 6: Verify.** `npx tsc --noEmit` clean; `npx vitest run` green.

- [ ] **Step 7: Commit.** `git commit -am "Feat(d2q) · capture client's shared-contact phone onto the conversation"`

### Task 3: Conversation context endpoint

**Files:** Create `src/app/api/inbox/[id]/context/route.ts`.

- [ ] **Step 1: Implement** (mirror the auth + shape of the existing `[id]/route.ts`):
```ts
export const runtime = "nodejs";
export const GET = withInboxAccess(async (_req, { params }) => {
  const convo = await prisma.conversation.findUnique({
    where: { id: params.id },
    select: { displayName: true, username: true, sharedContactPhone: true },
  });
  if (!convo) return fail("Not found", 404);
  const images = await prisma.message.findMany({
    where: { conversationId: params.id, mediaKind: "IMAGE", mediaPath: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, mediaPath: true, createdAt: true },
  });
  return ok({
    displayName: convo.displayName,
    username: convo.username,
    sharedContactPhone: convo.sharedContactPhone,
    images: images.map((m) => ({ messageId: m.id, path: m.mediaPath, createdAt: m.createdAt })),
  });
});
```
(Use the project's actual `ok`/`fail`/`withInboxAccess` import paths — confirm signature of `withInboxAccess` handler args against `[id]/reply/route.ts`.)

- [ ] **Step 2: Verify.** `npx tsc --noEmit` clean. Manual: while unlocked, `GET /api/inbox/<id>/context` returns the shape; locked/no-permission → 403 `INBOX_LOCKED`.

- [ ] **Step 3: Commit.** `git commit -am "Feat(d2q) · GET /api/inbox/[id]/context for calculator handoff"`

### Task 4: Calculator store — `sourceConversationId`

**Files:** Modify `src/store/calculator.ts`.

- [ ] **Step 1:** Add `sourceConversationId: string | null` to `CalculatorState`, `INITIAL_STATE` (`null`), `PersistedShape`, and `partialize`. Add `setSourceConversationId: (id: string | null) => void` to the actions and implement `set({ sourceConversationId: id })`. Add it to the `loadFrom` omit-list type. Because `loadFrom`/`clearAll` spread `INITIAL_STATE` first, the field auto-resets to null on both — no extra code, but confirm by reading.

- [ ] **Step 2: Verify.** `npx tsc --noEmit` clean.

- [ ] **Step 3: Commit.** `git commit -am "Feat(d2q) · calculator store carries sourceConversationId"`

### Task 5: `?fromConversation=` handoff

**Files:** Modify `src/app/(app)/calculations/page.tsx`.

- [ ] **Step 1:** In the one-time mount effect (the block at ~`:82` that handles `?prefill=`/`?fromOrder=`/`?fromProject=`), add a branch **before** `?fromProject`:
```ts
const fromConversation = search.get("fromConversation");
if (fromConversation) {
  void (async () => {
    try {
      const ctx = await api<ConversationContext>(`/api/inbox/${fromConversation}/context`);
      loadFrom({ client: { name: ctx.displayName, phone: "", address: "", consentGranted: false } });
      setSourceConversationId(fromConversation);
      setConversationImages(ctx.images.map((i) => i.path));   // local React state for the dock
      setSharedPhone(ctx.sharedContactPhone ?? null);
    } catch {
      // fail open: keep persisted draft; dock shows a load-error
      setSourceConversationId(fromConversation);
      setConversationImages([]);
    } finally {
      router.replace("/calculations", { scroll: false });
    }
  })();
  return;
}
```
Define a `ConversationContext` type (or import a shared one). Add the `conversationImages`/`sharedPhone` React state. On a normal reload while `sourceConversationId` is set (no query), re-fetch the context to repopulate the dock.

- [ ] **Step 2: Verify.** `npx tsc --noEmit` clean. Manual: navigating to `/calculations?fromConversation=<id>` prefills the client name and strips the query.

- [ ] **Step 3: Commit.** `git commit -am "Feat(d2q) · calculator opens from a chat (?fromConversation)"`

### Task 6: DrawingDock split-screen + phone chip

**Files:** Create `src/components/calculation/DrawingDock.tsx`; modify `calculations/page.tsx` layout and `ClientInfoBar` (or the calculator) for the phone chip.

- [ ] **Step 1: DrawingDock.** Props: `images: string[]`, `error?: boolean`. Renders a resizable left panel (default ~40% width, min/max clamps, drag handle) with the images stacked/scrollable, each clickable into the existing `ImageViewer` lightbox (wrap in `ImageViewerProvider images={images}` and call `openViewer(path)`). Empty/error → a non-blocking placeholder "Чизмани юклаб бўлмади · Couldn't load drawings". Theme via existing tokens. Reuse, don't reinvent, the viewer.

- [ ] **Step 2: Layout.** In `calculations/page.tsx`, when `sourceConversationId` is set, render a two-column flex: `<DrawingDock>` left, the calculator (`MultiRoomCalculator` + client bar + totals) right. When not set, render exactly as today (no regression). Respect the app shell's height rules (`h-full`, sticky — see project CLAUDE.md gotchas).

- [ ] **Step 3: Phone chip.** When `sharedPhone` is non-null and the phone field is empty, show a one-tap chip near the phone input: "📞 998… ишлатиш · Use". Click fills the phone field. Plain, accessible button.

- [ ] **Step 4: Verify (Playwright).** Launch dev, open `/calculations?fromConversation=<seeded id>`; confirm split layout, drawing opens in lightbox with zoom/←→, name prefilled, phone chip fills the field. Screenshot.

- [ ] **Step 5: Commit.** `git commit -am "Feat(d2q) · DrawingDock split-screen + shared-phone one-tap chip"`

### Task 7: Inbox "Calculate from this chat" button

**Files:** Modify `src/app/(app)/inbox/InboxClient.tsx` (thread header).

- [ ] **Step 1:** In the open-thread header (near the trash button), add a button "Ҳисоблаш · Calculate" (Calculator icon) that does `router.push(\`/calculations?fromConversation=${conversationId}\`)`. Only in an open conversation.

- [ ] **Step 2: Verify (Playwright).** Click it from a thread → lands on the split calculator with that chat's drawings docked. Screenshot.

- [ ] **Step 3: Commit.** `git commit -am "Feat(d2q) · inbox thread → Calculate from this chat"`

### Task 8: Persist `conversationId` on save (guarded)

**Files:** Modify `src/app/api/projects/route.ts`; calculator save call in `calculations/page.tsx`.

- [ ] **Step 1: Server.** Accept optional `conversationId` in the POST/PUT body. Before persisting it, check the caller has `inbox.access` (reuse the permission helper used elsewhere — read how `withPermission`/the session permissions are exposed in this route). If present **and** caller has `inbox.access`, set `conversationId` on create/update; otherwise omit it (do **not** error). Never let it overwrite an existing link with null on a plain re-save unless intentionally clearing.

- [ ] **Step 2: Client.** Include `sourceConversationId` (when set) in the Save Project request body.

- [ ] **Step 3: Verify.** `npx tsc --noEmit` clean. Manual: save from a chat handoff → `Project.conversationId` is set in DB. Save normally (no chat) → null. (Negative: a non-inbox user cannot set it — exercise later in review.)

- [ ] **Step 4: Commit.** `git commit -am "Feat(d2q) · save links Project to its source conversation (inbox.access-guarded)"`

### Task 9: Back-links both directions

**Files:** Create `src/app/api/inbox/[id]/projects/route.ts`; modify the project/quote view component (find where a saved Project/draft is shown — likely under `src/app/(app)/projects/`) and `InboxClient.tsx`.

- [ ] **Step 1: Endpoint.** `GET /api/inbox/[id]/projects` (`withInboxAccess`) → list `{ id, draftNumber, status, name, createdAt }` for `Project.conversationId = params.id`, newest first.

- [ ] **Step 2: Inbox list.** In the thread header/side, render "Бу чатдан · Quotes from this chat (N)" linking each to its project page. Lazy-load via React Query when a thread opens.

- [ ] **Step 3: Project → chat.** On the project/draft view, if `conversationId` is set **and** the current user has `inbox.access`, show "Чатни очиш · Open chat" → `/inbox/<conversationId>`. Gate the permission check server-side when fetching the project view data (don't leak the conversationId to non-inbox users in the payload).

- [ ] **Step 4: Verify (Playwright).** Both links navigate correctly; confirm the chat link is absent for a user without `inbox.access`.

- [ ] **Step 5: Commit.** `git commit -am "Feat(d2q) · project↔chat back-links (inbox.access-gated)"`

---

## Milestone ④ — Close the Loop

### Task 10: `tgSendBusinessPhoto`

**Files:** Modify `src/lib/telegram/api.ts`.

- [ ] **Step 1:** Add `tgSendBusinessPhoto(businessConnectionId: string, chatId: string, photo: Buffer, opts?: { filename?: string; caption?: string }): Promise<{ message_id: number } | null>`. POST `multipart/form-data` to `https://api.telegram.org/bot<token>/sendMessage`'s photo sibling `sendPhoto`, including `business_connection_id`. Mirror error handling / token sourcing of the existing `tgSendBusinessMessage` (token server-only, never logged).

- [ ] **Step 2: Verify.** `npx tsc --noEmit` clean.

- [ ] **Step 3: Commit.** `git commit -am "Feat(d2q) · tgSendBusinessPhoto"`

### Task 11: `POST /api/inbox/[id]/reply-photo`

**Files:** Create `src/app/api/inbox/[id]/reply-photo/route.ts`.

- [ ] **Step 1: Implement** (`runtime = "nodejs"`, `withInboxAccess`): parse multipart; reject if not an image MIME or size > 10 MB → `fail(..., 400)`. Look up the conversation (`externalId`, `businessConnectionId`); 404 if missing. Save the photo into the conversation media folder using the **same media-path helper the webhook uses** (locate it). Call `tgSendBusinessPhoto`. On success, create an `OUTBOUND` `Message` (`mediaKind: "IMAGE"`, `mediaPath` = saved copy, `telegramMsgId` from the response, `sentById` = operator) and `emitInbox`. On Telegram failure, still record the message with `failed: true` (reuse the failed-bubble pattern from `reply/route.ts`). Bump conversation `lastMessageAt`/`lastSnippet`.

- [ ] **Step 2: Verify.** `npx tsc --noEmit` clean.

- [ ] **Step 3: Commit.** `git commit -am "Feat(d2q) · POST reply-photo (validated image send + outbound record)"`

### Task 12: "Send to chat" in calculator post-save

**Files:** Modify `calculations/page.tsx` (post-save UI) and reuse the Table Image Designer PNG export.

- [ ] **Step 1:** After a successful Save Project, when `sourceConversationId` is set and the user has `inbox.access`, show "Чатга юбориш · Send to chat". On click: render the summary table to a PNG blob via the existing `html-to-image` export path the Send button uses, then `POST` it (multipart) to `/api/inbox/${sourceConversationId}/reply-photo` with a short bilingual caption. Show success/failure inline (toast/banner consistent with the page).

- [ ] **Step 2: Verify (Playwright + real Telegram via tunnel).** From a chat handoff: save → "Send to chat" → the PNG arrives in the actual Telegram chat and an OUTBOUND image bubble appears live in the inbox. Screenshot.

- [ ] **Step 3: Commit.** `git commit -am "Feat(d2q) · send the quote PNG straight back into the chat"`

---

## Milestone ② — Visual Room-Capture

### Task 13: Box-coordinate helpers (TDD)

**Files:** Create `src/lib/annotation-box.ts` + `src/lib/annotation-box.test.ts`.

- [ ] **Step 1: Failing tests.**
```ts
import { clampBox, isDegenerate, type NormBox } from "./annotation-box";
it("clamps all coords into [0,1]", () => {
  expect(clampBox({ x: -0.1, y: 0.2, w: 1.5, h: 0.3 })).toEqual({ x: 0, y: 0.2, w: 1, h: 0.3 });
});
it("flags a zero-area box as degenerate", () => {
  expect(isDegenerate({ x: 0.1, y: 0.1, w: 0, h: 0.4 })).toBe(true);
  expect(isDegenerate({ x: 0.1, y: 0.1, w: 0.2, h: 0.4 })).toBe(false);
});
```
- [ ] **Step 2: Run → fail.** `npx vitest run src/lib/annotation-box` → FAIL.
- [ ] **Step 3: Implement.** `NormBox = { x; y; w; h }`; `clampBox` clamps x/y to `[0,1]` and w/h so `x+w ≤ 1`, `y+h ≤ 1`; `isDegenerate` true when `w < ε || h < ε` (ε ≈ 0.005). Add `fromDrag(start, end, naturalW, naturalH)` → NormBox and `toPixels(box, w, h)` for the overlay.
- [ ] **Step 4: Run → pass.** `npx vitest run src/lib/annotation-box` → PASS.
- [ ] **Step 5: Commit.** `git commit -am "Feat(d2q) · annotation-box coordinate helpers (TDD)"`

### Task 14: Annotation overlay + `SlabRow.box`

**Files:** Modify `MultiRoomCalculator.tsx` (`SlabRow` type, add-from-box path); create `src/components/calculation/RoomCaptureOverlay.tsx`; wire into `DrawingDock`.

- [ ] **Step 1:** Add `box?: { imagePath: string } & NormBox | null` to `SlabRow`. Ensure `recomputeRow` and the persisted rehydrate pass it through untouched (engine ignores it).
- [ ] **Step 2:** `RoomCaptureOverlay` sits over the active drawing image in the dock: pointer-drag draws a rubber-band rectangle; on release, if not `isDegenerate`, create a new `SlabRow` (reuse `addRow`) with `box = { imagePath, ...clampBox(fromDrag(...)) }` and focus its width input. Render existing boxes as numbered, colored rectangles matching their row index/color.
- [ ] **Step 3:** Two-way highlight: hovering a table row highlights its box; clicking a box scrolls/highlights its row. Deleting a row removes its box; deleting a box (small ✕ on the rect) removes its row.
- [ ] **Step 4: Verify (Playwright).** Draw 2 boxes on a docked drawing → 2 rows appear; type dims → totals update; hover row ↔ box highlight; delete syncs. Screenshot.
- [ ] **Step 5: Commit.** `git commit -am "Feat(d2q) · drag-to-capture rooms on the drawing (boxes ↔ rows)"`

### Task 15: Coverage tally + per-box readout

**Files:** Modify `DrawingDock`/overlay and the calculator totals area.

- [ ] **Step 1:** A tally chip: "N хона · ΣX m² · ΣY beams" computed from current rows/results. Each box with a `result` shows its m² (small label on the rect). A manual "Чизма тўлиқ · Plan reviewed" toggle (UI-only state) with a one-line honest hint that completeness is operator-judged.
- [ ] **Step 2: Verify (Playwright).** Tally updates as rooms gain dimensions; per-box m² shows. Screenshot.
- [ ] **Step 3: Commit.** `git commit -am "Feat(d2q) · coverage tally + per-box m² readout"`

### Task 16: Persist annotations + copy drawings

**Files:** Modify `src/app/api/projects/route.ts` (save), the project-open path (`loadProject` in `calculations/page.tsx`), and add a media-copy helper.

- [ ] **Step 1: Save.** When a room has a `box`, copy its source drawing (the conversation-media file at `box.imagePath`) into a project-owned dir `<MEDIA_ROOT>/projects/<projectId>/` (de-dup identical paths → copy once, reuse for all rooms on that image). Persist each `Calculation.annotationBox = { x,y,w,h }` and `annotationImagePath` = the copied path. Resolve `<MEDIA_ROOT>` from the same helper the webhook/reply uses. Guard against path traversal (only copy from within the media root).
- [ ] **Step 2: Reopen.** In `loadProject`, rehydrate each row's `box` from `annotationBox` + `annotationImagePath`, and feed the distinct `annotationImagePath`s to the DrawingDock so a linked draft reopens with its annotated drawings.
- [ ] **Step 3: Verify (Playwright + DB).** Save a 2-box quote → DB rows have `annotationBox`/`annotationImagePath`, files exist under `projects/<id>/`. Reopen the draft → boxes + drawings restored. Delete the source conversation → reopen still shows the drawing (project copy survives). Screenshot.
- [ ] **Step 4: Commit.** `git commit -am "Feat(d2q) · persist room boxes + project-owned drawing copies; rehydrate on reopen"`

---

## Per-milestone review gate

After ①, after ④, after ②, and once at the end: dispatch a fresh-context reviewer over the milestone's diff (`git diff <base>..HEAD`) for: spec compliance, correctness/edge cases, and **security/leak** review (permission gating on every new endpoint, no token/PII exposure, path-traversal on media copy, multipart validation). Fix findings before proceeding.

## Final Verification

1. `npx tsc --noEmit` clean. `npx vitest run` all green.
2. Full E2E via the cloudflared tunnel: receive drawing → "Calculate from this chat" → box 2–3 rooms + dims → save (verify link + copies + boxes) → "Send to chat" → PNG lands in the real chat + live OUTBOUND bubble.
3. Permission negatives: a user without `inbox.access` sees no chat links, cannot hit `/context`/`/projects`/`/reply-photo` (403), and cannot attach a `conversationId` on save.

## Out of scope

AI vision (③), multi-order-per-project, Instagram, AI auto-responder, CAD/DWG parsing, perspective-correction.
