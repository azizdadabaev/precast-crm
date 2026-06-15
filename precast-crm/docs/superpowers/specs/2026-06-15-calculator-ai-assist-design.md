# Calculator AI Assist — Design

**Date:** 2026-06-15
**Status:** Approved (design) — pending spec review
**Author:** brainstormed with operator

## 1. Summary

Add an **AI assist** helper to the Calculator tab so internal users (owner2, selected
sales staff) can fill the room table from **freeform text** or a **room/floor-plan image**,
the same way the live Telegram/Instagram agent reads customer messages today.

The AI's job is narrow: turn messy input into a list of rooms
`{ width, length, name }`. It does **not** price anything, save anything, or send anything
to a customer. Once the rooms land in the table, the **existing calculator engine prices
them** exactly as it does for manually-typed rooms. The operator reviews, edits, and then
Saves/Places the order through the unchanged existing flows.

### Example input (text)

```
Уз 8.10 × эни 4.90 зал
Уз 5.20 × эни 3.10 спальник
Уз 4.30 × эни 1.70
Каридор
```

→ AI returns 4 rooms (note: the 3rd room's label "Каридор" is on the next line; the model
handles that). → 4 editable rows appear in the calculator, priced automatically.

## 2. Goals / Non-goals

**Goals**
- Paste text → rooms in the table.
- Drop a room image / floor plan → rooms in the table (reuse the existing vision reader).
- Gate behind a new, owner-granted permission so AI cost is controllable.
- Reuse the calculator's existing pricing, review, save, and order flows untouched.

**Non-goals (explicitly out of scope)**
- No conversational agent inside the calculator (no chat, no Q&A, no signed price tokens).
- No auto-save and no customer-facing output.
- No change to calculation logic, discount logic, Save Draft, or Place Order.
- No new model/provider — reuse the owner-selected model + keys already configured.

## 3. Decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| Core behavior | **Extract dimensions → fill editable rows** (not the full chat agent) |
| Text parsing | **Reuse the agent's AI model** (Gemini), structured JSON output, no regex |
| Image parsing | **Reuse the existing `extractDimensions()` vision function** |
| Access control | **New `calculator.aiAssist` permission**, owner-granted per user |

## 4. Architecture

```
Calculator page (browser)
  ┌──────────────────────────────────────────┐
  │  AI Assist box                           │
  │   [ paste text…            ]  [Parse]    │
  │   ( drop / pick an image → Extract )     │
  └──────────────────────────────────────────┘
        │ text  OR  image (base64 + mimeType)
        ▼
  POST /api/calculations/ai-extract            ← NEW, thin endpoint
        • withPermission("calculator.aiAssist")
        • rate-limited (reuse existing limiter)
        • mode=text  → provider.generate(structured) → rooms JSON
        • mode=image → extractDimensions(image)      → rooms JSON
        ▼
  { rooms: [{ widthM, lengthM, label? }], confidence, note?, isPlanLike? }
        ▼
  Calculator maps rooms → SlabRow[] (makeRow + width/length/name),
  appends to current rows, runs recomputeRow() → priced rows
```

### 4.1 New endpoint — `POST /api/calculations/ai-extract`

A single thin endpoint that does **not** run the conversational agent loop, does **not**
mint price tokens, and does **not** persist to the DB.

**Request (one of two modes):**
```ts
// text mode
{ mode: "text"; text: string }              // text length-capped (see §7)
// image mode
{ mode: "image"; imageBase64: string; mimeType: string }
```

**Response (unified shape — same as the vision reader returns today):**
```ts
{
  rooms: Array<{ widthM: number; lengthM: number; label?: string }>;
  confidence: "high" | "low";
  note?: string;        // staff-facing reason when unsure
  isPlanLike?: boolean; // image mode only: false = not a construction image
}
```

This is exactly the `ExtractedDimensions` shape produced by
`parseDimensions()` / `extractDimensions()` in
[gemini.ts](../../../src/lib/agent/llm/gemini.ts#L74). Both modes return the same shape so
the browser has one code path to consume.

**Text mode internals:** build a small system prompt ("read these room dimensions, return
JSON `{ found, rooms:[{widthM,lengthM,label}], confidence, note }`; widthM = эни, lengthM =
Уз; one entry per room; ignore prices/notes"), call the configured provider via
`createProviderForModelKey()`
([factory.ts](../../../src/lib/agent/llm/factory.ts#L38)) with JSON output, and run the
result through the **same** `parseDimensions()` validator the vision path already uses. This
keeps text and image on one validation/coercion path.

**Image mode internals:** call the existing `createVisionProvider().extractDimensions({ data,
mimeType })` directly and synchronously. No webhook, no async fire-and-forget — the browser
waits for the result.

### 4.2 Browser → table mapping

For each returned room:
- `makeRow(seq)` ([MultiRoomCalculator.tsx](../../../src/components/calculation/MultiRoomCalculator.tsx#L206))
  to get a fresh `SlabRow` with engine defaults (`bearing: 0.15`, `patternOverride: "AUTO"`,
  `originalWidth: 0` → no undersize warning for AI rooms).
- Set `innerWidth = widthM`, `innerLength = lengthM`, `name = label ?? makeRow's default`.
- Run `recomputeRow(row)` so each row arrives already priced.
- **Append** to the current rows (do not wipe what the operator already typed), then
  `setRows([...existing, ...newRows])`.

Mapping convention: **`widthM → innerWidth` (эни), `lengthM → innerLength` (Уз).** The model
is instructed to follow this so "Уз 8.10 × эни 4.90" becomes `innerLength 8.10, innerWidth
4.90`.

### 4.3 What is reused vs new

| Reused (no change) | New |
|--------------------|-----|
| `extractDimensions()` vision reader | `POST /api/calculations/ai-extract` route |
| `parseDimensions()` validator | Text-mode system prompt + structured call |
| `createProviderForModelKey()` / provider keys / runtime model | `calculator.aiAssist` permission |
| `makeRow()`, `recomputeRow()`, `setRows()` | "AI assist" UI box on the calculations page |
| Calculator pricing, discount, Save Draft, Place Order | Browser mapping rooms → SlabRow[] |
| Rate limiter | — |

## 5. On-screen flow (UX)

**Placement:** a compact "AI assist" box on the calculations page, directly **above the
ClientInfoBar / calculator table** (top of the working area). Only rendered when the current
user has `calculator.aiAssist` (checked via `/api/auth/me` permissions, same pattern the
project page uses for `blender.bridge`).

**The box contains:**
- A multiline text field + **Parse** button.
- An image **drop zone / picker** (or an "Extract dimensions" affordance). When an image is
  used, also dock it via the existing `addDroppedImages()` so the operator keeps the visual
  reference and can still use the room-capture box feature.

**Happy path:**
1. Operator pastes text (or drops an image) → clicks Parse/Extract.
2. Button shows a spinner (synchronous request).
3. Rooms append to the table, already priced; a brief notice shows
   `AI N та хона қўшди — текширинг · AI added N rooms — please check`.
4. Operator edits/deletes rows as needed, then Saves/Places as usual.

**Low-confidence / partial read:** if `confidence === "low"` or `note` is present, still add
whatever valid rooms came back, and show the `note` as a soft warning so the operator
double-checks (e.g. blurry photo, ambiguous numbers).

**Nothing found:** if `rooms` is empty (or `isPlanLike === false` for an image), add nothing
and show a friendly message: `Ўлчамларни ўқий олмадим — қўлда киритинг · Couldn't read
dimensions — please enter them manually`.

## 6. Data flow summary

```
text/image
  → POST /api/calculations/ai-extract  (permission + rate-limit gates)
  → provider call (text)  OR  extractDimensions() (image)
  → parseDimensions() validation
  → { rooms, confidence, note, isPlanLike }
  → browser: rooms.map(makeRow + set dims) → recomputeRow → setRows(append)
  → operator reviews → existing Save Draft / Place Order
```

## 7. Cost, security & guardrails

- **Permission:** `calculator.aiAssist` gates both the API route (`withPermission`) and the
  UI box. Owner grants it per user. Added to `ACTIONS`, the calculator `PERMISSION_GROUPS`
  entry, `ACTION_LABELS` (bilingual), and left **out of default role templates** (opt-in).
- **Rate limiting:** reuse the existing agent rate limiter
  ([rate-limiter.ts](../../../src/lib/agent/rate-limiter.ts)) keyed per user so a stuck
  paste-loop can't run up cost. On limit: friendly "try again in a moment".
- **Input cap:** cap text length (e.g. a few KB) and image size before calling the model.
- **No injection blast radius:** output is constrained to numbers/labels and validated by
  `parseDimensions()`; the model's text is never shown to a customer and never executed.
  Internal users pasting their own notes is low-risk, but the validator still drops anything
  that isn't a positive `widthM`/`lengthM`.
- **No auto-anything:** never auto-saves, never sends to a customer, never places an order.
- **Logging (optional, light):** record an audit/log line per extract (user, mode, room
  count, token usage) for cost visibility. Reuse the existing usage fields if cheap.

## 8. Error handling

| Case | Behavior |
|------|----------|
| Model/API error or timeout | Banner: "AI service unavailable — enter manually"; add nothing |
| No rooms found | Friendly "couldn't read dimensions" message; add nothing |
| Image not a construction image (`isPlanLike === false`) | Same "couldn't read" message; add nothing |
| Low confidence / partial | Add valid rooms + show `note` as a soft check-this warning |
| Permission missing | Box not rendered; route returns 403 |
| Rate limited | "Try again in a moment" |
| Oversized room (beam > factory max) | No special handling — the calculator's existing engine warning fires on the filled row |

## 9. Testing

- **Rooms → SlabRow mapping (unit):** given `{ widthM, lengthM, label }[]`, assert
  `innerWidth/innerLength/name` mapping, default `bearing 0.15`, and that `recomputeRow`
  yields a non-null priced `result`.
- **Append semantics (unit):** existing rows are preserved; new rows are appended.
- **Endpoint contract (unit/integration):** text mode with a mocked provider returning the
  example input → 4 rooms; image mode delegates to `extractDimensions`; permission gate
  returns 403 without `calculator.aiAssist`; empty/low-confidence handled.
- **Validator reuse:** confirm text mode runs through `parseDimensions()` and drops
  incomplete rooms (missing/<=0 dims), matching existing vision tests.
- **Permission wiring:** `calculator.aiAssist` present in ACTIONS/groups/labels; route
  guarded.

## 10. Open questions / assumptions

- **Assumption:** widthM = эни, lengthM = Уз. If the operator's convention differs, it's a
  one-line prompt tweak; rows are editable regardless.
- **Assumption:** reuse the owner-selected agent model for text. If the owner later wants a
  cheaper model just for extraction, that's a future config knob, not part of v1.
- **Assumption:** image mode sends base64 directly to the endpoint (like
  `simulate-inbound`); we do not require persisting the image first. Docking it for visual
  reference is a nice-to-have that reuses `addDroppedImages()`.

## 11. Rollout

1. Add `calculator.aiAssist` permission (migration-free; it's a string in `User.permissions`).
2. Ship the endpoint + UI behind the permission (no one has it by default).
3. Owner grants it to themselves (owner2) first, validates quality + cost, then widens to
   chosen sales staff.
