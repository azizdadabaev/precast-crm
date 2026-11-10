# Calculator Layout Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a drag-drop-snap «Жойлашув» board to the web calculator tab that places every calculated room top-view with its beams and block rows, saves the arrangement with the calculation, and exports a PNG/PDF sheet like the 0708D sample.

**Architecture:** Pure geometry/snap/totals/sheet logic in `src/lib/layout-board/*` (unit-tested), position stored on each `SlabRow` (`layout`) and persisted in a new `Calculation.layoutJson` column through the shared persistence helper, wall thickness stored on `Project.layoutWallCm`. The board is a hand-written SVG React component (pointer events, no new deps) mounted in `calculations/page.tsx`; the sheet is an SVG string exported client-side with the jsPDF + svg2pdf pattern RoomCanvas already uses.

**Tech Stack:** Next 14, React 18, TypeScript strict, zustand 5, zod, Prisma (schema changes via `prisma db push` — the repo has no migrations folder), Tailwind + `src/components/ui/*`, vitest (node env, `tests/**/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-11-09-calculator-layout-board-design.md` (approved 2026-11-09).

All paths below are relative to `precast-crm/` inside the worktree `.claude/worktrees/layout-board` (branch `feat/calc-layout-board`, cut from `origin/main` 172fc3d0).

## Global Constraints

- Web only; no Android changes.
- Moving a room never changes any number; quantities/money come only from the calculator rows' `result`.
- All UI and sheet text in Uzbek Cyrillic via `<Bi>` / `useT` (`src/lib/i18n.tsx`); no English/Latin UI text.
- Numbers: decimal comma, space thousands, via existing `formatNumber` (`src/lib/utils`); tabular-nums on numeric text.
- No new dependencies. Drag = pointer events on SVG. PDF = lazy `jspdf` + `svg2pdf.js` as in `RoomCanvas.tsx:1418-1430`.
- Theme tokens for on-screen colours (light + dark); the exported sheet uses fixed print colours.
- Wall thickness default **30 cm**, range 0–100 cm. Grid snap **5 cm**. Snap threshold **~10 screen px**.
- Layout zod: `x`,`y` finite, |value| ≤ 100 000 cm; `rot` ∈ {0, 90}.
- DB: two nullable columns `Calculation.layoutJson Json?`, `Project.layoutWallCm Int?`; rollback = drop both. Apply locally with `npx prisma db push`; production DB push only at deploy time, with the owner.
- Sheet: no dashed slab outline; walls dark; legend балка / ғишт / девор; one centred watermark logo ~30 % width, ~8 % opacity; header title «Плита жойлашуви — юқоридан кўриниш»; company phone `+998 93 481 33 30`.
- Sheet area = `monolith_area` (quote МАЙДОН); billed area never printed.
- Build, lint, `tsc --noEmit`, full `vitest run` green before every commit. **No push, no deploy** until the owner says "deploy"; owner sees screenshots of the built board first.
- Never touch the local `main` checkout (stale, holds other work).

## Review Focus

1. **Row edited after placing** (width/length/pattern change): the block resizes in place around its top-left and may now overlap — expect it to stay put and be flagged as overlapping, never jump or vanish. → test in Task 1 (`roomRects` uses current result) and Task 5 (`updateRow` keeps `layout`).
2. **Row deleted / rows reordered**: positions follow their rows; room numbers on board = current row order. → Task 5 store test.
3. **Draft reopened, placed order, edited order, version restored**: layout survives every round-trip. → Task 4 persistence tests per path helper.
4. **Incomplete row (`result` null) or extras-only row**: never placeable, never crashes the board or sheet, extras-only beams still in totals. → Task 3 totals test, Task 1 `isPlaceable` test.
5. **Huge or tiny drafts** (1 room; 40 rooms; 0 placed rooms at export): fit-all works, export of 0 placed rooms is disabled with a message, totals still equal the table. → Task 7 sheet test + Task 6 manual check.

---

### Task 1: Layout model and geometry

**Files:**
- Create: `src/lib/layout-board/model.ts`
- Test: `tests/layout-board-model.test.ts`

**Interfaces:**
- Produces:
  - `type RoomLayout = { x: number; y: number; rot: 0 | 90 }` (cm; top-left of the **inner room rect** after rotation)
  - `const RoomLayoutSchema: z.ZodType<RoomLayout>` (constraints from Global Constraints)
  - `const WALL_CM_DEFAULT = 30`, `const GRID_CM = 5`
  - `type CmRect = { x: number; y: number; w: number; h: number }`
  - `function isPlaceable(row: SlabRow): boolean` — `row.result != null && !row.result.is_extras_only`
  - `function roomRect(row: SlabRow, layout: RoomLayout): CmRect` — inner rect; unrotated `w = innerLength*100`, `h = innerWidth*100` (beams span the width, vertical on screen); `rot 90` swaps w/h
  - `function slabRect(row: SlabRow, layout: RoomLayout): CmRect` — centred on `roomRect`; span `beam_length*100` across the beams, `monolith_length*100` along the row of beams
  - `function overlaps(a: CmRect, b: CmRect): boolean` — strict interior overlap (touching = false)

- [ ] **Step 1: Write failing tests** — fixture: room 10 of 0708D (`innerWidth 4.6, innerLength 4.0`, result `beam_length 4.9, monolith_length 4.06, pattern "GB", beam_count 7`).
  - `roomRect(r10,{x:0,y:0,rot:0})` → `{x:0,y:0,w:400,h:460}`; with `rot:90` → `{w:460,h:400}`.
  - `slabRect(r10,{x:0,y:0,rot:0})` → `{x:-3,y:-15,w:406,h:490}` (±0.001).
  - `isPlaceable` false for `result:null` and for `result.is_extras_only:true`.
  - `RoomLayoutSchema` rejects `rot:45`, `x:NaN`, `y:200000`; accepts `{x:-50,y:12.5,rot:90}`.
  - `overlaps` false for rects sharing an edge, true for 1 cm intrusion.
- [ ] **Step 2: Run** `npx vitest run tests/layout-board-model.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `model.ts` with the signatures above.
- [ ] **Step 4: Run** the test — expect PASS.
- [ ] **Step 5: Commit** `Feat(layout-board) · room/slab rect model and layout schema`.

### Task 2: Snap

**Files:**
- Create: `src/lib/layout-board/snap.ts`
- Test: `tests/layout-board-snap.test.ts`

**Interfaces:**
- Consumes: `CmRect`, `GRID_CM` (Task 1)
- Produces:
  - `type SnapGuide = { axis: "x" | "y"; at: number; from: number; to: number }`
  - `function snapRect(moving: CmRect, others: CmRect[], opts: { wallCm: number; thresholdCm: number; grid?: boolean }): { x: number; y: number; guides: SnapGuide[] }`

Per axis, candidate targets (nearest within `thresholdCm` wins; ties → contact before alignment before centre):
contact with wall gap (`moving.left = other.right + wallCm`, `moving.right = other.left - wallCm`, same for top/bottom) — only when the rects overlap on the other axis after snapping; edge alignment (left↔left, right↔right, top↔top, bottom↔bottom); centre alignment. No candidate → round to `GRID_CM` when `grid !== false`, else unchanged. Axes are independent.

- [ ] **Step 1: Write failing tests** (wallCm 30, thresholdCm 15):
  - A `{0,0,400,460}` fixed; moving `{438,5,300,460}` → `x 430` (contact), `y 0` (top align); guides contain an `x` guide at 430.
  - moving far away `{2003,1007,300,460}` → grid `{2005,1005}`.
  - contact ignored without cross-axis overlap: moving `{432,600,300,100}` (below A's bottom, no y overlap) → x not snapped to 430 by contact (grid → 430 is acceptable only via grid rounding; assert guides has no contact guide).
  - `wallCm 0` → contact puts edges touching (`x 400`).
  - `grid:false` and nothing near → position unchanged.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `snapRect`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `Feat(layout-board) · wall-gap edge snapping`.

### Task 3: Auto-arrange and sheet totals

**Files:**
- Create: `src/lib/layout-board/arrange.ts`, `src/lib/layout-board/totals.ts`
- Create: `tests/fixtures/layout-0708d.ts` (the 12 rows of quote 0708D as `SlabRow[]` with `result` filled from `calculateSlab`, sizes from the spec sample: widths 4.6/5.8, lengths 3.45 3.77 2.10 1.97 3.73 3.52 4.13 1.61 3.65 4.00 1.65 3.50, pattern overrides GB, GBG, GBG, GBG, GBG, BGB, BGB, BGB, BGB, GB, BGB, BGB; if the engine yields different beam counts than the quote, set `extraBeams`/`forceStartBeam` so it matches beams 6 6 3 3 6 7 8 4 7 7 4 7)
- Test: `tests/layout-board-totals.test.ts`

**Interfaces:**
- Consumes: Task 1 model
- Produces:
  - `function autoArrange(rows: SlabRow[], placed: Map<string, RoomLayout>, wallCm: number): Map<string, RoomLayout>` — places every placeable, unplaced row left-to-right in one row, `wallCm` apart, starting right of the existing placed bounding box (or at 0,0), top-aligned; returns only the new entries.
  - `type SheetTotals = { beamsByLength: { lengthM: number; count: number }[]; totalBlocks: number; totalAreaM2: number; placedCount: number; roomCount: number }`
  - `function sheetTotals(rows: SlabRow[]): SheetTotals` — sums over **all** rows with a result (extras-only beams included); `beamsByLength` sorted ascending; area = Σ `monolith_area`; `placedCount` = rows with `layout`.

- [ ] **Step 1: Write failing tests**
  - `sheetTotals(fixture)` → `beamsByLength [{4.9,60},{6.1,8}]`, `totalBlocks 1554`, `totalAreaM2` 193.02 (±0.005), `roomCount 12`.
  - extras-only row (inner_length 0, extraBeams 2, width 4.6) adds 2 to the 4.9 group and 0 blocks.
  - `autoArrange` on 3 unplaced rows, wall 30 → x positions `0`, `w0+30`, `w0+30+w1+30`, all `y 0`, no pair `overlaps`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `Feat(layout-board) · auto-arrange and sheet totals`.

### Task 4: Persistence (DB columns + every save path)

**Files:**
- Modify: `prisma/schema.prisma` (`model Project` ~l.391: `layoutWallCm Int?`; `model Calculation` ~l.522: `layoutJson Json?`)
- Modify: `src/lib/validation.ts` (`RoomCalcInputBaseSchema` l.163: `layout: RoomLayoutSchema.optional().nullable()`; `SaveProjectDraftSchema` l.255: `layoutWallCm: z.coerce.number().int().min(0).max(100).optional().nullable()`; same `layout` field on any order/edit/add-to-order room schema that does not extend the base)
- Modify: `src/lib/calc-persistence.ts` (`calcResultToCreatePayload` l.43 writes `layoutJson: input.layout ?? null`)
- Modify (carry the field exactly the way `m2PriceReason` is carried today): `src/app/api/projects/route.ts`, `src/app/api/projects/[id]/add-to-order/route.ts`, `src/app/api/projects/[id]/drawing-versions/[vid]/restore/route.ts` (incl. its before-restore `roomsJson` snapshot), `src/lib/create-order.ts`, `src/app/api/orders/[id]/edit/route.ts`, `src/lib/agent/persist-quote.ts`, `src/lib/mcp/quote/store.ts`
- Create: `src/lib/layout-board/carry.ts`
- Test: `tests/layout-board-persistence.test.ts`

**Interfaces:**
- Consumes: `RoomLayoutSchema`, `RoomLayout` (Task 1)
- Produces:
  - `function layoutFromDb(json: unknown): RoomLayout | null` — `RoomLayoutSchema.safeParse`, null on failure (never throws)
  - `function carryLayouts<T extends { layout?: RoomLayout | null }>(previous: (RoomLayout | null)[], next: T[]): T[]` — agent/MCP rule: same length → copy by index into rows lacking a layout; different length → all `layout: null`
  - DB field names `Calculation.layoutJson`, `Project.layoutWallCm`; API room field `layout`; API project field `layoutWallCm`

- [ ] **Step 1: Write failing tests**
  - `calcResultToCreatePayload` with `layout {x:10,y:20,rot:90}` → payload `layoutJson` equal to it; without → `null`.
  - `layoutFromDb({x:1,y:2,rot:0})` → object; `layoutFromDb({rot:45})` / `null` / `"x"` → `null`.
  - `carryLayouts([L1,L2],[a,b])` → layouts L1,L2; `carryLayouts([L1],[a,b])` → both null.
  - `SaveProjectDraftSchema.parse` keeps `layoutWallCm 30` and each room's `layout`; rejects `layoutWallCm 150`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** schema columns, zod fields, helper mapping, then thread `layout`/`layoutWallCm` through each listed route/lib (agent + MCP paths use `carryLayouts` with the draft's previous rows ordered by `seq`).
- [ ] **Step 4: Run** `npx prisma generate && npx prisma db push` against the local dev DB (`localhost:5432/precast_crm`), then `npx vitest run` (full suite) — PASS, and `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `Feat(layout-board) · persist room layout and wall thickness`.

### Task 5: Calculator store

**Files:**
- Modify: `src/components/calculation/MultiRoomCalculator.tsx` (`SlabRow` l.36: `layout?: RoomLayout | null`; `recomputeRow` keeps it via the existing `...row` spread — verify)
- Modify: `src/store/calculator.ts` (state `layoutWallCm: number` default `WALL_CM_DEFAULT`; `PersistedShape` l.207 and `partialize` ~l.381 include `layoutWallCm` and rows' `layout`; `loadFrom` reads both)
- Modify: `src/app/(app)/calculations/page.tsx` (save payload sends `layout` per row and `layoutWallCm`; both reopen paths ~l.461/l.552 map `layoutFromDb(calc.layoutJson)` and `project.layoutWallCm ?? WALL_CM_DEFAULT`)
- Test: `tests/calculator-store.test.ts` (extend)

**Interfaces:**
- Consumes: Tasks 1, 4
- Produces store actions: `placeRoom(rowId: string, layout: RoomLayout)`, `unplaceRoom(rowId: string)`, `rotateRoom(rowId: string)` (90° about the room centre), `setLayoutWallCm(cm: number)`, `applyLayouts(map: Map<string, RoomLayout>)`, `undoLayout()`, `redoLayout()` (board-only history, max 100 steps, cleared by `loadFrom`)

- [ ] **Step 1: Write failing tests**
  - place → row has layout; editing that row's `innerLength` keeps `layout` unchanged.
  - delete row 1 of 3 → remaining rows keep their own layouts.
  - `rotateRoom` on a 400×460 room at (0,0) → `{x:-30, y:30, rot:90}` (centre preserved).
  - `undoLayout` after place → layout gone; `redoLayout` → back.
  - persisted shape (via `partialize`) contains `layoutWallCm` and the row `layout`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the actions and page wiring.
- [ ] **Step 4: Run** full suite + `tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** `Feat(layout-board) · store actions and save/reopen wiring`.

### Task 6: Board UI

**Files:**
- Create: `src/components/calculation/layout-board/LayoutBoard.tsx` (panel shell: header with wall-thickness input, auto-arrange, fit-all, zoom ±, undo/redo, export buttons slot; collapsed until ≥1 placed room, toggle «Жойлашув»)
- Create: `src/components/calculation/layout-board/BoardCanvas.tsx` (SVG: pan/zoom, drag with `snapRect`, Alt = no snap, `R` = rotate selected, Delete/«Олиб ташлаш» = unplace, guides, overlap outline in the negative token)
- Create: `src/components/calculation/layout-board/RoomBlock.tsx` (inner rect, wall band, beams/blocks from `beamLayout(bay, beam_count, block_rows, blocks_per_row, beam_length*100, pattern, bearing*100)` with `bay = { rect: roomRect, beamDir }` chosen so beams span the room width; label per spec §6.1: number, `хона W × L`, **`плита B × M`**, pattern label, `N балка · L м`, `A м²`)
- Create: `src/components/calculation/layout-board/Tray.tsx` (cards for unplaced rows; HTML5/pointer drag onto the board drops at the pointer, snapped; greyed non-draggable cards for `!isPlaceable`, extras-only labelled «қўшимча балка»)
- Modify: `src/app/(app)/calculations/page.tsx` — mount `<LayoutBoard />` directly below `<MultiRoomCalculator>` (~l.1143)

**Interfaces:**
- Consumes: Tasks 1–3, 5; `beamLayout`, `CadPattern` from `src/lib/cad/geometry.ts`; pattern labels from `PATTERN_LABEL` (MultiRoomCalculator).
- Produces: `<LayoutBoard />` (no props; reads the calculator store); `export function boardSvgSnapshot(): SVGSVGElement | null` hook/ref for Task 7.

- [ ] **Step 1: Implement** the four components; keep drag state local (commit to store on pointer-up only, so table typing stays fast).
- [ ] **Step 2: Verify** `npx tsc --noEmit`, `npm run lint`, `npx vitest run` — clean.
- [ ] **Step 3: Verify in the browser** (`npm run dev`, calculator tab, enter the 12 rooms of `tests/fixtures/layout-0708d.ts`): drag from tray, wall-gap snap, alignment guides, `R`, Alt, undo/redo, edit a row → block resizes in place, delete a row → block gone, save draft → reload → layout back. Screenshots light + dark, 1440 px wide, saved under `docs/screenshots/layout-board/`.
- [ ] **Step 4: Commit** `Feat(layout-board) · drag-drop-snap board in the calculator tab`.

### Task 7: Sheet export

**Files:**
- Create: `src/lib/layout-board/sheet.ts`
- Create: `public/brand/etalonslabs-logo-dark.png` (copy from `C:\Users\aziz\Downloads\etalon-staircase\brand\etalonslabs-logo-dark.png`)
- Create: `src/components/calculation/layout-board/ExportSheet.tsx` (PNG ≥ 2× and PDF buttons; lazy jsPDF + svg2pdf as in `RoomCanvas.tsx:1418-1430`; file name `<project name or "loyiha">-joylashuv.png|.pdf`; disabled with «Жойлаштирилган хона йўқ» when 0 placed; warning «N хона жойлаштирилмаган» when some unplaced)
- Test: `tests/layout-board-sheet.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 3; `formatNumber`
- Produces: `function buildLayoutSheetSvg(rows: SlabRow[], meta: { projectName: string | null; clientName: string | null; date: Date; wallCm: number; logoHref: string }): string` — self-contained SVG (A4 landscape proportion) with header, dark walls, placed rooms (beams/blocks/labels, **no dashed slab outline**), legend балка/ғишт/девор, summary chips from `sheetTotals` (`Балка 4,90 м — 60 та`, `Ғишт — 1 554 та`, `Майдон — 193,02 м²`), note when unplaced rooms exist, centred watermark (`opacity 0.08`, width 30 %).

- [ ] **Step 1: Write failing tests** with the 0708D fixture all placed via `autoArrange`:
  - output contains `плита 4,90 × 4,06`, `хона 4,60 × 4,00`, `Балка 4,90 м — 60 та`, `Балка 6,10 м — 8 та`, `1 554`, `193,02`, `+998 93 481 33 30`, `Плита жойлашуви`.
  - output contains no `stroke-dasharray`.
  - with one row unplaced: contains `1 хона жойлаштирилмаган` and totals unchanged.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `sheet.ts` and `ExportSheet.tsx`; wire into `LayoutBoard` header.
- [ ] **Step 4: Run** full suite, `tsc`, lint, `npm run build` — all green; export PNG + PDF of the 0708D fixture in the browser and compare by eye with `Downloads/etalon-plans/0708D/plan-0708D.png`; save both under `docs/screenshots/layout-board/`.
- [ ] **Step 5: Commit** `Feat(layout-board) · PNG/PDF top-view sheet export`.

### Task 8: Owner review gate

- [ ] **Step 1:** Run `npm run build`, `npm run lint`, `npx tsc --noEmit`, `npx vitest run`; record the pass lines.
- [ ] **Step 2:** Send the owner the light/dark board screenshots and the exported 0708D sheet (PNG + PDF); list what was verified and anything not verified.
- [ ] **Step 3:** Stop. Push/deploy only after the owner says "deploy" (then follow `reference_deploy` memory: `prisma db push` on prod for the two columns, deploy, prove running image == built).
