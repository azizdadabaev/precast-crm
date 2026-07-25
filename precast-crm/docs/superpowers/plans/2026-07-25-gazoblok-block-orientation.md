# Gazoblok Block Orientation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let each wall choose how its block is laid — swapping the block's stored height and thickness — so a 200×300×600 block can be a 20 cm wall (30 cm course, face 600×300, 5.5 blocks/m²) or a 30 cm wall (20 cm course, face 600×200, 8.2 blocks/m²), removing the silent orientation ambiguity in the calculator.

**Architecture:** `estimateProject` (from the calculator work, commit ed1aef3) gains an `orientation` on each `WallInput` that swaps which of the block's two non-length dimensions is the vertical course height. The `GazoblokWallCalculator` component adds a per-wall orientation control that only appears for asymmetric blocks (height ≠ thickness), labeled by resulting wall/course cm; the Zod snapshot schema and saved order breakdown carry the orientation.

**Tech Stack:** Next.js 14, React, Prisma, Zod, Vitest 2.x.

## Global Constraints

- **NO `git push`, NO deploy.** Local commits only; owner tests on localhost.
- Builds on the calculator: `src/services/gazoblok-engine.ts` (`estimateProject`), `src/components/gazoblok/GazoblokWallCalculator.tsx`, `src/lib/gazoblok-validation.ts` (`WallSnapshotSchema`).
- Orientation swaps `heightM` ↔ `thicknessM`; length (600) always horizontal. Default `"STANDARD"` = current behavior (face = length × height, wall = thickness). `"ROTATED"` = face length × thickness, wall = height.
- Block **volume and price per block are orientation-independent** — only the block COUNT changes. Grouping stays one order line per productId.
- Toggle appears only when `heightM !== thicknessM`.
- Bilingual `t("Ўзбекча","English")`; numbers via `formatNumber`; colors via theme tokens/Chip only.
- No new deps. Test: `npx vitest run <file>`; full `npx vitest run` (baseline 1308 passed / 1 skipped) + `npm run build`.
- Commit style `Feat(gazoblok) · …`.

---

### Task 1: Engine — orientation-aware face (TDD)

**Files:**
- Modify: `src/services/gazoblok-engine.ts`
- Modify: `src/services/gazoblok-engine.test.ts`

**Interfaces:**
- Modifies exported `WallInput` to add `orientation?: "STANDARD" | "ROTATED"` (optional; absent ⇒ STANDARD).
- `estimateProject` signature unchanged; behavior: a wall's effective face height = `orientation === "ROTATED" ? product.thicknessM : product.heightM`; face length stays `product.lengthM`. Everything else (net area, per-product aggregation, waste-once, volume via `blockVolumeM3`, glue) unchanged. `blockVolumeM3` is orientation-independent.

- [ ] **Step 1: Write failing tests** — append to `src/services/gazoblok-engine.test.ts`:

```ts
describe("estimateProject — block orientation", () => {
  // 20sm block: 0.6 x 0.3 x 0.2. STANDARD face 600x300 (5.50/m2); ROTATED face 600x200 (8.22/m2).
  const p20 = () => new Map([["A", { lengthM: 0.6, heightM: 0.3, thicknessM: 0.2, pricePerBlock: 1000, label: "20sm" }]]);
  const w = (orientation?: "STANDARD" | "ROTATED") => [{
    id: "w1", productId: "A", lengthM: 10, heightM: 1, openings: [], ...(orientation ? { orientation } : {}),
  }];

  it("defaults to STANDARD when orientation is absent (face length×height)", () => {
    const r = estimateProject(w(), p20(), { jointMm: 2, wastePct: 0 });
    // 10 m2 * 5.5005 = 55.005 -> ceil 56
    expect(r.perSize[0].blocksNeeded).toBe(56);
  });

  it("STANDARD and ROTATED give different block counts for the same wall & block", () => {
    const std = estimateProject(w("STANDARD"), p20(), { jointMm: 2, wastePct: 0 });
    const rot = estimateProject(w("ROTATED"), p20(), { jointMm: 2, wastePct: 0 });
    expect(std.perSize[0].blocksNeeded).toBe(56);   // face 600x300
    expect(rot.perSize[0].blocksNeeded).toBe(83);   // face 600x200: 10*8.2234=82.234 -> 83
    expect(rot.perSize[0].blocksNeeded).toBeGreaterThan(std.perSize[0].blocksNeeded);
  });

  it("volume per block is identical across orientations (same physical block)", () => {
    const std = estimateProject(w("STANDARD"), p20(), { jointMm: 2, wastePct: 0 });
    const rot = estimateProject(w("ROTATED"), p20(), { jointMm: 2, wastePct: 0 });
    const volPerBlockStd = std.perSize[0].volumeM3 / std.perSize[0].blocksNeeded;
    const volPerBlockRot = rot.perSize[0].volumeM3 / rot.perSize[0].blocksNeeded;
    expect(volPerBlockStd).toBeCloseTo(0.036, 3);
    expect(volPerBlockRot).toBeCloseTo(0.036, 3);
  });
});
```

- [ ] **Step 2: Run to verify failure**
Run: `npx vitest run src/services/gazoblok-engine.test.ts`
Expected: FAIL — ROTATED currently equals STANDARD (orientation ignored), so the ROTATED=83 assertion fails.

- [ ] **Step 3: Implement.** In `src/services/gazoblok-engine.ts`:

(a) Add the field to `WallInput`:
```ts
export interface WallInput {
  id: string;
  name?: string;
  lengthM: number;
  heightM: number;
  productId: string;
  openings: Opening[];
  orientation?: "STANDARD" | "ROTATED";
}
```

(b) Replace the existing `blocksPerM2(product, jointM)` helper call inside the wall loop with an orientation-aware face. Change the helper to take explicit face dims:
```ts
/** Blocks per m² of wall face for an explicit face (length × height), joint-aware. */
function facePerM2(faceLM: number, faceHM: number, jointM: number): number {
  const denom = (faceLM + jointM) * (faceHM + jointM);
  if (!Number.isFinite(denom) || denom <= 0) {
    throw new GazoblokError("block face + joint must be positive (check length/height)");
  }
  return 1 / denom;
}
```
Delete the old `blocksPerM2(p, jointM)` helper (it read `p.lengthM`/`p.heightM`). In the wall loop, after validating dims, compute:
```ts
    const faceHM = w.orientation === "ROTATED" ? product.thicknessM : product.heightM;
    const perM2 = facePerM2(product.lengthM, faceHM, jointM);
    rawByProduct.set(w.productId, (rawByProduct.get(w.productId) ?? 0) + net * perM2);
```
Leave `netByProduct`, `glueNetArea`, the per-size waste/ceil, `blockVolumeM3(product)` for volume, and glue exactly as they are.

- [ ] **Step 4: Run to verify pass**
Run: `npx vitest run src/services/gazoblok-engine.test.ts`
Expected: PASS (all prior + 3 new).

- [ ] **Step 5: Full suite + build**
Run: `npx vitest run` (1308 + 3 = green) and `npm run build` (exit 0).

- [ ] **Step 6: Commit**
```bash
git add src/services/gazoblok-engine.ts src/services/gazoblok-engine.test.ts
git commit -m "Feat(gazoblok) · orientation-aware block face in estimateProject"
```

---

### Task 2: UI + schema — per-wall orientation control

**Files:**
- Modify: `src/lib/gazoblok-validation.ts` (`WallSnapshotSchema`)
- Modify: `src/components/gazoblok/GazoblokWallCalculator.tsx`
- Modify: `src/app/(app)/gazoblok/orders/[id]/page.tsx` (show orientation in breakdown — small)

**Interfaces:**
- Consumes: engine `WallInput.orientation` from Task 1.
- Produces: each emitted snapshot wall carries `orientation`; the component passes it into `estimateProject`.

- [ ] **Step 1: Zod.** In `src/lib/gazoblok-validation.ts`, add to `WallSnapshotSchema` (the object with id/name/lengthM/heightM/productId/openings):
```ts
  orientation: z.enum(["STANDARD", "ROTATED"]).optional(),
```

- [ ] **Step 2: Component state.** In `GazoblokWallCalculator.tsx`, add `orientation` to the `WallRow` interface (`orientation: "STANDARD" | "ROTATED"`) and to `newWall()` (default `"STANDARD"`). Thread it through `dupWall` (it copies `...w`, so it carries automatically).

- [ ] **Step 3: Orientation helper + control.** Add a helper that, given the selected product, decides if a toggle is needed and computes the two option labels (dimensions in cm, from meters × 100):
```ts
function orientationOptions(p: CalcProduct | undefined) {
  if (!p) return null;
  const hCm = Math.round(p.heightM * 100);
  const tCm = Math.round(p.thicknessM * 100);
  if (hCm === tCm) return null; // symmetric — no choice
  return {
    STANDARD: { wallCm: tCm, courseCm: hCm }, // face = length × height, wall = thickness
    ROTATED: { wallCm: hCm, courseCm: tCm },  // face = length × thickness, wall = height
  };
}
```
In each expanded wall, after the block-size select, when `orientationOptions(selectedProduct)` is non-null render two selectable options (buttons or a segmented control, matching the file's existing control styling) labeled:
`t("Девор {w}см · қатор {c}см".replace…, "Wall {w}cm · course {c}cm")` — build the bilingual string with the numbers, e.g.:
```tsx
const label = (o: { wallCm: number; courseCm: number }) =>
  t(`Девор ${o.wallCm}см · қатор ${o.courseCm}см`, `Wall ${o.wallCm}cm · course ${o.courseCm}cm`);
```
Clicking sets `setWall(w.id, { orientation: "STANDARD" | "ROTATED" })`. Highlight the active one via a `Chip`/token style (no raw palette). Touch target ≥44px.

- [ ] **Step 4: Thread orientation into the estimate + snapshot.** In the `readyWalls` memo, include `orientation: w.orientation` on each mapped `WallInput`. (The snapshot already emits `readyWalls.filter(productId!=="")`, so it carries orientation too.)

- [ ] **Step 5: Wall summary.** In the collapsed wall header, when the block is asymmetric and chosen, show the effective wall thickness (e.g. append `· {wallCm}см девор`) so the operator sees the orientation at a glance. Use the active orientation's `wallCm`.

- [ ] **Step 6: Order-detail label (small).** In `src/app/(app)/gazoblok/orders/[id]/page.tsx`, the breakdown section reads `snap.walls`. If a wall has `orientation === "ROTATED"`, append a small bilingual `t("(айланган)","(rotated)")` tag after its dimensions. Guard defensively (optional field).

- [ ] **Step 7: Verify.**
Run: `npx tsc --noEmit` (exit 0) + `npm run build` (exit 0).

- [ ] **Step 8: Commit**
```bash
git add src/lib/gazoblok-validation.ts src/components/gazoblok/GazoblokWallCalculator.tsx "src/app/(app)/gazoblok/orders/[id]/page.tsx"
git commit -m "Feat(gazoblok) · per-wall block orientation control (wall/course swap)"
```

---

### Task 3: Verification (localhost, no deploy)

- [ ] **Step 1:** `npx vitest run` green, `npx tsc --noEmit` exit 0, clean `npm run build` exit 0.
- [ ] **Step 2:** On the running dev server, add a wall using the 20sm block. Confirm an orientation control appears with «Девор 20см · қатор 30см» and «Девор 30см · қатор 20см». Flipping it changes the block count (~5.5 vs ~8.2 per m²) live, and the price follows. A symmetric block (if any) shows no toggle. Place an order and confirm the detail breakdown shows the rotated tag where used.
- [ ] **Step 3:** Report; **STOP — no push/deploy.**
