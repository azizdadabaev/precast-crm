# CAD Sheet — Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a true-to-scale, single-room **vector drawing sheet** (plan + dimensions + scale stamp, NO BoM yet) as an A4-landscape **PDF rendered server-side** via headless Chromium, plus a client-side **SVG download** in the editor. This is the paper-space surface every later phase (BoM, weight, branding, multi-room) draws onto.

**Architecture:** A pure `src/lib/cad/sheet/*` layer emits paper-space (mm) draw primitives from the SAME committed `calculateSlab` outputs the calculator uses (never recompute). A chromeless `/print/sheet` page renders them as an SVG sized in mm with `@page A4 landscape`. `POST /api/drawings/render` drives `puppeteer-core` (reusing the launcher pattern in `src/lib/agent/quote-card-shot.ts`) to print that page to PDF. The Blender bridge is NOT touched.

**Tech Stack:** Next.js 14 App Router, TypeScript, hand-rolled SVG, `puppeteer-core` (already a dep), vitest. Reuses `geometry.ts` (`decomposeToBays`, `bayToSlabInput`, `beamLayout`, `fitView`, dimension helpers), `calculation-engine.ts` (`calculateSlab`, `SlabResult`).

**Spec:** `docs/superpowers/specs/2026-06-20-cad-sheet-suite-design.md`. **Scope note:** Phase 1 renders STANDARD rectangular rooms (`inner_width × inner_length` from a `calculateSlab` result) — the common quote case. The freehand-polygon CAD path is a later extension.

---

### Task 1 — `sheet-scale.ts`: architectural scale picker + sheet options

**Files:**
- Create: `src/lib/cad/sheet/sheet-scale.ts`
- Test: `tests/cad-sheet-scale.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { pickArchScale, A4_LANDSCAPE, usableSheetMm, SCALE_RATIOS } from "@/lib/cad/sheet/sheet-scale";

describe("sheet-scale", () => {
  it("usable area subtracts margins from the page", () => {
    const u = usableSheetMm(A4_LANDSCAPE, 10);
    expect(u.wMm).toBeCloseTo(297 - 20, 6);
    expect(u.hMm).toBeCloseTo(210 - 20, 6);
  });

  it("picks the FIRST ratio whose drawing fits the usable sheet", () => {
    // 5.0 m × 3.0 m room. usable A4-L @10mm margin = 277 × 190 mm.
    // 1:50 → 5000/50=100mm × 3000/50=60mm ≤ 277×190 → fits → pick 1:50.
    const s = pickArchScale(500, 300, A4_LANDSCAPE, 10);
    expect(s.ratio).toBe(50);
    expect(s.mmPerCm).toBeCloseTo(1 / 50 * 10, 9); // 1cm world → (10mm)/50 paper mm = 0.2mm/cm
    expect(s.drawWMm).toBeCloseTo(100, 6);
    expect(s.drawHMm).toBeCloseTo(60, 6);
  });

  it("falls to a coarser ratio for a big plan, and never returns < the coarsest", () => {
    // 20 m × 12 m. 1:50 → 400×240 (too big). steps up until it fits.
    const s = pickArchScale(2000, 1200, A4_LANDSCAPE, 10);
    expect(s.ratio).toBeGreaterThan(50);
    expect(s.drawWMm).toBeLessThanOrEqual(277 + 1e-6);
    expect(s.drawHMm).toBeLessThanOrEqual(190 + 1e-6);
    // huge plan that fits no ratio → coarsest ratio returned (clamped), flagged
    const big = pickArchScale(100000, 100000, A4_LANDSCAPE, 10);
    expect(big.ratio).toBe(SCALE_RATIOS[SCALE_RATIOS.length - 1]);
    expect(big.overflow).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `cd precast-crm && npx vitest run tests/cad-sheet-scale.test.ts` → "Cannot find module".

- [ ] **Step 3: Implement `sheet-scale.ts`**

```ts
// Pure paper-space scale math for the drawing sheet. cm = world (the geometry
// layer is centimetres); mm = paper. A ratio of 1:N means N mm world == 1 mm paper.
export interface SheetSize { wMm: number; hMm: number; }
export const A4_LANDSCAPE: SheetSize = { wMm: 297, hMm: 210 };
export const A4_PORTRAIT: SheetSize = { wMm: 210, hMm: 297 };

// "Nice" architectural denominators, ascending (finer → coarser).
export const SCALE_RATIOS = [50, 75, 100, 125, 150, 200, 250, 300, 400, 500] as const;

export interface SheetOptions {
  page: SheetSize;
  marginMm: number;
  /** Multiplies all text sizes; 1 = defaults tuned for A4. */
  fontScale: number;
}
export const DEFAULT_SHEET_OPTIONS: SheetOptions = {
  page: A4_LANDSCAPE,
  marginMm: 10,
  fontScale: 1,
};

export function usableSheetMm(page: SheetSize, marginMm: number): { wMm: number; hMm: number } {
  return { wMm: page.wMm - 2 * marginMm, hMm: page.hMm - 2 * marginMm };
}

export interface ArchScale {
  ratio: number;      // the N in 1:N
  mmPerCm: number;    // paper mm per 1 cm world = 10 / ratio
  drawWMm: number;    // world width rendered, in paper mm
  drawHMm: number;
  overflow: boolean;  // true when even the coarsest ratio doesn't fit (clamped)
}

/** Pick the FIRST (finest) ratio whose world box fits the usable sheet.
 *  worldWcm/worldHcm are the drawing's world extent in centimetres. */
export function pickArchScale(
  worldWcm: number,
  worldHcm: number,
  page: SheetSize,
  marginMm: number,
): ArchScale {
  const { wMm, hMm } = usableSheetMm(page, marginMm);
  for (const ratio of SCALE_RATIOS) {
    const mmPerCm = 10 / ratio;            // 1 cm world → (1 cm = 10 mm)/ratio paper mm
    const drawWMm = worldWcm * mmPerCm;
    const drawHMm = worldHcm * mmPerCm;
    if (drawWMm <= wMm + 1e-6 && drawHMm <= hMm + 1e-6) {
      return { ratio, mmPerCm, drawWMm, drawHMm, overflow: false };
    }
  }
  const ratio = SCALE_RATIOS[SCALE_RATIOS.length - 1];
  const mmPerCm = 10 / ratio;
  return { ratio, mmPerCm, drawWMm: worldWcm * mmPerCm, drawHMm: worldHcm * mmPerCm, overflow: true };
}
```

- [ ] **Step 4: Run tests, expect PASS.** Then `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** — `Feat(cad-sheet) · architectural scale picker (sheet-scale.ts)`.

---

### Task 2 — `sheet-plan.ts`: pure paper-space draw-list for one rectangular room

**Files:**
- Create: `src/lib/cad/sheet/sheet-plan.ts`
- Test: `tests/cad-sheet-plan.test.ts`

A pure builder turning a committed room into mm-space primitives, reusing the existing overlay producers. Output is a flat list of `{type, ...}` primitives the print page renders as SVG (decoupling geometry from React).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildRoomPlan } from "@/lib/cad/sheet/sheet-plan";
import { calculateSlab } from "@/services/calculation-engine";
import { A4_LANDSCAPE } from "@/lib/cad/sheet/sheet-scale";

describe("sheet-plan", () => {
  it("builds a scaled plan with outline, beams, and two outer dimensions", () => {
    const calc = calculateSlab({ inner_width: 3.2, inner_length: 5.0 });
    const plan = buildRoomPlan(
      { name: "Хона 1", calc, beamDir: "H" },
      { page: A4_LANDSCAPE, marginMm: 10, fontScale: 1 },
    );
    // Outline rect present, sized in mm at the picked scale.
    const outline = plan.primitives.find((p) => p.type === "rect" && p.role === "outline");
    expect(outline).toBeTruthy();
    // beams rendered = engine beam_count
    const beams = plan.primitives.filter((p) => p.type === "rect" && p.role === "beam");
    expect(beams.length).toBe(calc.beam_count);
    // exactly two outer dimension labels (width + length)
    const dims = plan.primitives.filter((p) => p.type === "text" && p.role === "dim");
    expect(dims.length).toBe(2);
    expect(plan.scale.ratio).toBeGreaterThanOrEqual(50);
    // all primitives lie within the page mm box
    for (const p of plan.primitives) {
      if ("xMm" in p) { expect(p.xMm).toBeGreaterThanOrEqual(-1e-6); expect(p.xMm).toBeLessThanOrEqual(A4_LANDSCAPE.wMm + 1e-6); }
    }
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `sheet-plan.ts`** — derive a single bay from the room rectangle, run `beamLayout`, map cm→mm at the picked scale, centre on the usable area, add the two outer dimension labels + a `SCALE 1:N` stamp.

```ts
import type { SlabResult } from "@/services/calculation-engine";
import type { BeamDir } from "@/lib/cad/geometry";
import { bayToSlabInput, beamLayout, defaultBeamDir } from "@/lib/cad/geometry";
import { pickArchScale, usableSheetMm, type ArchScale, type SheetOptions } from "@/lib/cad/sheet/sheet-scale";

export interface RoomInput { name: string; calc: SlabResult; beamDir?: BeamDir; }

export type PlanPrimitive =
  | { type: "rect"; role: "outline" | "beam" | "bearing" | "block"; xMm: number; yMm: number; wMm: number; hMm: number }
  | { type: "line"; role: "dim" | "witness"; x1Mm: number; y1Mm: number; x2Mm: number; y2Mm: number }
  | { type: "text"; role: "dim" | "stamp" | "name"; xMm: number; yMm: number; text: string; sizeMm: number; align: "L" | "C" | "R" };

export interface RoomPlan { primitives: PlanPrimitive[]; scale: ArchScale; widthMm: number; heightMm: number; }

export function buildRoomPlan(room: RoomInput, opts: SheetOptions): RoomPlan {
  const iwCm = Math.round(room.calc.inner_width * 100);
  const ilCm = Math.round(room.calc.inner_length * 100);
  // Rectangle is one bay; beamDir defaults to the short side.
  const rect = { x: 0, y: 0, w: iwCm, h: ilCm };
  const beamDir: BeamDir = room.beamDir ?? defaultBeamDir(rect);
  const layout = beamLayout(
    { rect, beamDir },
    room.calc.beam_count, room.calc.block_rows, room.calc.blocks_per_row,
    Math.round(room.calc.beam_length * 100), room.calc.pattern,
    Math.round(room.calc.bearing * 100),
  );

  const scale = pickArchScale(iwCm, ilCm, opts.page, opts.marginMm);
  const { wMm, hMm } = usableSheetMm(opts.page, opts.marginMm);
  // Centre the drawing in the usable area; origin at sheet top-left (y-down).
  const offX = opts.marginMm + (wMm - scale.drawWMm) / 2;
  const offY = opts.marginMm + (hMm - scale.drawHMm) / 2;
  const X = (cm: number) => offX + cm * scale.mmPerCm;
  const Y = (cm: number) => offY + cm * scale.mmPerCm;
  const S = (cm: number) => cm * scale.mmPerCm;

  const primitives: PlanPrimitive[] = [];
  primitives.push({ type: "rect", role: "outline", xMm: X(0), yMm: Y(0), wMm: S(iwCm), hMm: S(ilCm) });
  for (const b of layout.beams) primitives.push({ type: "rect", role: "beam", xMm: X(b.x), yMm: Y(b.y), wMm: S(b.w), hMm: S(b.h) });
  for (const b of layout.bearings) primitives.push({ type: "rect", role: "bearing", xMm: X(b.x), yMm: Y(b.y), wMm: S(b.w), hMm: S(b.h) });
  // Two outer dimension labels (mm world values), parked just outside the box.
  const dimSize = 2.6 * opts.fontScale;
  primitives.push({ type: "text", role: "dim", xMm: X(iwCm / 2), yMm: Y(0) - 2, text: `${iwCm * 10}`, sizeMm: dimSize, align: "C" });
  primitives.push({ type: "text", role: "dim", xMm: X(0) - 2, yMm: Y(ilCm / 2), text: `${ilCm * 10}`, sizeMm: dimSize, align: "R" });
  primitives.push({ type: "text", role: "stamp", xMm: opts.page.wMm - opts.marginMm, yMm: opts.marginMm + 3, text: `SCALE 1:${scale.ratio}`, sizeMm: 3 * opts.fontScale, align: "R" });
  primitives.push({ type: "text", role: "name", xMm: opts.marginMm, yMm: opts.marginMm + 3, text: room.name, sizeMm: 3.4 * opts.fontScale, align: "L" });

  return { primitives, scale, widthMm: opts.page.wMm, heightMm: opts.page.hMm };
}
```

- [ ] **Step 4: Run tests, expect PASS.** `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** — `Feat(cad-sheet) · pure room plan draw-list (sheet-plan.ts)`.

---

### Task 3 — `/print/sheet` chromeless page renders the plan as mm SVG

**Files:**
- Create: `src/app/print/sheet/page.tsx`
- Create: `src/lib/cad/sheet/SheetSvg.tsx` (pure renderer of `PlanPrimitive[]` → `<svg>`)

- [ ] **Step 1: Implement `SheetSvg.tsx`** — an SVG sized `width={widthMm}mm height={heightMm}mm viewBox="0 0 W H"` (user units = mm) that maps each primitive to `<rect>/<line>/<text>` with mm coordinates, fills matching the on-screen palette (outline stroke, beam fill, bearing tint), Helvetica/`sans-serif` text, `text-anchor` from `align`.

```tsx
import type { PlanPrimitive } from "@/lib/cad/sheet/sheet-plan";
export function SheetSvg({ widthMm, heightMm, primitives }: { widthMm: number; heightMm: number; primitives: PlanPrimitive[] }) {
  const anchor = (a: "L" | "C" | "R") => (a === "L" ? "start" : a === "R" ? "end" : "middle");
  return (
    <svg width={`${widthMm}mm`} height={`${heightMm}mm`} viewBox={`0 0 ${widthMm} ${heightMm}`} xmlns="http://www.w3.org/2000/svg">
      <rect x={0} y={0} width={widthMm} height={heightMm} fill="#ffffff" />
      {primitives.map((p, i) => {
        if (p.type === "rect") {
          const fill = p.role === "beam" ? "#2563eb" : p.role === "bearing" ? "#94a3b8" : p.role === "block" ? "#dbeafe" : "none";
          const stroke = p.role === "outline" ? "#0f172a" : "#1e40af";
          return <rect key={i} x={p.xMm} y={p.yMm} width={p.wMm} height={p.hMm} fill={fill} fillOpacity={p.role === "outline" ? 0 : 0.85} stroke={stroke} strokeWidth={p.role === "outline" ? 0.35 : 0.12} />;
        }
        if (p.type === "line") return <line key={i} x1={p.x1Mm} y1={p.y1Mm} x2={p.x2Mm} y2={p.y2Mm} stroke="#475569" strokeWidth={0.18} />;
        return <text key={i} x={p.xMm} y={p.yMm} fontSize={p.sizeMm} fontFamily="Helvetica, Arial, sans-serif" fontWeight={p.role === "name" ? 700 : 500} fill="#0f172a" textAnchor={anchor(p.align)} dominantBaseline="middle">{p.text}</text>;
      })}
    </svg>
  );
}
```

- [ ] **Step 2: Implement `/print/sheet/page.tsx`** — a server component reading `searchParams` (a `calcId` for a saved `Calculation`, OR a `payload` = signed/base64 JSON of transient rooms — Phase 1 may start with `payload` only), rebuilding the `SlabResult` via `calculateSlab`, building the plan with `buildRoomPlan`, and rendering `SheetSvg`. Page CSS: `@page { size: A4 landscape; margin: 0 }` and `html,body{margin:0}` via a `<style>` so Chromium prints exact mm.

- [ ] **Step 3: Manual verify** — `npm run dev`, open `/print/sheet?payload=<base64 of {rooms:[{name,inner_width,inner_length}]}>`, confirm a centred, dimensioned rectangle with beams + `SCALE 1:N`.
- [ ] **Step 4: Commit** — `Feat(cad-sheet) · /print/sheet page + SheetSvg renderer`.

---

### Task 4 — `POST /api/drawings/render`: Chromium → PDF (mirrors quote-card-shot.ts)

**Files:**
- Create: `src/app/api/drawings/render/route.ts`
- Create: `src/lib/cad/sheet/render-pdf.ts` (launch + `page.pdf`)
- Test: `tests/cad-sheet-render-route.test.ts`

- [ ] **Step 1: Implement `render-pdf.ts`** — copy the executable-resolution + launch pattern from `src/lib/agent/quote-card-shot.ts` (same `resolveExecutable()`, `PUPPETEER_EXECUTABLE_PATH`, `puppeteer-core` dynamic import), but navigate to the internal `/print/sheet` URL and call `page.pdf`:

```ts
export async function renderSheetPdf(printUrl: string): Promise<Buffer> {
  const { default: puppeteer } = await import("puppeteer-core");
  const executablePath = resolveExecutable(); // same helper as quote-card-shot.ts
  if (!executablePath) throw new Error("no Chromium/Chrome executable found (set PUPPETEER_EXECUTABLE_PATH)");
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    await page.goto(printUrl, { waitUntil: "networkidle0", timeout: 20000 });
    return Buffer.from(await page.pdf({ format: "A4", landscape: true, printBackground: true, preferCSSPageSize: true }));
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 2: Write the failing route test** — mock `renderSheetPdf` to return a tiny Buffer; assert the route returns `200`, `content-type: application/pdf`, non-empty body; and `400` on an empty `rooms` payload (reuse `validateRoomsForBlender` shape).

- [ ] **Step 3: Implement `route.ts`** — `withPermission` (match the existing drawings routes), validate rooms, build the absolute `/print/sheet?payload=…` URL from the request origin, call `renderSheetPdf`, return the PDF (`Content-Disposition: inline; filename="sheet.pdf"`). Do NOT touch `/api/drawings/request`.

- [ ] **Step 4: Run tests, expect PASS.** `npx tsc --noEmit` clean. Manual smoke: `curl -X POST /api/drawings/render` with a rooms payload → a valid PDF.
- [ ] **Step 5: Commit** — `Feat(cad-sheet) · server PDF render route (puppeteer-core)`.

---

### Task 5 — `Export SVG` button on RoomCanvas (cheap client win)

**Files:**
- Modify: `src/components/cad/RoomCanvas.tsx` (split `exportPng`)

- [ ] **Step 1: Refactor** — extract the SVG-string build inside `exportPng` (the `cloneNode` + white-bg `<rect>` + `XMLSerializer().serializeToString`) into `buildSheetSvgString()`. `exportPng` calls it then rasterizes (unchanged behaviour). Add `exportSvg()` that downloads the same string as `room-drawing.svg` (`Blob([xml], {type:'image/svg+xml'})`).
- [ ] **Step 2: Wire button** — add `Export SVG` beside `Export PNG` in the toolbar, `disabled={points.length < 2}`.
- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; manual: draw a room, Export SVG, open the file — native Cyrillic + vector.
- [ ] **Step 4: Commit** — `Feat(cad-sheet) · Export SVG (vector) from the editor`.

---

### Task 6 — Verify Phase 1 end-to-end + ruler test

- [ ] Full suite green: `cd precast-crm && npx vitest run` + `npx tsc --noEmit`.
- [ ] **Ruler test (manual, load-bearing):** render a 5.00 m × 3.00 m room to PDF, print at 100%, measure: the 5 m wall must read 100 mm at 1:50 (±0.5 mm). If off, the scale is lying — fix `mmPerCm`/`preferCSSPageSize` before claiming "SCALE 1:N".
- [ ] **Cyrillic check:** a room named `Хона 1` renders Cyrillic in the PDF (confirms the print Chromium has a Cyrillic font; if boxes, add a `@font-face`/font to the print page or note the Docker font dependency for deploy).
- [ ] Commit any fixes. Phase 1 done → next plan = Phase 2 (BoM + price block).
