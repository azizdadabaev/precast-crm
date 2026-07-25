# Gazoblok Wall Calculator Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-wall gazoblok estimator with a professional multi-wall calculator: a flat list of walls, each with its own catalog block size and structured door/window openings, producing block quantities grouped by size (one order line per size), an info-only glue estimate, and a wall breakdown saved with the order.

**Architecture:** A new pure function `estimateProject` in the existing `gazoblok-engine.ts` does all math (no DB). A self-contained `GazoblokWallCalculator` React component drives the builder UI and calls the engine live. The new-order page swaps its old estimator card for the component and sends a JSON breakdown snapshot at placement. The gazoblok order gains a nullable `wallEstimate Json?` column; the order-detail page renders it read-only.

**Tech Stack:** Next.js 14 App Router, Prisma + PostgreSQL, React Query v5, Tailwind + shadcn/ui, Zod, Vitest 2.x.

## Global Constraints

- **NO `git push`, NO deploy.** All commits local. Owner tests on localhost, then confirms before any deploy.
- Spec: `docs/superpowers/specs/2026-07-25-gazoblok-calculator-redesign-design.md` — binding.
- All user-facing strings bilingual via `useT()`: `t("Ўзбекча", "English")`. Server error strings `"Ўзбекча · English"`.
- No new float money math beyond existing patterns; reuse `round2`/`round3` from `@/services/calculation-engine`; integer block counts via the engine's epsilon-guarded `ceil` (`Math.ceil(x - 1e-9)`).
- Numbers: space thousands, decimal comma, mono `tabular-nums` (existing `formatNumber` in `@/lib/utils`).
- Colors only via existing `Chip`/theme tokens — never raw palette classes.
- Defaults (adjustable in an "advanced" panel): **joint = 2 mm**, **waste = 5%**, **glue coverage = 1.7 kg/m²**, **glue bag = 25 kg**.
- Test command: `npx vitest run <file>`. Full check: `npx vitest run` (baseline 1300 passed / 1 skipped) + `npm run build` must pass.
- No new dependencies. No new framework.
- Commit style: `Feat(gazoblok) · …` / `Fix(gazoblok) · …`.

## File Structure

- `src/services/gazoblok-engine.ts` — **modify**: add `estimateProject` + its exported types (`Opening`, `WallInput`, `ProjectEstimateOpts`, `PerSizeResult`, `GlueResult`, `EstimateWarning`, `ProjectEstimateResult`). Existing `estimateWall`/`blockVolumeM3`/`pricePerM3`/`orderTotal` stay untouched.
- `src/services/gazoblok-engine.test.ts` — **create** (or extend if present): unit tests for `estimateProject`.
- `prisma/schema.prisma` — **modify**: `GazoblokOrder` gains `wallEstimate Json?`.
- `src/lib/gazoblok-validation.ts` — **modify**: add `WallEstimateSnapshotSchema`; add optional `wallEstimate` to `PlaceGazoblokOrderSchema`.
- `src/app/api/gazoblok/orders/route.ts` — **modify**: persist `wallEstimate` on create.
- `src/components/gazoblok/GazoblokWallCalculator.tsx` — **create**: self-contained builder + openings + advanced + live results.
- `src/app/(app)/gazoblok/new/page.tsx` — **modify**: replace the "Девор калькулятори" card with the component; wire per-size add-to-order + snapshot at placement.
- `src/app/(app)/gazoblok/orders/[id]/page.tsx` — **modify**: read-only breakdown section.

---

### Task 1: Engine — `estimateProject` + types + unit tests (TDD)

**Files:**
- Modify: `src/services/gazoblok-engine.ts`
- Create/Modify: `src/services/gazoblok-engine.test.ts`

**Interfaces:**
- Consumes: `round2`, `round3`, `CalculationError` from `./calculation-engine`; existing `BlockProduct` (`{ lengthM, heightM, thicknessM, pricePerBlock }`) and `blockVolumeM3` in this file.
- Produces (all exported):
  ```ts
  export interface Opening { kind: "DOOR" | "WINDOW" | "OTHER"; widthM: number; heightM: number; qty: number; }
  export interface WallInput { id: string; name?: string; lengthM: number; heightM: number; productId: string; openings: Opening[]; }
  export interface ProjectEstimateOpts { jointMm?: number; wastePct?: number; glueKgPerM2?: number; glueBagKg?: number; }
  export interface PerSizeResult { productId: string; label: string; netAreaM2: number; blocksNeeded: number; volumeM3: number; price: number; }
  export interface GlueResult { netAreaM2: number; kg: number; bags: number; }
  export interface EstimateWarning { wallId: string; code: "OPENINGS_EXCEED_WALL" | "NO_BLOCK_SIZE"; message: string; }
  export interface ProjectEstimateResult { perSize: PerSizeResult[]; glue: GlueResult; totalBlocks: number; totalVolumeM3: number; totalPrice: number; warnings: EstimateWarning[]; }
  export function estimateProject(
    walls: WallInput[],
    products: Map<string, BlockProduct & { label: string }>,
    opts?: ProjectEstimateOpts,
  ): ProjectEstimateResult;
  ```

- [ ] **Step 1: Write the failing tests** in `src/services/gazoblok-engine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { estimateProject, GazoblokError, type WallInput, type BlockProduct } from "./gazoblok-engine";

// Helper: build the products map the engine expects.
function products(list: Array<{ id: string; label: string; l: number; h: number; t: number; price: number }>) {
  return new Map(list.map((p) => [p.id, { lengthM: p.l, heightM: p.h, thicknessM: p.t, pricePerBlock: p.price, label: p.label }]));
}
const wall = (w: Partial<WallInput> & { id: string; productId: string; lengthM: number; heightM: number }): WallInput => ({
  openings: [], ...w,
});

describe("estimateProject", () => {
  it("counts a single wall joint-aware, no openings, waste 0", () => {
    // block 0.6x0.2, joint 3mm -> blocksPerM2 = 1/(0.603*0.203)=8.1692
    // wall 5x2=10 m2 -> raw=81.69 -> ceil=82; vol=82*0.024=1.968; price=82*20000
    const r = estimateProject(
      [wall({ id: "w1", productId: "A", lengthM: 5, heightM: 2 })],
      products([{ id: "A", label: "600x200x200", l: 0.6, h: 0.2, t: 0.2, price: 20000 }]),
      { jointMm: 3, wastePct: 0 },
    );
    expect(r.perSize).toHaveLength(1);
    expect(r.perSize[0].blocksNeeded).toBe(82);
    expect(r.perSize[0].volumeM3).toBe(1.968);
    expect(r.perSize[0].price).toBe(1_640_000);
    expect(r.totalBlocks).toBe(82);
  });

  it("subtracts each opening (w*h*qty) from the wall", () => {
    // same wall, minus a door 0.9x2.1x1 = 1.89 -> net 8.11 -> raw=66.25 -> ceil 67
    const r = estimateProject(
      [wall({ id: "w1", productId: "A", lengthM: 5, heightM: 2, openings: [{ kind: "DOOR", widthM: 0.9, heightM: 2.1, qty: 1 }] })],
      products([{ id: "A", label: "A", l: 0.6, h: 0.2, t: 0.2, price: 20000 }]),
      { jointMm: 3, wastePct: 0 },
    );
    expect(r.perSize[0].blocksNeeded).toBe(67);
  });

  it("groups blocks by size — one perSize entry per distinct product", () => {
    const r = estimateProject(
      [
        wall({ id: "w1", productId: "A", lengthM: 5, heightM: 2 }),
        wall({ id: "w2", productId: "B", lengthM: 4, heightM: 2 }),
      ],
      products([
        { id: "A", label: "300mm", l: 0.6, h: 0.25, t: 0.3, price: 30000 },
        { id: "B", label: "100mm", l: 0.6, h: 0.25, t: 0.1, price: 12000 },
      ]),
      { jointMm: 2, wastePct: 5 },
    );
    expect(r.perSize).toHaveLength(2);
    expect(r.perSize.map((p) => p.productId).sort()).toEqual(["A", "B"]);
  });

  it("applies waste ONCE per size after aggregating walls (not per wall)", () => {
    // Two walls same product. Waste-once can differ from per-wall ceil.
    const p = products([{ id: "A", label: "A", l: 0.6, h: 0.2, t: 0.2, price: 1000 }]);
    const twoWalls = estimateProject(
      [wall({ id: "w1", productId: "A", lengthM: 3, heightM: 2 }), wall({ id: "w2", productId: "A", lengthM: 3, heightM: 2 })],
      p, { jointMm: 3, wastePct: 5 },
    );
    // raw per wall = 6*8.1692=49.015; sum=98.03; *1.05=102.93 -> ceil 103
    expect(twoWalls.perSize[0].blocksNeeded).toBe(103);
  });

  it("computes glue kg and 25kg bags from total net area", () => {
    // net 10 m2 -> kg = 10*1.7=17 -> bags ceil(17/25)=1
    const r = estimateProject(
      [wall({ id: "w1", productId: "A", lengthM: 5, heightM: 2 })],
      products([{ id: "A", label: "A", l: 0.6, h: 0.2, t: 0.2, price: 1000 }]),
      { jointMm: 3, wastePct: 0 },
    );
    expect(r.glue.kg).toBe(17);
    expect(r.glue.bags).toBe(1);
  });

  it("clamps net to 0 and warns when openings exceed the wall", () => {
    const r = estimateProject(
      [wall({ id: "w1", productId: "A", lengthM: 2, heightM: 2, openings: [{ kind: "WINDOW", widthM: 3, heightM: 3, qty: 1 }] })],
      products([{ id: "A", label: "A", l: 0.6, h: 0.2, t: 0.2, price: 1000 }]),
      { jointMm: 3, wastePct: 0 },
    );
    expect(r.warnings.some((w) => w.code === "OPENINGS_EXCEED_WALL")).toBe(true);
    expect(r.totalBlocks).toBe(0);
  });

  it("warns and skips a wall whose product is missing/unknown", () => {
    const r = estimateProject(
      [wall({ id: "w1", productId: "GHOST", lengthM: 5, heightM: 2 })],
      products([{ id: "A", label: "A", l: 0.6, h: 0.2, t: 0.2, price: 1000 }]),
    );
    expect(r.warnings.some((w) => w.code === "NO_BLOCK_SIZE")).toBe(true);
    expect(r.perSize).toHaveLength(0);
  });

  it("throws GazoblokError on non-positive wall dimensions", () => {
    expect(() =>
      estimateProject(
        [wall({ id: "w1", productId: "A", lengthM: 0, heightM: 2 })],
        products([{ id: "A", label: "A", l: 0.6, h: 0.2, t: 0.2, price: 1000 }]),
      ),
    ).toThrow(GazoblokError);
  });
});
```

- [ ] **Step 2: Run to verify failure**
Run: `npx vitest run src/services/gazoblok-engine.test.ts`
Expected: FAIL — `estimateProject is not a function` / type import errors.
**If instead vitest reports "No test files found"**, the `src/services/**` glob isn't in `vitest.config.ts` `test.include`. Add `"src/services/**/*.test.ts"` to that array (mirroring how `src/lib/*.test.ts` was added there), then re-run — it must now FAIL for the right reason (missing function), not "no files".

- [ ] **Step 3: Implement `estimateProject`** — append to `src/services/gazoblok-engine.ts` (after the existing `estimateWall` block, before the order-total section). Exact code:

```ts
// ── Multi-wall project estimator ────────────────────────────────

export interface Opening {
  kind: "DOOR" | "WINDOW" | "OTHER";
  widthM: number;
  heightM: number;
  qty: number;
}

export interface WallInput {
  id: string;
  name?: string;
  lengthM: number;
  heightM: number;
  productId: string;
  openings: Opening[];
}

export interface ProjectEstimateOpts {
  jointMm?: number;
  wastePct?: number;
  glueKgPerM2?: number;
  glueBagKg?: number;
}

export interface PerSizeResult {
  productId: string;
  label: string;
  netAreaM2: number;
  blocksNeeded: number;
  volumeM3: number;
  price: number;
}

export interface GlueResult {
  netAreaM2: number;
  kg: number;
  bags: number;
}

export interface EstimateWarning {
  wallId: string;
  code: "OPENINGS_EXCEED_WALL" | "NO_BLOCK_SIZE";
  message: string;
}

export interface ProjectEstimateResult {
  perSize: PerSizeResult[];
  glue: GlueResult;
  totalBlocks: number;
  totalVolumeM3: number;
  totalPrice: number;
  warnings: EstimateWarning[];
}

/** Defaults for the project estimator's advanced knobs. */
export const DEFAULT_JOINT_MM = 2;
export const DEFAULT_GLUE_KG_PER_M2 = 1.7;
export const DEFAULT_GLUE_BAG_KG = 25;

/** Blocks per m² of wall face, accounting for the thin-bed glue joint.
 *  = 1 / ((L + joint) × (H + joint)), all in meters. */
function blocksPerM2(p: BlockProduct, jointM: number): number {
  const denom = (p.lengthM + jointM) * (p.heightM + jointM);
  if (!Number.isFinite(denom) || denom <= 0) {
    throw new GazoblokError("block face + joint must be positive (check length/height)");
  }
  return 1 / denom;
}

/**
 * Estimate a whole project (list of walls, each with its own catalog block
 * and openings). Aggregates raw block counts per product, applies the waste
 * margin ONCE per size, then ceils to whole blocks. Glue is informational.
 *
 * A wall whose product is missing/unknown is skipped with a NO_BLOCK_SIZE
 * warning. Openings exceeding the wall clamp net area to 0 with a warning.
 * Non-positive wall/opening dimensions throw GazoblokError (callers pass only
 * geometrically-complete walls).
 */
export function estimateProject(
  walls: WallInput[],
  products: Map<string, BlockProduct & { label: string }>,
  opts: ProjectEstimateOpts = {},
): ProjectEstimateResult {
  const jointM = (opts.jointMm ?? DEFAULT_JOINT_MM) / 1000;
  const wastePct = opts.wastePct ?? DEFAULT_WASTE_PCT;
  const glueKgPerM2 = opts.glueKgPerM2 ?? DEFAULT_GLUE_KG_PER_M2;
  const glueBagKg = opts.glueBagKg ?? DEFAULT_GLUE_BAG_KG;
  if (!Number.isFinite(jointM) || jointM < 0) throw new GazoblokError("joint must be a non-negative number (mm)");
  if (!Number.isFinite(wastePct) || wastePct < 0) throw new GazoblokError("waste percent must be a non-negative number");

  const warnings: EstimateWarning[] = [];
  // productId -> accumulator
  const rawByProduct = new Map<string, number>();
  const netByProduct = new Map<string, number>();
  let glueNetArea = 0;

  for (const w of walls) {
    const product = w.productId ? products.get(w.productId) : undefined;
    if (!product) {
      warnings.push({ wallId: w.id, code: "NO_BLOCK_SIZE", message: "Блок ўлчами танланмаган · No block size selected" });
      continue;
    }
    if (!Number.isFinite(w.lengthM) || w.lengthM <= 0) throw new GazoblokError("wall length must be a positive number (meters)");
    if (!Number.isFinite(w.heightM) || w.heightM <= 0) throw new GazoblokError("wall height must be a positive number (meters)");

    let openingsArea = 0;
    for (const o of w.openings) {
      if (!Number.isFinite(o.widthM) || o.widthM <= 0 || !Number.isFinite(o.heightM) || o.heightM <= 0) {
        throw new GazoblokError("opening dimensions must be positive numbers (meters)");
      }
      if (!Number.isInteger(o.qty) || o.qty < 1) throw new GazoblokError("opening quantity must be an integer >= 1");
      openingsArea += o.widthM * o.heightM * o.qty;
    }

    const gross = w.lengthM * w.heightM;
    if (openingsArea > gross) {
      warnings.push({ wallId: w.id, code: "OPENINGS_EXCEED_WALL", message: "Очиқликлар девордан катта · Openings exceed the wall" });
    }
    const net = Math.max(0, gross - openingsArea);

    rawByProduct.set(w.productId, (rawByProduct.get(w.productId) ?? 0) + net * blocksPerM2(product, jointM));
    netByProduct.set(w.productId, (netByProduct.get(w.productId) ?? 0) + net);
    glueNetArea += net;
  }

  const perSize: PerSizeResult[] = [];
  for (const [productId, raw] of rawByProduct) {
    const product = products.get(productId)!;
    const blocksNeeded = Math.max(0, Math.ceil(raw * (1 + wastePct / 100) - 1e-9));
    perSize.push({
      productId,
      label: product.label,
      netAreaM2: round3(netByProduct.get(productId) ?? 0),
      blocksNeeded,
      volumeM3: round3(blocksNeeded * blockVolumeM3(product)),
      price: round2(blocksNeeded * product.pricePerBlock),
    });
  }
  // Exterior/thick (usually pricier) first.
  perSize.sort((a, b) => b.price - a.price);

  const kg = round2(glueNetArea * glueKgPerM2);
  const glue: GlueResult = { netAreaM2: round3(glueNetArea), kg, bags: Math.ceil(kg / glueBagKg) };

  return {
    perSize,
    glue,
    totalBlocks: perSize.reduce((s, p) => s + p.blocksNeeded, 0),
    totalVolumeM3: round3(perSize.reduce((s, p) => s + p.volumeM3, 0)),
    totalPrice: round2(perSize.reduce((s, p) => s + p.price, 0)),
    warnings,
  };
}
```

- [ ] **Step 4: Run to verify pass**
Run: `npx vitest run src/services/gazoblok-engine.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Full suite + build**
Run: `npx vitest run` (expect 1300 + 7 new = green) and `npm run build` (expect success).

- [ ] **Step 6: Commit**
```bash
git add src/services/gazoblok-engine.ts src/services/gazoblok-engine.test.ts
git commit -m "Feat(gazoblok) · estimateProject multi-wall calculator engine + tests"
```

---

### Task 2: Schema `wallEstimate` + Zod snapshot + persist at placement

**Files:**
- Modify: `prisma/schema.prisma` (`GazoblokOrder`)
- Modify: `src/lib/gazoblok-validation.ts`
- Modify: `src/app/api/gazoblok/orders/route.ts`

**Interfaces:**
- Consumes: `PlaceGazoblokOrderSchema` (existing), the order create in the POST route.
- Produces: an optional `wallEstimate` field on the placement payload; a stored `GazoblokOrder.wallEstimate` JSON column.

- [ ] **Step 1: Schema column.** In `prisma/schema.prisma`, inside `model GazoblokOrder` (near the other optional fields), add:

```prisma
  // Snapshot of the wall calculator that produced this order's block lines:
  // { walls, opts, result } from estimateProject. Informational record —
  // the order LINES remain the authoritative billed quantities. Nullable;
  // older orders and manual orders have none.
  wallEstimate Json?
```

- [ ] **Step 2: Push to local dev DB.**
Run: `npx prisma db push`
Expected: "in sync" / column added; client regenerated. (If EPERM on the query-engine DLL because a dev server holds it, that's harmless — the client `.d.ts` still regenerates; note in the report that PROD needs `npx prisma db push` at deploy.)

- [ ] **Step 3: Add the Zod snapshot schema** in `src/lib/gazoblok-validation.ts` (after the existing imports / near `PlaceGazoblokOrderSchema`):

```ts
const OpeningSnapshotSchema = z.object({
  kind: z.enum(["DOOR", "WINDOW", "OTHER"]),
  widthM: z.number().positive(),
  heightM: z.number().positive(),
  qty: z.number().int().min(1),
});
const WallSnapshotSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().optional(),
  lengthM: z.number().positive(),
  heightM: z.number().positive(),
  productId: z.string().min(1),
  openings: z.array(OpeningSnapshotSchema).max(30),
});
/** Loose validation of the calculator snapshot the client sends at placement.
 *  Stored as-is for the record; NOT recomputed server-side (lines are billed). */
export const WallEstimateSnapshotSchema = z.object({
  walls: z.array(WallSnapshotSchema).max(200),
  opts: z.object({
    jointMm: z.number().min(0).optional(),
    wastePct: z.number().min(0).optional(),
    glueKgPerM2: z.number().min(0).optional(),
    glueBagKg: z.number().min(0).optional(),
  }).optional(),
  result: z.unknown().optional(),
});
```

- [ ] **Step 4: Attach to the placement schema.** In `PlaceGazoblokOrderSchema` (same file), add one optional field before the closing `})`/`.refine(...)`:

```ts
  wallEstimate: WallEstimateSnapshotSchema.optional(),
```

(If `PlaceGazoblokOrderSchema` already ends with `.refine(...)`, add the field to the object literal that `.refine` wraps, not after it.)

- [ ] **Step 5: Persist on create.** In `src/app/api/gazoblok/orders/route.ts`, find the `prisma.gazoblokOrder.create({ data: { … } })` (inside the placement transaction). Add to that `data` object:

```ts
        wallEstimate: body.wallEstimate ?? undefined,
```

(`body` is the parsed `PlaceGazoblokOrderSchema` result. `undefined` leaves the column null when no snapshot is sent — manual orders are unaffected.)

- [ ] **Step 6: Verify.**
Run: `npx vitest run` (baseline holds) and `npm run build` (green). No new unit test — this is wiring; the engine math is covered in Task 1 and the UI flow is exercised in Task 14-style manual verification later.

- [ ] **Step 7: Commit**
```bash
git add prisma/schema.prisma src/lib/gazoblok-validation.ts src/app/api/gazoblok/orders/route.ts
git commit -m "Feat(gazoblok) · persist wall-estimate snapshot on order (prod needs db push at deploy)"
```

---

### Task 3: `GazoblokWallCalculator` component (self-contained)

**Files:**
- Create: `src/components/gazoblok/GazoblokWallCalculator.tsx`

**Interfaces:**
- Consumes: `estimateProject`, and the engine types `WallInput`, `Opening`, `ProjectEstimateOpts`, `ProjectEstimateResult`, `PerSizeResult` from `@/services/gazoblok-engine`; `formatNumber` from `@/lib/utils`; `useT` from `@/lib/i18n`; existing `Input`, `Button`, `Select`, `Chip` UI primitives.
- Produces (component contract, consumed by Task 4):
  ```ts
  export interface CalcProduct { id: string; label: string; lengthM: number; heightM: number; thicknessM: number; pricePerBlock: number; }
  export interface WallCalcSnapshot { walls: WallInput[]; opts: ProjectEstimateOpts; result: ProjectEstimateResult; }
  export interface GazoblokWallCalculatorProps {
    products: CalcProduct[];               // active catalog blocks
    onAddToOrder: (perSize: PerSizeResult[]) => void;  // parent maps to order lines
    onSnapshotChange: (snap: WallCalcSnapshot | null) => void; // null when empty/invalid
  }
  export function GazoblokWallCalculator(props: GazoblokWallCalculatorProps): JSX.Element;
  ```

- [ ] **Step 1: Component skeleton + wall state.** Create the file with the state model and the `+ Девор қўшиш` control. Walls are held as string-input rows (so half-typed values don't crash), converted to numbers for the estimate.

```tsx
"use client";
import { useMemo, useState, useEffect } from "react";
import { Trash2, Plus, Copy, ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatNumber } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  estimateProject,
  DEFAULT_JOINT_MM,
  DEFAULT_WASTE_PCT,
  DEFAULT_GLUE_KG_PER_M2,
  type WallInput,
  type Opening,
  type ProjectEstimateResult,
  type PerSizeResult,
  type ProjectEstimateOpts,
} from "@/services/gazoblok-engine";

export interface CalcProduct { id: string; label: string; lengthM: number; heightM: number; thicknessM: number; pricePerBlock: number; }
export interface WallCalcSnapshot { walls: WallInput[]; opts: ProjectEstimateOpts; result: ProjectEstimateResult; }
export interface GazoblokWallCalculatorProps {
  products: CalcProduct[];
  onAddToOrder: (perSize: PerSizeResult[]) => void;
  onSnapshotChange: (snap: WallCalcSnapshot | null) => void;
}

interface OpeningRow { kind: Opening["kind"]; widthM: string; heightM: string; qty: string; }
interface WallRow {
  id: string;
  name: string;
  lengthM: string;
  heightM: string;
  productId: string;
  openings: OpeningRow[];
  collapsed: boolean;
}

let _wid = 0;
const newWall = (): WallRow => ({ id: `w${++_wid}`, name: "", lengthM: "", heightM: "", productId: "", openings: [], collapsed: false });

// Standard opening presets (bilingual chip labels rendered via t()).
const DOOR_PRESET = { kind: "DOOR" as const, widthM: "0.9", heightM: "2.1", qty: "1" };
const WINDOW_PRESET = { kind: "WINDOW" as const, widthM: "1.5", heightM: "1.2", qty: "1" };
```

Then the component body holds `const [walls, setWalls] = useState<WallRow[]>([newWall()])` and advanced knobs `const [jointMm, setJointMm] = useState(String(DEFAULT_JOINT_MM))`, `const [wastePct, setWastePct] = useState(String(DEFAULT_WASTE_PCT))`, `const [glueKg, setGlueKg] = useState(String(DEFAULT_GLUE_KG_PER_M2))`, `const [advOpen, setAdvOpen] = useState(false)`.

- [ ] **Step 2: Live estimate memo.** Convert ready walls (positive length & height) into `WallInput[]`, build the products `Map`, call `estimateProject`, and push the snapshot up. Incomplete-geometry walls are excluded from the estimate.

```tsx
const productMap = useMemo(
  () => new Map(props.products.map((p) => [p.id, { lengthM: p.lengthM, heightM: p.heightM, thicknessM: p.thicknessM, pricePerBlock: p.pricePerBlock, label: p.label }])),
  [props.products],
);
const opts: ProjectEstimateOpts = {
  jointMm: jointMm.trim() === "" ? undefined : Number(jointMm),
  wastePct: wastePct.trim() === "" ? undefined : Number(wastePct),
  glueKgPerM2: glueKg.trim() === "" ? undefined : Number(glueKg),
};
const readyWalls: WallInput[] = useMemo(() => walls
  .filter((w) => Number(w.lengthM) > 0 && Number(w.heightM) > 0)
  .map((w) => ({
    id: w.id,
    name: w.name.trim() || undefined,
    lengthM: Number(w.lengthM),
    heightM: Number(w.heightM),
    productId: w.productId,
    openings: w.openings
      .filter((o) => Number(o.widthM) > 0 && Number(o.heightM) > 0 && Number(o.qty) >= 1)
      .map((o) => ({ kind: o.kind, widthM: Number(o.widthM), heightM: Number(o.heightM), qty: Math.floor(Number(o.qty)) })),
  })),
  [walls]);

const result = useMemo<ProjectEstimateResult | null>(() => {
  if (readyWalls.length === 0) return null;
  try { return estimateProject(readyWalls, productMap, opts); }
  catch { return null; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [readyWalls, productMap, jointMm, wastePct, glueKg]);

useEffect(() => {
  props.onSnapshotChange(result ? { walls: readyWalls, opts, result } : null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [result]);
```

- [ ] **Step 3: Wall builder UI.** Render each wall row: header (name, `length × height` summary, block-size chip, collapse toggle, duplicate, delete) and, when expanded, the fields grid (length, height, block-size `<select>` from `props.products`) and the openings sub-list with preset chips. Use the same field styling as the current page (label + `Input`). Mutators:

```tsx
const setWall = (id: string, patch: Partial<WallRow>) => setWalls((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w)));
const addWall = () => setWalls((ws) => [...ws, newWall()]);
const dupWall = (id: string) => setWalls((ws) => { const w = ws.find((x) => x.id === id); return w ? [...ws, { ...w, id: `w${++_wid}` }] : ws; });
const delWall = (id: string) => setWalls((ws) => (ws.length > 1 ? ws.filter((w) => w.id !== id) : ws));
const addOpening = (id: string, preset: OpeningRow) => setWall(id, { openings: [...(walls.find((w) => w.id === id)?.openings ?? []), { ...preset }] });
const setOpening = (id: string, idx: number, patch: Partial<OpeningRow>) =>
  setWall(id, { openings: (walls.find((w) => w.id === id)?.openings ?? []).map((o, i) => (i === idx ? { ...o, ...patch } : o)) });
const delOpening = (id: string, idx: number) =>
  setWall(id, { openings: (walls.find((w) => w.id === id)?.openings ?? []).filter((_, i) => i !== idx) });
```

The block-size `<select>` renders `props.products.map((p) => <option value={p.id}>{p.label}</option>)` with a leading empty `<option value="">{t("Блок ўлчами танланг…", "Select block size…")}</option>`. Opening preset chips: `t("+ Эшик 0,9×2,1", "+ Door 0.9×2.1")`, `t("+ Дераза 1,5×1,2", "+ Window 1.5×1.2")`, `t("+ Бошқа", "+ Custom")` (custom adds an `OTHER` row with blank dims). Each opening row: kind label + width/height/qty `Input`s + a `Trash2` delete with `aria-label={t("Ўчириш","Delete")}`.

- [ ] **Step 4: Advanced panel + results + warnings.** A collapsible "Қўшимча · Advanced" with joint (mm), waste (%), glue coverage (kg/m²) `Input`s. A sticky results card rendering, when `result`:
  - per-size rows: `formatNumber(p.blocksNeeded)` та · `formatNumber(p.volumeM3,3)` м³ · `formatNumber(p.price)` UZS, with `p.label`.
  - glue note in a `warning`-toned box: `t("Ёпиштиргич","Glue")`: `~{formatNumber(result.glue.kg)} кг · {result.glue.bags} {t("қоп","bags")}` + `t("Тахминий · нархсиз","Estimate · not priced")`.
  - grand total (`totalBlocks`, `totalVolumeM3`, `totalPrice`).
  - each `result.warnings` as an inline `Chip variant="warning"` line with its bilingual `message`.
  - a `Button` `t("Буюртмага қўшиш","Add to order")` calling `props.onAddToOrder(result.perSize)`, disabled when `result.totalBlocks <= 0`.

Use only theme tokens / `Chip` variants (no raw palette). Touch targets ≥44px on the add/remove controls (`h-11 md:h-9`).

- [ ] **Step 5: Build check.**
Run: `npm run build`
Expected: compiles; component not yet imported anywhere (that's Task 4). If the build tree-shakes unused files it still typechecks via `npx tsc --noEmit` — run that too and expect exit 0.

- [ ] **Step 6: Commit**
```bash
git add src/components/gazoblok/GazoblokWallCalculator.tsx
git commit -m "Feat(gazoblok) · GazoblokWallCalculator multi-wall builder component"
```

---

### Task 4: Wire the calculator into the new-order page

**Files:**
- Modify: `src/app/(app)/gazoblok/new/page.tsx`

**Interfaces:**
- Consumes: `GazoblokWallCalculator`, `CalcProduct`, `WallCalcSnapshot` from `@/components/gazoblok/GazoblokWallCalculator`; `PerSizeResult` from `@/services/gazoblok-engine`.
- Produces: order lines (one per block size) + a `wallEstimate` field in the placement payload.

- [ ] **Step 1: Replace the estimator card.** Remove the old "Девор калькулятори" card markup (the block around line 533 that uses `estProduct`/`estimate`/`addEstimateToOrder`) and the now-unused single-wall estimator state (`estProductId`, `estLength`, `estHeight`, `estOpenings`, `estWaste`, `estAdded`, `estAddedTimer`, `estProduct`, the `estimate` memo, `addEstimateToOrder`, and the `estimateWall` import). Insert the component in its place:

```tsx
<GazoblokWallCalculator
  products={activeProducts.map((p) => ({
    id: p.id, label: p.label,
    lengthM: Number(p.lengthM), heightM: Number(p.heightM), thicknessM: Number(p.thicknessM),
    pricePerBlock: Number(p.pricePerBlock),
  }))}
  onAddToOrder={addPerSizeToOrder}
  onSnapshotChange={setWallSnapshot}
/>
```

- [ ] **Step 2: Per-size add-to-order + snapshot state.** Add near the other line helpers:

```tsx
const [wallSnapshot, setWallSnapshot] = useState<WallCalcSnapshot | null>(null);

function addPerSizeToOrder(perSize: PerSizeResult[]) {
  setLines((prev) => {
    const next = [...prev];
    for (const s of perSize) {
      if (s.blocksNeeded <= 0) continue;
      const p = activeProducts.find((x) => x.id === s.productId);
      if (!p) continue;
      const i = next.findIndex((l) => l.productId === s.productId);
      if (i >= 0) next[i] = { ...next[i], quantity: next[i].quantity + s.blocksNeeded };
      else next.push({ productId: s.productId, productLabel: p.label, unitPrice: Number(p.pricePerBlock), quantity: s.blocksNeeded });
    }
    return next;
  });
  linesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
```

(Reuses the existing `lines` shape `{ productId, productLabel, unitPrice, quantity }` and `linesSectionRef`.)

- [ ] **Step 3: Send snapshot at placement.** In the `placeOrder` mutation's `json` object, add one field:

```tsx
          wallEstimate: wallSnapshot ?? undefined,
```

- [ ] **Step 4: Build + typecheck.**
Run: `npm run build` and `npx tsc --noEmit`
Expected: green; no references to the removed `estimateWall`/`est*` symbols remain (grep to confirm: `grep -n "estimateWall\|addEstimateToOrder\|estProduct" src/app/(app)/gazoblok/new/page.tsx` returns nothing).

- [ ] **Step 5: Commit**
```bash
git add "src/app/(app)/gazoblok/new/page.tsx"
git commit -m "Feat(gazoblok) · use multi-wall calculator on new-order page; per-size lines + snapshot"
```

---

### Task 5: Read-only wall breakdown on order detail

**Files:**
- Modify: `src/app/(app)/gazoblok/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `order.wallEstimate` (JSON, present on the order returned by `GET /api/gazoblok/orders/[id]` once the column exists — the route returns the full record via `findUnique`, so no API change needed); `formatNumber`; engine types for reading (`WallCalcSnapshot` shape).

- [ ] **Step 1: Render the breakdown section.** In the order-detail page, after the order lines / near the activity log, add a "Ҳисоб-китоб · Estimate" section shown only when `order.wallEstimate` is present. Read it defensively (it's stored JSON):

```tsx
{order.wallEstimate && (() => {
  const snap = order.wallEstimate as unknown as {
    walls?: Array<{ name?: string; lengthM: number; heightM: number; productId: string; openings?: Array<{ kind: string; widthM: number; heightM: number; qty: number }> }>;
    result?: { perSize?: Array<{ label: string; blocksNeeded: number; volumeM3: number }>; glue?: { kg: number; bags: number } };
  };
  const walls = snap.walls ?? [];
  return (
    <section className="rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold mb-3">{t("Ҳисоб-китоб", "Estimate")}</h3>
      <div className="space-y-1 text-sm">
        {walls.map((w, i) => (
          <div key={i} className="flex justify-between font-mono tabular-nums">
            <span>{w.name || `${t("Девор","Wall")} ${i + 1}`} — {formatNumber(w.lengthM)}×{formatNumber(w.heightM)} м</span>
            <span className="text-muted-foreground">
              {(w.openings ?? []).reduce((s, o) => s + o.qty, 0)} {t("очиқлик","openings")}
            </span>
          </div>
        ))}
      </div>
      {snap.result?.glue && (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("Ёпиштиргич","Glue")}: ~{formatNumber(snap.result.glue.kg)} кг · {snap.result.glue.bags} {t("қоп","bags")}
        </p>
      )}
    </section>
  );
})()}
```

Match the page's existing section styling (border/rounded/padding) rather than the exact classes above if they differ — read the neighbouring sections first and mirror them.

- [ ] **Step 2: Build + typecheck.**
Run: `npm run build` and `npx tsc --noEmit` — green.

- [ ] **Step 3: Commit**
```bash
git add "src/app/(app)/gazoblok/orders/[id]/page.tsx"
git commit -m "Feat(gazoblok) · read-only wall breakdown on order detail"
```

---

### Task 6: Full verification (localhost, no deploy)

**Files:** none (verification only)

- [ ] **Step 1:** `npx vitest run` — entire suite green (1307 = 1300 + 7 engine tests, 1 skipped). `npx tsc --noEmit` — exit 0. `npm run build` — exit 0.

- [ ] **Step 2:** Restart the dev server (so the regenerated Prisma client with `wallEstimate` loads) and walk this checklist in both light and dark:
  1. New-order page: the old single "Devor kalkulyatori" card is gone; the multi-wall builder is in its place. Add two walls — one 300 mm exterior with a door + two windows, one 100 mm partition with a door.
  2. Live results show **two per-size rows** (grouped by block size) with correct-looking block counts, m³, price; the glue note shows kg + bags with no price.
  3. Enter an opening larger than its wall → a bilingual "openings exceed the wall" warning appears and that wall contributes 0.
  4. Leave a wall's block size unselected → "no block size" warning; it's excluded from totals.
  5. "Буюртмага қўшиш" adds **one order line per size**, merged into existing lines; the total matches.
  6. Place the order → order detail shows the read-only "Ҳисоб-китоб" section listing the walls + glue.
  7. Adjust the "Advanced" joint/waste/coverage → results update live.

- [ ] **Step 3:** Report results with any deviations. **STOP — do not push, do not deploy.** Await explicit owner confirmation. Note in the report that **prod needs `npx prisma db push`** at deploy for the `wallEstimate` column.
