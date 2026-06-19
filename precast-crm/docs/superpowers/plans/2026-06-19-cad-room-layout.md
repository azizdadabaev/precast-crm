# CAD Room Layout — Implementation Plan

> Execute task-by-task. Spec: `docs/superpowers/specs/2026-06-19-cad-room-layout-design.md`.

**Goal:** a "Draw room" mode in the calculator: draw a rectilinear outline → auto+manual decompose into rectangular bays → reuse `calculateSlab` per bay → sum + SVG beam/block overlay → output rooms into `MultiRoomCalculator`. Desktop SVG, all counts from the existing engine.

**Engine mapping (locked, from calculation-engine.ts):** `inner_width` = bay extent ALONG the beam run (`beam_length = inner_width + 2×bearing`); `inner_length` = perpendicular extent (`pitches = floor(inner_length/0.58)`). Default beam direction = SHORTER side → `inner_width = short side`.

---

### Task 1 — Foundation: deps + pure geometry lib + GOLDEN test
**Files:** add `rectangle-decomposition` dep; create `src/lib/cad/geometry.ts` + `tests/cad-geometry.test.ts`.

`geometry.ts` (pure, cm/m units explicit):
- `Pt = {x,y}` (cm). `polygonArea(pts)`, `bbox(pts)`, `edgeLengths(pts)`, `snapOrtho(prev, p)` (force last edge axis-aligned), `snapToGrid(p, step)`.
- `decomposeToBays(loop: Pt[]): Rect[]` — wrap `rectangle-decomposition` (integer-scale cm, fix loop orientation, return `{x,y,w,h}` rects in cm).
- `type Bay = { rect: Rect; beamDir: "H" | "V" }`.
- `bayToSlabInput(bay): { inner_width:number; inner_length:number }` — in METERS: along-beam extent → inner_width, perpendicular → inner_length. (H = beams run along x → inner_width = w/100, inner_length = h/100; V = swap.)
- `defaultBeamDir(rect): "H"|"V"` — beams span the shorter side.

Tests:
- [ ] **GOLDEN:** a 3.2 m × 5.0 m bay (beams along width) → `bayToSlabInput` → `calculateSlab(...)` equals `calculateSlab({inner_width:3.2, inner_length:5.0})` field-for-field. (Import the real engine.)
- [ ] `decomposeToBays` on a rectangle → 1 bay; on an L-shape (the screenshot's shape) → 2 bays covering the area with no overlap (sum of bay areas == polygon area).
- [ ] `defaultBeamDir` picks the short side; `snapOrtho`/`snapToGrid` behave.
- [ ] Run, commit.

### Task 2 — SVG drawing surface
**Files:** `src/components/cad/RoomCanvas.tsx`.
Click to add rectilinear vertices (ortho-snap each edge); typed edge-length input; grid; pan/zoom (view transform cm→px); draggable vertex handles; dimension `<text>` at edge midpoints; close-polygon; clear/undo. State = `Pt[]` in cm (single source of truth). Emits `onChange(pts)`. No counting here.
- [ ] Build; manual-verify drawing an L-shape; commit.

### Task 3 — Bays + manual adjust + visualization
**Files:** `src/components/cad/BayLayer.tsx` (+ a small scanline in `geometry.ts`).
Auto-`decomposeToBays(pts)`; render bay rectangles; per-bay beam-direction toggle (default `defaultBeamDir`); optional drag-to-move a split line / merge (v1 can allow direction flip + accept the auto split, with manual split as v1.1). Render the beam strips (parallel lines at PITCH along the bay) + block hatch as an overlay. 
- [ ] Build; commit.

### Task 4 — Calculator integration + persistence
**Files:** edit `src/components/calculation/MultiRoomCalculator.tsx` (add a "Draw room" mode/tab) + the page; persist polygon in `Project.dimensions`.
Each bay → `calculateSlab(bayToSlabInput(bay))` → a `SlabRow` (reuse `recomputeRow`); bays appear as rooms in the existing table; the running BoM is the summed rooms. Save/restore the polygon + bays from `Project.dimensions` (existing JSON; `shapeType=IRREGULAR`).
- [ ] Build; golden-path manual test (draw L → rooms match hand calc); commit.

### Task 5 — Verify + ship behind a flag
- [ ] tsc + vitest + build. Ship behind an opt-in (e.g. an AppConfig/permission flag) so it's dark-launched; deploy (deps picked up by `npm ci`; no schema change if reusing `Project.dimensions`).
