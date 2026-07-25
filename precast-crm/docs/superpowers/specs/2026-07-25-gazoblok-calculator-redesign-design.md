# Gazoblok Wall Calculator — Professional Redesign

**Date:** 2026-07-25
**Status:** Approved for planning
**Supersedes:** the single-wall "Девор калькулятори" estimator on the new-order page (`estimateWall` usage in the UI).

---

## 1. Goal

Replace the current single-wall gazoblok estimator — which takes one wall and a raw "openings (m²)" number the operator must hand-compute — with a professional multi-wall project calculator that models a real building: a list of walls, each with its own block size and its own doors/windows, producing block quantities grouped by size (one order line per size) plus an informational glue estimate.

## 2. Why the current one is inadequate

`estimateWall()` in [gazoblok-engine.ts](../../../src/services/gazoblok-engine.ts):
1. **Openings are a single raw m² field** — nobody knows their openings in m²; they know "one door 0.9×2.1, two windows 1.5×1.2".
2. **One wall at a time** — a room/house has many walls of different sizes; the operator runs it repeatedly and adds up by hand.
3. **Ignores the mortar/glue joint** — uses block face `L×H` directly (≈8.33 blocks/m² for 600×200) instead of the joint-aware industry figure (≈8.2), slightly overcounting.

## 3. Research basis (industry methodology)

Consistent across Ytong-style calculators and AAC references:
- **Blocks per m² = 1 000 000 ÷ ((L + joint) × (H + joint))** (mm). 600×200 block + 3 mm joint → 8.2 blocks/m².
- **Net wall area = wall area − Σ(each door/window W×H)**; openings entered individually.
- AAC uses **thin-bed adhesive (2–3 mm joints)**, not thick cement mortar; **1.5–2 kg/m²**, sold in 25 kg bags.
- **Wastage 3–5%** (5% with many openings/corners).

Sources: kalk.pro AAC calculator, ToolSri AAC room/per-sqm calculators, bricknbolt & estateorbits AAC quantity guides.

## 4. Confirmed decisions (owner, 2026-07-25)

1. **Comprehensive/professional mode.**
2. **Flat wall list** — `+ Девор қўшиш` only. **No room helper** (each wall independent → irregular geometry, L-shapes, single walls all handled with zero special cases).
3. **Per-wall block size** from the catalog → estimate **groups blocks by size** → **one order line per size**.
4. **Glue is informational only** — total kg + 25 kg bags shown; **no price, no order line** (glue is not sold).
5. **Joint-aware** block-per-m² math.
6. **Save the wall breakdown with the order** as a JSON snapshot (nullable column).

## 5. Data model

### 5.1 Estimate shape (pure TypeScript, no DB)

```ts
// A single opening on a wall.
interface Opening {
  kind: "DOOR" | "WINDOW" | "OTHER";
  widthM: number;   // > 0
  heightM: number;  // > 0
  qty: number;      // integer >= 1
}

// One wall in the project.
interface WallInput {
  id: string;          // client-generated (stable key for the UI)
  name?: string;       // optional label, e.g. "Девор 1 — ташқи"
  lengthM: number;     // > 0
  heightM: number;     // > 0
  productId: string;   // chosen catalog block; its thicknessM = wall thickness
  openings: Opening[];
}

// Advanced knobs (defaults applied when omitted).
interface ProjectEstimateOpts {
  jointMm?: number;        // default 2  (thin-bed glue joint)
  wastePct?: number;       // default 5
  glueKgPerM2?: number;    // default 1.7
  glueBagKg?: number;      // default 25
}
```

### 5.2 Result shape

```ts
interface PerSizeResult {
  productId: string;
  label: string;           // catalog label, e.g. "600×250×300"
  netAreaM2: number;       // summed net area of walls using this size
  blocksNeeded: number;    // integer, waste applied then ceil, per size
  volumeM3: number;        // blocksNeeded × block volume
  price: number;           // blocksNeeded × pricePerBlock
}

interface GlueResult {
  netAreaM2: number;       // total net area across ALL walls
  kg: number;              // netArea × glueKgPerM2, round2
  bags: number;            // ceil(kg / glueBagKg)
}

interface ProjectEstimateResult {
  perSize: PerSizeResult[];      // one entry per distinct block size, price-desc
  glue: GlueResult;
  totalBlocks: number;
  totalVolumeM3: number;
  totalPrice: number;
  warnings: EstimateWarning[];   // see §7
}

interface EstimateWarning {
  wallId: string;
  code: "OPENINGS_EXCEED_WALL" | "NO_BLOCK_SIZE";
  message: string;               // bilingual "Ўзбекча · English"
}
```

### 5.3 Persistence

Add a nullable JSON column to `GazoblokOrder`:

```prisma
wallEstimate Json?  // snapshot: { walls: WallInput[], opts: ProjectEstimateOpts, result: ProjectEstimateResult } at placement time
```

- Written **once, at order placement**, from the calculator state.
- Shown **read-only** on the order detail page (a "Ҳисоб-китоб" section listing walls, openings, and the per-size result).
- **Editing a placed order's geometry to regenerate lines is OUT OF SCOPE for v1** — it would have to reconcile stock and payment state. The calculator is fully editable *before* placement; after placement the snapshot is a read-only record. (Stated explicitly so the plan does not build an order-mutation path.)
- Requires `npx prisma db push` at deploy (mirrors the Task 12 void columns).

## 6. Calculation (engine)

New pure function in `gazoblok-engine.ts`, reusing `round2`/`round3`/`GazoblokError`:

```ts
function estimateProject(
  walls: WallInput[],
  products: Map<string, BlockProduct & { label: string }>,
  opts?: ProjectEstimateOpts,
): ProjectEstimateResult
```

Algorithm:
1. For each wall: if `productId` is missing/unknown, push a `NO_BLOCK_SIZE` warning and **skip the wall entirely** (it contributes to neither block totals nor glue — it can't be placed without a block). Otherwise compute `gross = lengthM × heightM`; `openingsArea = Σ(w × h × qty)`; `net = max(0, gross − openingsArea)`. If `openingsArea > gross`, push an `OPENINGS_EXCEED_WALL` warning and use `net = 0`.
2. `blocksPerM2(block) = 1 / ((block.lengthM + joint) × (block.heightM + joint))`, joint in meters (`jointMm/1000`).
3. Accumulate **raw** (fractional) blocks per `productId`: `rawBlocks[productId] += net × blocksPerM2`. Accumulate `netAreaBySize[productId] += net` and `glueNetArea += net`.
4. Per size: `blocksNeeded = ceil(rawBlocks × (1 + wastePct/100) − 1e-9)`; `volumeM3 = round3(blocksNeeded × blockVolumeM3)`; `price = round2(blocksNeeded × pricePerBlock)`.
5. Glue: `kg = round2(glueNetArea × glueKgPerM2)`; `bags = ceil(kg / glueBagKg)`.
6. Totals summed from `perSize`. `perSize` sorted by price descending (exterior/thick first).

**Waste is applied once per size after aggregation** (not per wall) to avoid compounding rounding. Money uses the existing round conventions; block counts are integers via the epsilon-guarded ceil already used in the engine.

The existing `estimateWall`, `blockVolumeM3`, `pricePerM3`, `orderTotal` stay unchanged (still used elsewhere / for a single-wall path if needed). `estimateProject` is additive.

## 7. UI (new-order page)

Replaces the "Девор калькулятори" card in [new/page.tsx](../../../src/app/(app)/gazoblok/new/page.tsx).

**Layout:** two panes.
- **Left — wall builder:** `+ Девор қўшиш` adds a wall row. Each wall: name (optional), length, height, block-size `<Select>` (active catalog products), and an openings sub-list. Openings: quick-add chips for standard sizes (door 0.9×2.1, window 1.5×1.2) + a "Бошқа…" custom (w, h, qty). Each wall can be duplicated / removed. Collapsed walls show a one-line summary (`6,0 × 2,8 м · 300 мм · 2 очиқлик`).
- **Right — live results (sticky):** per-size rows (blocks, m³, price), the glue note (kg · bags, "нархсиз"), grand total, and `Буюртмага қўшиш` which adds **one line per size** (merged into existing order lines by `productId`, reusing the current merge logic).
- **Advanced (collapsible):** joint (mm), waste (%), glue coverage (kg/m²) — pre-filled with defaults, rarely touched.

**i18n:** all strings bilingual via `useT()` `t("Ўзбекча", "English")`. Numbers space-thousands, decimal comma, `tabular-nums` (existing `formatNumber`).

**Reuse:** the block-size Select and catalog fetch already exist on the page (Task 11 added catalog loading/error/empty states — reuse them). Recompute the estimate live with `useMemo` over the wall list.

## 8. Order integration

- `Буюртмага қўшиш` maps `perSize[]` → order lines (`productId`, `quantity = blocksNeeded`, `unitPrice = pricePerBlock`), merged by product like the current `addEstimateToOrder`.
- At placement, the calculator's `{ walls, opts, result }` is saved to `GazoblokOrder.wallEstimate`.
- Glue is never added as a line.

## 9. Testing

Unit tests for `estimateProject` (money/quantity math — mandatory):
- openings subtracted per wall; multiple openings × qty.
- joint-aware blocks/m² (600×200 + 3 mm ≈ 8.2/m²).
- aggregation across walls sharing a size; waste applied once then ceil.
- two sizes → two `perSize` entries, correct grouping and totals.
- glue kg + bags (ceil).
- edge: openings > wall → net 0 + `OPENINGS_EXCEED_WALL`; missing productId → `NO_BLOCK_SIZE`, excluded; zero/negative dims → `GazoblokError`.
- float-safe ceil (no phantom extra block at exact boundaries).

## 10. Out of scope (v1)

- Editing a **placed** order's geometry to regenerate lines (snapshot is read-only after placement).
- Gables/pediments (roof triangles), lintels/U-blocks, reinforcement mesh — not part of this business's quoting.
- Glue pricing / glue as a stocked SKU (not sold).
- Global config for joint/waste/coverage (per-estimate advanced inputs with constants suffice).
- Standalone calculator page (lives on the new-order flow).

## 11. Deploy note

`GazoblokOrder.wallEstimate` is a new column → **prod needs `npx prisma db push` at deploy** (same as the Task 12 void columns). No data migration; column is nullable.
