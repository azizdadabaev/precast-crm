# Calculator layout board: top-view slab sheet — design

Date: 2026-11-09 · Owner: EtalonSlabs · Status: draft for owner approval (builder check done; wall question answered by owner)
Branch: `feat/calc-layout-board` (cut from `origin/main` 172fc3d0) · Web only

## 1. Intent and why

Clients send room sizes — sometimes a hand sketch or a photo, often only words on the phone, sometimes they come to the
office and point. The operator calculates every room in the web calculator and sends a quote. The owner wants to also
send a **top-view sheet of the whole house**: every room in its real place, drawn with its beams and block rows, so the
client sees exactly what our product covers.

A one-off sheet was made by hand for quote 0708D (`Downloads/etalon-plans/0708D/plan-0708D.png`, built by
`plan.py` there). The owner liked the direction and asked for it as a CRM feature with two rules (owner's words):

- "not all room come with drawing … we need a kan-ban type of drag and drop and snap type of functionality to customly
  organize room placements" — **no matter what, rooms are placed by drag, drop and snap.**
- "arrange the sheet right inside the calculator tab because saved draft tab does not have the tools we might need" —
  **arranging happens while calculating, in the calculator tab.**

Fix the owner asked for on the sample, which carries into this feature: each room must show **the slab our product
covers, from the quote table**, not only the inner room size. Example: room 10 is 4,60 × 4,00 inside, the slab is
**4,90 × 4,06** (beam length × МОНОЛИТ).

## 2. Goals

1. A **layout board** inside the web calculator tab. Every calculator row appears on it as a room block, drawn top-view
   with its real beams and block rows (pattern Г-Б / Б-Г-Б / Г-Б-Г, beam count, block rows), at slab size.
2. **Drag, drop, snap.** Rooms are dragged into place and snap edge-to-edge against other rooms and align with them.
   Rooms can be turned 90°.
3. **Live link to the calculation.** Editing a row (size, pattern, beams) updates its block on the board at once.
   Adding a row adds a block; deleting a row removes it.
4. **Saved with the calculation.** A saved draft (and its versions) reopens with the arrangement intact.
5. **Export the sheet** as PNG and PDF in the style of the 0708D sample: logo header, title, project/client, date,
   company phone, each room labelled, quantity summary, legend, one faint centred watermark.

## 3. Non-goals (v1)

- Android app (owner decided drawing tools stay off mobile).
- Moving a room never changes any number. Quantities and money come only from the calculator.
- Walls exist only as the gap between snapped rooms (one thickness per draft). No wall editing, doors, windows,
  corridors or free-form shapes. No editing room size on the board (sizes are edited in the table).
- No reading of client sketches/photos to place rooms automatically.
- No change to the existing «Хона чизиш» drawing tool (RoomCanvas) or the quote card.

## 4. Anti-goals (would be a failure even if it works)

- The sheet shows a number that differs from the quote table (beam length, monolith, area, counts, totals).
- Dragging feels sticky or jumpy, or snapping fights the operator (the owner judges drawing tools by feel).
- English or Latin-script text in the UI or on the sheet. All text is Uzbek Cyrillic (`<Bi>`/`useT` per existing pattern).
- The board slows down typing in the calculator table.

## 5. What the owner decided

- Placement is always manual drag-drop-snap, sketch or no sketch.
- The board lives in the calculator tab, arranged while calculating.
- Web only; layout saved with the calculation; moving rooms never changes numbers (owner: "the plan is correct and your
  guesses").
- Sheet looks like the 0708D sample **without the dashed slab outline** ("no need for hatched dashes around the rooms").
- Watermark style: one logo, centred, ~30 % of sheet width, very faint (~8 % on the white sheet).
- **Rooms snap with a wall gap, and the sheet draws walls dark like the 0708D sample** (owner chose the recommendation:
  default 30 cm, changeable per draft). Rooms therefore sit in their real place and the house keeps its real size.

## 6. How it works

### 6.1 Room block on the board

- A room block is positioned by its **inner room rectangle** (inner width × inner length) — that is what snaps.
- The **slab** is drawn on top, centred on the room: `result.beam_length` (across the beams, i.e. inner width + bearing
  each end, so beam ends run into the walls) × `result.monolith_length` (along the row of beams). Drawn with `beamLayout(...)` from `src/lib/cad/geometry.ts` using the row's `result`
  (`pattern`, `beam_count`, `block_rows`, `blocks_per_row`, `beam_length`, bearing). Beams run along the beam-length
  side.
- Walls: every placed room is surrounded by a wall band of the draft's wall thickness; on the board it is a mid-tone,
  on the sheet it is dark (the sample's method: union of rooms grown by the wall thickness, rooms cut out).
- Label in the block: room number (row order, 1-based) and name if not the default; `хона 4,60 × 4,00`;
  **`плита 4,90 × 4,06`**; pattern; `N балка · L м`; area `m²` (the row's `monolith_area`, as the table shows it).
  Numbers formatted Uzbek style (decimal comma, space thousands), tabular mono figures.
- Rows with no valid `result` yet (incomplete input) appear in the tray greyed and cannot be placed.

### 6.2 Board, tray, interactions

- A collapsible **«Жойлашув»** panel in the calculator tab, below the rooms table, full width. Collapsed by default
  until the draft has ≥ 1 placed room.
- **Tray** (left strip, kanban-like): one card per unplaced row. Drag a card onto the board to place it.
- **Board**: SVG, pan (drag empty space / middle mouse), zoom (wheel, buttons, fit-all). Scale in cm like the CAD code.
- **Drag** a placed room to move it. **Snap** while dragging (pure function, see 6.4): wall-gap contact with another
  room (inner edges exactly one wall thickness apart), edge alignment, then a 5 cm grid. Snap guides drawn while active. Hold Alt to drag without snapping.
- **Turn 90°**: button on the selected room and key `R`.
- **Remove from board**: sends the room back to the tray (does not delete the row).
- **Auto-arrange**: places all unplaced rooms left-to-right in one row so the operator starts from something.
- **Wall thickness** field on the panel (cm, default 30). Changing it does not move rooms; it changes the gap the
  next snaps use and the wall band drawn.
- Undo/redo for board moves (Ctrl+Z / Ctrl+Y), separate from the table.
- Overlaps are allowed while dragging but a room overlapping another is outlined in the negative colour.

### 6.3 Data

- Position lives **on the row**: `SlabRow.layout?: { x: number; y: number; rot: 0 | 90 }` (cm, top-left of the inner
  room rectangle in board space). It moves with the row through reorder/delete because rows are saved in order.
- Store: extend `SlabRow`, `PersistedShape` and `partialize` in `src/store/calculator.ts` so the localStorage draft keeps
  it.
- DB: two new nullable columns, **`Calculation.layoutJson Json?`** and **`Project.layoutWallCm Int?`** (one additive
  migration; rollback = drop both columns; no existing data touched). Validated with one shared zod schema
  (`x,y` finite numbers within ±100 000 cm, `rot` 0|90; wall 0–100 cm) and mapped by one shared helper.
- **Every path that recreates `Calculation` rows carries `layoutJson` through** (they all delete and re-create rows):
  draft save POST `/api/projects`; place order (`src/lib/create-order.ts`); edit order
  (`api/orders/[id]/edit`); add to order (`api/projects/[id]/add-to-order`); version restore
  (`drawing-versions/[vid]/restore`, including its "before restore" snapshot) and `DrawingVersion.roomsJson` snapshots.
  Read back on every reopen path in `calculations/page.tsx` (draft and order).
- AI agent / MCP re-saves of an existing draft (`src/lib/agent/persist-quote.ts`, `src/lib/mcp/quote/store.ts`): keep
  each row's layout by row order when the room count is unchanged; if the count changes, all rooms go back to the tray.
- Anything that rebuilds rows (draw-rooms.ts, AI assist) leaves `layout` undefined → room goes to the tray.

### 6.4 Snap (pure, tested)

`src/lib/cad/layout-snap.ts` — `snapRect(moving, others, opts) → { x, y, guides }`. Rectangles in cm. Inputs are inner room
rectangles plus `wallCm`. Candidates per axis: wall-gap contact (moving left = other right + wallCm, etc.), edge alignment (left↔left, right↔right, top↔top,
bottom↔bottom), centre alignment; threshold in screen pixels (~10 px) converted to cm by current zoom; nearest candidate
per axis wins; fall back to 5 cm grid. Contact snaps only count when the rectangles overlap on the other axis (or would
after snapping). Rotation 90° turns the room about its centre, then snaps again. Unit-tested in `tests/layout-snap.test.ts`.

### 6.5 Sheet export

- Built client-side from the same SVG (`buildLayoutSheetSvg(rows, meta)`), exported PNG (canvas) and vector PDF
  (`jspdf` + `svg2pdf.js`), following RoomCanvas's existing export code. No server rendering.
- Content: walls dark around placed rooms as in 6.1; logo (add the cleaned logo PNG to `public/brand/`), title «Плита жойлашуви — юқоридан кўриниш», project
  name / client name / date, company phone, placed rooms with labels as in 6.1 (no dashed slab outline), legend (балка,
  ғишт, девор), summary chips: beams grouped by length (`4,90 м — 60 та` …), total blocks, total area — all summed from the
  rows' results, identical to the table totals. Watermark: one centred logo, ~30 % width, ~8 % opacity.
- Only placed rooms are drawn; if some rows are unplaced the export button warns («N хона жойлаштирилмаган») but still
  allows export. Totals on the sheet always cover **all** rows (the quote), and the sheet says so when some are unplaced.
- File name: `<project name or "loyiha">-joylashuv.png/.pdf`.

### 6.6 Rows that are not ordinary rooms

- **Extras-only rows** (`inner_length = 0`, extra beams only; `result.is_extras_only`): never placed on the board; shown
  in the tray as «қўшимча балка» cards that cannot be dragged; their beams are counted in the sheet's beam chips and
  totals.
- **Area on the sheet** is the quote table's МАЙДОН value (`monolith_area`) per room and in total — the same number the
  quote shows (193,02 m² for 0708D). Billed area is not printed.

## 7. Constraints

- Follow existing patterns: zustand store, Tailwind + `src/components/ui/*`, `<Bi>`/`useT`, theme tokens (no raw hex in
  the UI; the exported sheet may use fixed print colours).
- No new dependencies (drag is hand-written pointer events on SVG, as RoomCanvas does).
- Permission: whatever already gates the calculator (`calculator.use`); no new permission.
- Tests: vitest, pure logic only (snap, layout normalisation/validation, sheet totals equal table totals,
  footprint = beam_length × monolith_length).
- Build, lint, typecheck and the full test suite green before any commit; **no push or deploy without the owner's
  explicit "deploy"**; owner sees screenshots of the built board before deploy.
- Web work happens only in the `feat/calc-layout-board` worktree (local `main` is stale and holds other work).

## 8. Calls made by the designer (owner may overrule)

- Layout stored per row (moves with the row) rather than per project; wall thickness stored per project.
- Agent/MCP re-quote keeps positions only when the room count is unchanged.
- Extras-only rows stay off the board but count in totals.
- Sheet shows МАЙДОН (monolith area), matching the quote table.
- Export is client-side (no server Chromium).
- Board panel sits below the rooms table, collapsed until a room is placed.

## 9. Left to the builder

Exact panel layout and styling within the existing calculator look; zoom limits; colours of beams/blocks on screen
(theme tokens); keyboard shortcuts beyond R / Alt / undo; how the tray scrolls; auto-arrange spacing; PNG resolution
(≥ 2× for print).
