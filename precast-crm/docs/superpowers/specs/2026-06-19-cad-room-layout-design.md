# CAD-like Room Layout & Beam/Block Visualization — Design

**Date:** 2026-06-19
**Status:** Design — pending user review (research complete, decisions locked)

## 1. Problem

The current calculator assumes each room is a **rectangle** (`inner_width × inner_length`). Real rooms are often **L/T/U-shaped** (a rectangle with a notch). For those, a single rectangle formula miscounts beams and blocks, because beam runs differ per zone and a beam line crossing a notch becomes two shorter beams. We need a **CAD-like tool**: draw the real room outline, and get the correct beam/block counts + a visual layout, feeding the existing order flow.

## 2. Key insight (from research)

Two findings converge:

1. **Construction practice = "set out bay by bay."** Manufacturers handle irregular rooms by splitting them into **rectangular bays**, each with its own beam-span direction (standard detail DL185 "change of span direction"). Beams span the **shorter** side of a bay. So an irregular room is a **decomposition** problem, not a new beam-math problem.
2. **The existing engine already does per-rectangle math.** `calculateSlab(inner_width, inner_length)` ([src/services/calculation-engine.ts](../../src/services/calculation-engine.ts)) computes beams/blocks/patterns (GB/BGB/GBG, pitch 0.58 m) + pricing per rectangle; `MultiRoomCalculator` turns rooms into order lines; a tapered engine handles trapezoids.

**Therefore the CAD tool is a geometry FRONT-END, not a new calculator:**

> Draw outline → **decompose into rectangular bays** → set each bay's beam direction (default = short side) → run each bay through the **existing `calculateSlab`** → **sum** + render the beam/block overlay → output one room (`SlabRow`) per bay into the existing calculator.

The proven pattern + pricing logic is **reused**, not reinvented. New work is isolated to (a) the orthogonal drawing surface and (b) the bay-decomposition + visualization layer.

## 3. Locked decisions

| Decision | Choice |
|----------|--------|
| Beam/block counts | **Reuse `calculateSlab` per decomposed bay**, then sum |
| Bay creation | **Auto-decompose + manual adjust** (drag split lines, merge, flip a bay's direction) |
| Drawing surface | **Desktop SVG** (hand-rolled React `<svg>`) — precise, dimensioned cm labels, zero dependency/license |
| Where it lives | **Inside the calculator** — a "Draw room" mode that outputs `SlabRow[]` into `MultiRoomCalculator` |

## 4. Architecture

**4.1 Drawing surface — hand-rolled SVG (React).** Click to place rectilinear vertices; type the exact length of each edge (cm); orthogonal + grid snapping; edit/drag vertices (DOM `<circle>` handles); dimension labels (`<text>` at edge midpoints). Single source of truth = polygon vertices in **cm** (real-world units); one view transform (scale + pan) at render. Crisp lines via integer/`crispEdges`.

**4.2 Bay decomposition.** Decompose the rectilinear polygon into axis-aligned rectangles with **`rectangle-decomposition`** (MIT). Show the suggested split; let the operator drag the split line, merge bays, and set/flip each bay's **beam direction** (default = short side). Each bay → `{ widthM, lengthM, beamDir }`.

**4.3 Counting — reuse the engine.** Map each bay → `calculateSlab` inputs given its beam direction (the dimension the beams **span** vs the dimension beams are **spaced along** must map to `inner_width`/`inner_length` correctly — see §6 golden test). Sum the per-bay `SlabResult`s for room totals.

**4.4 Visualization — scanline overlay.** Render beams as parallel strips at the engine's pitch and blocks between them, per bay/direction, with a small scanline routine (and `js-angusj-clipper` later for wall-clearance inset). This is **display + a cross-check**, not the source of the billed counts (those come from §4.3).

**4.5 Integration seam.** The Draw mode emits one `SlabRow` per bay (via the existing `recomputeRow`/`aiRoomsToSlabRows` path) into `MultiRoomCalculator` → same Place-Order flow. Persist the polygon + bay split in `Project.dimensions` (existing JSON field; `Project.shapeType` already has `IRREGULAR`) so it re-opens for editing.

## 5. Domain rules the layout MUST respect (from manufacturer guides)

- **Span direction = the shorter side** of each bay (beams are span-limited). Wrong direction inverts the counts. Default to short side; allow override.
- **Irregular rooms → rectangular bays**, quantified independently then summed (matches the engine's per-rectangle model).
- **Bearing:** beam length ≈ clear span + 2×bearing (engine default 0.15 m).
- **Beam centre is block-driven** (pitch 0.58 m in the engine) — keep it the engine's constant, not a free field, in v1.
- **Partials at far wall / notch ends** are make-up pieces — surface them but bill per the engine's existing rules (don't invent new billing).

## 6. Testing

- **Golden test (critical):** a rectangle drawn in the tool must produce **identical** beams/blocks/price to typing the same `width × length` into the calculator today. This pins the axis mapping (§4.3).
- **Known shapes:** L, T, U decompositions sum to hand-checked beam/block totals.
- **Pure-unit:** decomposition + the cm-geometry helpers (snap, edge-length, area) are pure and unit-tested; the SVG interaction is manual/integration.

## 7. Phasing

- **v1 (this build):** orthogonal rooms (L/T/U) → auto+manual bays → beam direction per bay → reuse `calculateSlab` → sum + SVG overlay → output rooms into the calculator. Desktop.
- **v2+:** wall-clearance inset (clipper); partition/double-beam markup (replaces a block row with 2 beams + in-situ concrete); angled/trapezoidal walls routed to the **tapered engine**; span/load validation tables; tablet/touch (Konva) if needed.

## 8. Open questions for the plan (not blocking the spec)

- Exact UX for "type the edge length while drawing" vs "draw then edit lengths."
- Whether v1 ships the scanline visual overlay or just the bay rectangles + computed numbers (overlay can be v1.1).
- Persisted polygon schema shape inside `Project.dimensions`.

## 9. Non-goals (v1)

- Non-orthogonal (angled) walls — deferred to the tapered-engine route.
- 3D. Multi-floor. Structural/load certification. Automatic partition detection.
- Replacing the calculator's math or pricing — strictly reused.

## 10. Libraries (all MIT)

`rectangle-decomposition` (bay split) · `js-angusj-clipper` (wall inset, v2) · a ~30-line scanline routine (overlay + cross-check). Drawing surface is dependency-free SVG.
