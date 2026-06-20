# CAD "Sheet" Suite — In-Browser Vector Drawing + Server-Rendered PDF — Design

**Date:** 2026-06-20
**Status:** Design — pending user review
**Branch:** `feat/cad-room-layout` (localhost-only; NOT deployed until this lands + is reviewed)
**Origin:** Roadmap from the `cad-suite-roadmap` multi-agent workshop (7 agents, 54 findings), mining the Blender add-on (`precast_slab_designer`) + CAD best practice for our niche.

---

## 1. Problem

Our SVG drawing suite (`RoomCanvas` + `DrawRoomDialog`) renders a beautiful, dimensioned **picture with no numbers** — every quantity (cut-list, blocks, m², price) lives only in the on-screen side panel. So an operator quoting over Telegram sends the **drawing AND a second message** with quantities + price. That fragments the offer, erodes trust ("is this drawing even my quote?"), and gives the on-site builder no consolidated order list.

Separately, the only "real" drawing today is produced by a **Blender add-on on the owner's PC** over a WebSocket bridge (`/api/drawings/request` → desktop Blender → PDF). When that PC is off, drawing-on-demand returns `503 BLENDER_OFFLINE`.

We want a **self-contained, to-scale, branded drawing sheet** — title block + dimensioned plan + BoM/cut-list + totals + weight — generated **in-house on the server**, always available, that a client can act on and a builder can build from. This in-house path is **additive** — the existing Blender bridge stays untouched (owner directive); the new sheet simply gives an always-available, self-contained alternative.

### Confirmed inputs (2026-06-20)
- **Weight constants:** precast beam **32 kg per metre**; filler (hourdis) block **16 kg each**. (Topping concrete is site-poured → NOT part of truck-load weight.)
- **Company header band:** `EtalonSlabs «Yig'ma Monolit»` · `+998934813330` (logo optional, later).
- **Page size:** A4 (landscape).
- **Source:** render from BOTH a saved `Calculation` AND transient live calculator state (signed payload).
- **Blender bridge:** stays, no matter what — do NOT modify it.

## 2. Key insight (from the workshop)

`RoomCanvas.exportPng` already **serializes the live SVG to a string** (`XMLSerializer`) and then **throws it away** to rasterize a PNG. The vector is right there. The whole roadmap is: build **one paper-space "sheet" surface**, then stack features whose data the engine **already computes** (`calculateSlab`, `projectTotal`, `mergeBeamSchedule`) onto it as pure presentation — no new geometry math.

**The single hard rule:** the sheet must be fed the **exact same** `calculateSlab` / `projectTotal` / `mergeBeamSchedule` outputs the calculator/invoice uses — **never recompute** — so the sent sheet reconciles byte-for-byte with the quote (the same guarantee Protocol v2 already gives Blender).

## 3. Locked decisions

| Decision | Choice |
|---|---|
| PDF production | **Server-side render route** — `puppeteer-core` (already a dep) drives headless Chromium to print an internal print page to PDF at exact A4 mm. Perfect Cyrillic fonts + true mm scale; provides always-on, in-house drawing-on-demand. |
| Render surface | A **dedicated, pure "sheet" render layer** (`src/lib/cad/sheet/*` + an internal print route), NOT more inline JSX in the 1900-line `RoomCanvas`. The interactive editor and the static sheet share the same pure geometry/overlay producers. |
| Data source | The sheet renders from **committed `Calculation` values** (Protocol-v2 style: resolved pattern + pitches), reusing `normalize-rooms.ts`. Never re-derive pattern/pitch on the sheet. |
| Scale | Auto-pick a round architectural ratio (1:50 / 1:75 / 1:100 / 1:125 / 1:150 / 1:200) that fits the usable sheet; stamp `SCALE 1:N` + date. Chromium prints @page A4 at real mm → true scale. |
| Language | **Uzbek-first (native Cyrillic)**, English secondary, via existing `useT()` / `Bi` convention. Server Chromium renders Cyrillic directly — **no transliteration** (a strict upgrade over the Blender path, which latinizes in `normalize-rooms.ts` because Blender can't render Cyrillic). |
| Bridge | **Untouched (owner directive — it stays, no matter what).** The in-house sheet is a SEPARATE, additive drawing path that coexists with the existing Blender flow; it neither replaces nor gates it. |

## 4. Architecture

### 4.1 Pure sheet render layer — `src/lib/cad/sheet/`
Pure, unit-testable modules (no React, no DOM) that emit **SVG strings / React SVG elements** in **paper-space mm**:

- `sheet-scale.ts` — `pickArchScale(worldWcm, worldHcm, sheet): { ratio, mmPerCm, ... }` (the genuinely transferable kernel from the Blender PDF writer's auto-scale). `SheetOptions` type (page size A4/A3, margins, dim offsets, text sizes, font-scale) with good defaults.
- `sheet-plan.ts` — given a room's committed calc + drawn polygon (or the rectilinear bay / scanline overlay we already compute), emit the **plan drawing**: outline, ring-beam hatch (reuse `offsetPolygonOutward`), beams + blocks (reuse `beamLayout` / `scanBeamsToOverlay`), bearing seats, dimension lines (reuse `dimStyleForEdge`, `edgeOutwardNormal`, `dimensionOffsetLevels`, `dimLabelAngleDeg`), **numbered beams (B1…Bn)** + **pitch chain** (reuse `perpDimension`, `patternSpans`).
- `sheet-bom.ts` — emit the **schedule/quote block**: per-room cut-list (`mergeBeamScheduleByKind` rows `{lengthCm, qty}`), total blocks, billed m², m² price, subtotal; project **JAMI / discount / UMUMIY SUMMA** from `projectTotal`. Pure `<rect>/<text>`. Fed exact engine outputs.
- `weight.ts` — `estimateWeight(calc)` = beams (Σ length_m × **32 kg/m**) + filler blocks (count × **16 kg**). Truck-load (as-delivered precast) only; topping concrete is site-poured and NOT counted. Constants owner-confirmed; keep them in one named place (`AppConfig` or a module const) for easy update.
- `sheet-pack.ts` — `shelfPack(rooms, sheet)` → per-room paper-space offsets (sort by height, wrap left-to-right, paginate). Multi-room only; **defer** anchoring/union-find.
- `sheet-doc.tsx` — composes title/header band (company name/logo/phone), plan(s), BoM, weight, scale stamp into a full A4 sheet (single-room and multi-room).

### 4.2 Internal print page — `src/app/print/sheet/page.tsx`
A minimal, chromeless route that takes a drawing id (or signed transient payload), loads the committed rooms, and renders `sheet-doc` with `@page { size: A4 landscape; margin: 0 }` and mm-sized SVG. Used only as the Chromium print target (and handy for manual preview).

### 4.3 Server render route — `POST /api/drawings/render`
- Input: same normalized rooms payload as `/api/drawings/request` (reuse `normalizeRoomsForBlender` / `validateRoomsForBlender`).
- Launches `puppeteer-core` → Chromium (dev: local channel; prod: chromium in the Docker image), navigates to `/print/sheet`, `page.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true })`.
- Persists the PDF like the Blender path (same storage + `Drawing` record) and returns it.
- Surfaced as a **new** drawing action in the UI alongside the existing Blender flow; the bridge is **not modified**.

### 4.4 Client export (cheap win, ships with Phase 1)
`RoomCanvas.exportPng` is split: `exportSvg()` returns the serialized vector for a direct **`.svg` download** (native Cyrillic, openable/printable). `Export PNG` stays. This is the interactive-editor counterpart; the **authoritative shareable** is the server PDF.

### 4.5 Data flow
```
Calculation (committed pattern+pitches)  ─┐
calculateSlab / projectTotal / mergeBeamSchedule (SAME outputs as calculator)
   └─► sheet/* pure builders ─► /print/sheet (mm SVG) ─► puppeteer PDF ─► Drawing store ─► Telegram
```

## 5. Domain rules the sheet MUST respect
- **Reconciliation:** BoM numbers == calculator/invoice numbers, always. Render committed values; never recompute pattern/pitch.
- **Estimate honesty:** scanline (angled/tapered) rooms produce **estimate** cut-lists — label such sheets distinctly so a builder doesn't order to an approximate count. Numbered beams/pitch chain on a tapered room must not imply false precision.
- **Scale truth:** only stamp `SCALE 1:N` if the PDF preserves real mm — verify with a printed-ruler test and an embedded/installed Cyrillic font before claiming it.
- **Weight basis:** truck-load weight = beams (Σ length_m × 32 kg/m) + filler blocks (count × 16 kg) — the **as-delivered precast**. Site-poured topping concrete is NOT counted (the factory doesn't truck it).

## 6. Phasing (each phase ships to the branch, tested)
1. **Foundation:** `sheet-scale.ts` + `sheet-plan.ts` (plan + dims, no BoM) + `/print/sheet` + `/api/drawings/render` → true-scale single-room PDF; `exportSvg()` button. Ruler-test the scale.
2. **BoM + price block** (`sheet-bom.ts`) — exact reconciliation test vs calculator.
3. **Numbered beams + pitch chain** (in `sheet-plan.ts`).
4. **Weight** (`weight.ts`) — beams 32 kg/m + blocks 16 kg (owner-confirmed); rendered on the BoM block.
5. **Branding + Uzbek-first styling** — `EtalonSlabs «Yig'ma Monolit»` + `+998934813330` header band, `useT()` localization of sheet strings, phone-legible fonts.
6. **Multi-room project sheet** (`sheet-pack.ts` + grand BoM via `mergeBeamSchedule`, grand total via `projectTotal`).
7. **Surface the in-house sheet** as a new drawing action in the UI (alongside the **untouched** Blender flow); render from a saved `Calculation` or transient calculator state.

## 7. Testing
- Pure unit (vitest): `pickArchScale` (ratio selection + mm math), `estimateWeight`, `shelfPack`, BoM row derivation, sheet-string snapshot tests.
- **Reconciliation test:** BoM totals === `projectTotal`/`calculateSlab` for a fixture project (byte-for-byte).
- **Scale fidelity:** assert mm-per-cm in the emitted SVG matches the picked ratio; manual ruler test on a printed PDF.
- Route test: `/api/drawings/render` returns a non-empty `application/pdf`; Chromium-launch mocked in CI, real in a smoke check.

## 8. Non-goals (dropped by both lenses)
3D / three.js + HUD; room-anchoring graph (union-find, N/S/E/W align) — `sheet-pack` shelf-pack covers multi-room until an operator asks for a true relative floor-plan; draggable persisted label overrides (auto-placement is already strong); layer/visibility toggles; freehand annotation; DXF export (cheap later over the pure cm geometry **when** an architect concretely asks).

## 9. Libraries
`puppeteer-core` (already present) + a Chromium binary (prod Docker must install chromium + a Cyrillic-capable font; dev uses the local Chrome channel). No new client PDF lib. Everything else reuses existing pure geometry (`geometry.ts`, `beam-scan.ts`, `offset.ts`, `grid.ts`).

## 10. Risks (open questions resolved — see §1 "Confirmed inputs")
- **Chromium in prod Docker:** image size + a bundled Cyrillic font (e.g. DejaVu/Noto Sans). Must be added to the Dockerfile; verify `puppeteer-core` finds the binary. This is the main deploy cost of the server-PDF choice.
- **RoomCanvas duplication:** the sheet must reuse the pure overlay producers (`beamLayout`, `scanBeamsToOverlay`, `offsetPolygonOutward`, dimension helpers), not fork the rendering — keep the sheet a thin composable layer.
- **Branch not deployed:** the nested `precast-crm/precast-crm` path + prod `/uploads` media-gating (already in memory) must be handled before this reaches operators; don't imply it's live.
- **Bridge is off-limits:** the Blender WebSocket bridge (`/api/drawings/request`, `SendToBlenderButton`, `normalize-rooms.ts`) must NOT be modified — the in-house render is strictly additive, reusing `normalize-rooms.ts` read-only as the shared input contract.
