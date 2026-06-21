# CAD Drawing Tool — Next Features (4-track plan)

> Drafted 2026-06-21 from a 4-engineer review of the existing CAD drawing tool
> (`src/components/cad/RoomCanvas.tsx` + `src/lib/cad/*` + `DrawRoomDialog.tsx`).
> Decision locked: operators draw **desktop-first** → touch/tablet support is
> deferred; room-shape presets is the lead UX feature. Execute task-by-task;
> each task ends with build + (where noted) vitest + commit.

The four tracks, in recommended sequence:

| # | Track | Why | Effort | Risk |
|---|-------|-----|--------|------|
| 1 | **Persist the drawing** | The sketch is destroyed on "Add rooms" / dialog close. Keystone — unblocks reopen/edit, versioning, export, send. | S→M | low |
| 2 | **Stock-length + wastage in the quoted path** | Beams billed at exact length → off-cut waste given away on every quote. Pure margin, config-gated. | M | low (gated) |
| 3 | **Openings / voids** | Stairwells/shafts billed as solid concrete → wrong quantities. Highest correctness leverage; needs the multi-loop model. | L | med |
| 4 | **Room-shape presets** | Hand-placing an L/T/notch vertex-by-vertex is the slowest, most error-prone moment. Rides existing primitives. | M | low |

---

## Track 1 — Persist the drawing

**Problem.** `DrawRoomDialog` holds `points`/`globalDir`/`dirOverrides` in local
`useState`. `handleAdd` → `reset()` clears them; `handleClose` also resets. The
calculator store (`src/store/calculator.ts`) autosaves rows/client/etc. to
localStorage but carries **no drawing**. No DB column holds an outline either
(`Calculation`/`Project.dimensions` store only scalars). So a sketch can't
survive a refresh, be reopened to tweak, attach to a saved project, or be
re-sent.

### Task 1A — Persist the in-progress sketch in the calculator store (no DB)
**Files:** `src/store/calculator.ts`, `src/components/calculation/DrawRoomDialog.tsx`, `src/app/(app)/calculations/page.tsx`.
- Add `drawing: CalculatorDrawing | null` to state + `PersistedShape` + `partialize` + `INITIAL_STATE` (null). `CalculatorDrawing = { points: Pt[]; globalDir: BeamDir | null; dirOverrides: Record<number, BeamDir> }` (types from `@/lib/cad/geometry`). Add `setDrawing(d)` action. `loadFrom`/`clearAll` reset it to null (via `INITIAL_STATE`). No `version` bump (shallow-merge gives old payloads `drawing: null`).
- `DrawRoomDialog` reads `drawing` + `onDrawingChange` props instead of local state; derive `points = drawing?.points ?? []`.
- **Semantics:** `handleClose` (Cancel/✕) now **retains** the sketch (just `onClose()`); `handleAdd` (success) clears it (`onDrawingChange(null)`) so the same drawing can't be double-added. Reopening "Draw room" restores the retained sketch.
- Page wires `drawing={drawing}` / `onDrawingChange={setDrawing}` to the dialog.
- [ ] Build + tsc. Manual: draw → close → reopen shows the sketch; refresh keeps it; Add rooms clears it; Clear wipes it. Commit.

### Task 1B — Persist the drawing to the DB on Save, hydrate on reopen
**Files:** `prisma/schema.prisma`, `src/lib/validation.ts` (`SaveProjectDraftSchema`), `src/app/api/projects/route.ts`, `calculations/page.tsx` (`loadProject`/`loadOrder`), order create/edit routes as needed.
- Add `drawingJson Json?` to **`Project`** (project-level: one outline fans out to N rooms today — matches reality better than per-`Calculation`). `db push` locally; ships to prod via normal deploy.
- `SaveProjectDraftSchema` accepts optional `drawing`. POST writes it (both create + update branches — note the update path `deleteMany`s calculations, so the outline must live on `Project`, not a child).
- `loadProject`/`loadOrder` hydrate `drawing` back into the store so "Draw room" reopens the exact outline.
- **Provenance decision (lock before build):** v1 keeps the drawing as a *visual/edit record* only — reopening + re-adding still appends (no auto-replace of the rows it produced). A true "edit drawing → replace its rows" needs row provenance and is **Track 1C (deferred)**.
- [ ] Build + tsc. Manual: Save a drawn project → reopen from /projects → drawing restored. Commit.

### Task 1C — (deferred) row provenance + edit-replace
Tag rows with a `drawingGroupId`; reopening the drawing and re-adding replaces that group instead of appending. Out of scope for the first cut.

---

## Track 2 — Stock-length rounding + wastage allowance (quoted path)

**Problem.** The rectilinear (golden) quote path bills beams at exact computed
length (`beam_length`, `round3`). No round-up to a castable stock length, no
wastage %. The scanline path already has `BEAM_STOCK_STEP_CM` + round-up in
`src/lib/cad/beam-scan.ts` — it just never reaches the dominant quote path.
Off-cut waste is given away on every quote.

### Task 2A — Config knobs + engine
**Files:** `src/services/calculation-engine.ts` (verify exact `PriceConfig`/tier fns), pricing config loader (`src/lib/pricing-config.ts`), `src/lib/validation.ts`.
- Add to `PriceConfig` (stored in `AppConfig` `"pricing"` key — no migration): `beamStockStepCm` (default 0 = off → byte-identical to today) and `beamWastagePct` (default 0).
- `calculateSlab` exposes `beam_stock_length = roundUpToStep(beam_length, step)` alongside exact `beam_length`. Billed length respects the allowance; the drawing keeps exact length.
- [ ] Golden test: with step=0/wastage=0, every existing fixture is unchanged. With step=5cm, a 3.47 m beam bills at 3.50 m. vitest + commit.

### Task 2B — Roll up + surface
**Files:** `src/lib/order-totals.ts`, `MultiRoomCalculator.tsx` (Production list), `/pricing` settings page.
- Roll `wastedBeamMeters` into `computeOrderTotals`; show billed vs exact length per beam-length group in the Production list. Add the two knobs to the pricing settings UI.
- [ ] Build + tsc + vitest. Commit.

---

## Track 3 — Openings / voids (multi-loop outline)

**Problem.** Editor is single-loop (`points: Pt[]`). No way to punch a stair
void/shaft/courtyard, so `floorAreaCm2` + beam/block counts cover concrete that
isn't poured → over-billing.

### Task 3A — Multi-loop geometry model
**Files:** `src/lib/cad/geometry.ts`, `tests/cad-geometry.test.ts`.
- Model `{ outer: Pt[]; holes: Pt[][] }`. `floorAreaCm2` subtracts Σ|hole area| (signed `polygonArea` exists). `pointInPolygon` → "inside outer AND outside all holes". Multi-loop `isValidOutline` (per-loop non-self-intersecting, holes inside outer, holes disjoint).
- [ ] vitest: area-minus-holes; validation rejects hole-outside-outer / overlapping holes. Commit.

### Task 3B — Engine hole-awareness
**Files:** `src/lib/cad/beam-scan.ts`, `geometry.ts` (`decomposeToBays`).
- Feed hole edges into `scanCrossingsX` (already even-odd) → a scan line yields beams either side of a void. Extend `decomposeToBays`' even-odd sweep to holes. Block cells whose centre is in a hole → `omitted`.
- [ ] vitest: a rectangle with a centred void → reduced beam metres + omitted blocks. Commit.

### Task 3C — Draw + render holes
**Files:** `RoomCanvas.tsx`, `DrawRoomDialog.tsx`.
- "Add void" tool: draw an inner loop. Render via the even-odd outer-minus-inner path already proven by `ringBandPath`. Thread the multi-loop value through `onChange`/persistence (depends on Track 1's persisted shape).
- [ ] Build + manual: stairwell void deducts area/blocks. Commit.

### Task 3D — BoM deductions
**Files:** `order-totals.ts`, `draw-rooms.ts`, `MultiRoomCalculator.tsx`.
- Net area/blocks/beams in the quote + persisted totals; show deducted figures. (Beam *trimming/header* around openings is a follow-up — start with area + block + full-beam omission.)
- [ ] vitest + manual. Commit.

---

## Track 4 — Room-shape presets

**Problem.** Every room starts from a blank grid. Drawing an L/T/U/notch means
placing ~6 ortho vertices in order without self-crossing — the slowest,
most error-prone moment for a non-CAD operator.

### Task 4A — Preset outlines + toolbar
**Files:** `src/lib/cad/presets.ts` (new), `RoomCanvas.tsx`.
- `presets.ts`: pure functions returning closed `Pt[]` for L / T / U / rectangle-with-notch at a default size (parametrised by an overall extent). Reuse nothing risky — just literal/parametric vertex arrays.
- Toolbar "Shapes" group next to Draw/Rect/Measure (`Tool` union + `switchTool`); picking a shape `commit(preset, true)` (same path as the Rect tool's `endDrag`) then selects it so the user slides walls / types lengths (existing `moveEdgeParallel` + click-to-type-length) to fit.
- [ ] Build + manual: tap L → editable L appears, dimensions tweakable. Commit.

### Task 4B — (optional) "Set scale from one dimension"
Click one edge, type its true length, uniformly scale the whole closed outline
about its bbox centre (reuse the transform plumbing). Helps the trace-rough-then-fix
case. Defer unless requested.

---

## Sequencing notes
- Track 1A is the safe first increment (no DB, no engine, no migration) and is the foundation for 1B + Track 3's persisted multi-loop shape.
- Track 2 is independent and can interleave at any point (pure money, gated by config defaults of 0).
- Track 3 should land after Track 1's persisted shape is settled so the `{outer, holes}` value is persisted once.
- Track 4 is independent and low-risk; good as a parallel quick win.
