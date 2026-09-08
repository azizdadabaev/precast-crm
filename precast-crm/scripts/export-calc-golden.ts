// Export deterministic engine vectors so the Kotlin port (Android
// :core:calc) can assert bit-for-bit parity. Run: npm run golden:calc
//
// Slab cases: the numbered tests in BLENDER_CALC_SPEC.md, one per pattern
// branch of autoPickPattern, start-beam promotions, manual extras,
// correction, extras-only mode, and a bearing sweep — PLUS every distinct
// `calculateSlab` input exercised by tests/calculation-engine.test.ts and
// tests/calculation-engine-extras-only.test.ts (deduplicated by input:
// two literally different call sites that pass the same effective input,
// e.g. an explicit `bearing: 0.15` vs the omitted default, are the same
// vector and only kept once). Add a case here whenever a rule changes;
// the Android suite fails until it is ported.
//
// Project cases (`project.cases`): vectors for `projectTotal`, over a list
// of ROOM SUBTOTALS rather than full SlabResult objects — projectTotal
// only ever reads `room.subtotal`, so a case's `input.room_subtotals` is
// a plain number[] and the exporter calls the real function with minimal
// stub rooms (`{ subtotal } as SlabResult`). `input.discount_percent` is
// the raw arg (0 when unset); `input.discount_amount_override` is `null`
// when the case doesn't pass one. `result` carries the four `ProjectTotal`
// fields by their TS names (rooms_subtotal, discount_percent,
// discount_amount, total). The Kotlin loader does not read this block yet
// (task 4 only adds it) — a later task extends GoldenVectors.kt to parse
// `project` the same way it parses `cases`, constructing dummy SlabResult
// rows carrying only `subtotal` for each `room_subtotals` entry.
//
// Gazoblok cases: see buildGazoblokGolden() below — a parallel, self-
// contained export to docs/api/gazoblok-golden.json for gazoblok-engine.ts.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import {
  calculateSlab,
  projectTotal,
  DEFAULT_PRICE_CONFIG,
  type SlabInput,
  type SlabResult,
  type PriceConfig,
} from "../src/services/calculation-engine";
import {
  blockVolumeM3,
  pricePerM3,
  blocksPerM3,
  estimateWall,
  lineTotal,
  orderTotal,
  estimateProject,
  GazoblokError,
  type BlockProduct,
  type WallEstimateInput,
  type OrderLineInput,
  type WallInput,
  type ProjectEstimateOpts,
} from "../src/services/gazoblok-engine";

export interface GoldenCase { name: string; input: SlabInput; result: SlabResult }

export interface ProjectGoldenCaseInput {
  room_subtotals: number[];
  discount_percent: number;
  discount_amount_override: number | null;
}
export interface ProjectGoldenCaseResult {
  rooms_subtotal: number;
  discount_percent: number;
  discount_amount: number;
  total: number;
}
export interface ProjectGoldenCase { name: string; input: ProjectGoldenCaseInput; result: ProjectGoldenCaseResult }
export interface ProjectGoldenBlock { cases: ProjectGoldenCase[] }

export interface GoldenFile {
  version: 1;
  pricing: PriceConfig;
  cases: GoldenCase[];
  project: ProjectGoldenBlock;
}

const inputs: Array<{ name: string; input: SlabInput }> = [
  // BLENDER_CALC_SPEC.md verification tests (Tests 1–5)
  { name: "spec-test-1 plain GB", input: { inner_width: 4.0, inner_length: 5.8 } },
  { name: "spec-test-2 BGB small remainder", input: { inner_width: 4.0, inner_length: 5.95 } },
  { name: "spec-test-3 GBG medium remainder", input: { inner_width: 4.0, inner_length: 6.2 } },
  // Renamed from "spec-test-4 large remainder bumps pitches" — R = 0.32
  // here (11 pitches × 0.58 = 6.38, 6.7 − 6.38 = 0.32), which is ≤ 0.45
  // and lands in GBG. It never reached the bump branch; see "bump: R=0.50"
  // below for the case that actually does.
  { name: "spec-test-4 GBG at R=0.32 (below the bump threshold)", input: { inner_width: 4.0, inner_length: 6.7 } },
  { name: "spec-test-5 correction", input: { inner_width: 4.0, inner_length: 5.8, correction: 0.15 } },
  // Pattern overrides
  { name: "override GB on GBG geometry", input: { inner_width: 4.2, inner_length: 6.2, pattern: "GB" } },
  { name: "override BGB on GB geometry", input: { inner_width: 4.2, inner_length: 5.8, pattern: "BGB" } },
  { name: "override GBG on GB geometry", input: { inner_width: 4.2, inner_length: 5.8, pattern: "GBG" } },
  // Start-beam promotions
  { name: "force_start_beam on GBG", input: { inner_width: 3.6, inner_length: 6.2, force_start_beam: true } },
  { name: "force_start_beam on GB", input: { inner_width: 3.6, inner_length: 5.8, force_start_beam: true } },
  { name: "force_start_beam on BGB no-op", input: { inner_width: 3.6, inner_length: 5.95, force_start_beam: true } },
  // Manual extras
  { name: "GB + 2 extra beams", input: { inner_width: 5.0, inner_length: 5.8, extra_beams: 2 } },
  { name: "GBG + 1 extra consumed by start promotion", input: { inner_width: 5.0, inner_length: 6.2, extra_beams: 1 } },
  // Bearing sweep (tier boundaries)
  { name: "bearing 0.10 tier 4.30", input: { inner_width: 4.1, inner_length: 5.0, bearing: 0.10 } },
  { name: "bearing 0.15 tier 4.30 boundary", input: { inner_width: 4.0, inner_length: 5.0 } },
  { name: "bearing 0.15 tier 5.30", input: { inner_width: 5.0, inner_length: 5.0 } },
  { name: "bearing 0.15 tier 6.30", input: { inner_width: 6.0, inner_length: 5.0 } },
  { name: "bearing 0.15 tier 7.30", input: { inner_width: 7.0, inner_length: 5.0 } },
  { name: "bearing 0.15 tier 8.30", input: { inner_width: 8.0, inner_length: 5.0 } },
  { name: "beyond last tier clamps", input: { inner_width: 9.0, inner_length: 5.0 } },
  { name: "bearing 0.20", input: { inner_width: 4.0, inner_length: 5.0, bearing: 0.20 } },
  // Extras-only mode
  { name: "extras-only 3 beams 4.5m", input: { inner_width: 4.2, inner_length: 0, extra_beams: 3 } },
  { name: "extras-only 1 beam 6.0m", input: { inner_width: 5.7, inner_length: 0, extra_beams: 1 } },
  // Rounding edge cases
  { name: "half-away rounding length", input: { inner_width: 3.335, inner_length: 4.6455 } },
  { name: "tiny room", input: { inner_width: 1.0, inner_length: 1.0 } },
  { name: "long room many pitches", input: { inner_width: 4.0, inner_length: 12.0 } },

  // ── R4: auto bump path (raw remainder > MEDIUM_REMAINDER → GB at N+1) ──
  // effective_length = 6.30 → pitches(pre-bump) = 10, raw remainder = 0.50
  // (> 0.45) → bumps to pitches = 11, remainder forced to 0, pattern GB.
  // (Same as the existing "4×6 +0.30 correction" test case below — kept
  // here under the R4 name since it's the case that answers the ruling.)
  { name: "bump: R=0.50 forces GB at pitches+1, remainder zeroed", input: { inner_width: 4.0, inner_length: 6, correction: 0.30 } },

  // ── R4: explicit override paired with an auto-pick of BGB ──
  // (4, 6) auto-picks BGB (R=0.20); override to GBG is a distinct outcome.
  { name: "override GBG on BGB geometry (auto BGB → explicit GBG)", input: { inner_width: 4, inner_length: 6, pattern: "GBG" } },
  // The other missing override/auto-origin pairs, so all 3 origins × 2
  // targets are covered (existing cases above already cover GB→BGB,
  // GB→GBG, GBG→GB):
  { name: "override GB on BGB geometry (auto BGB → explicit GB)", input: { inner_width: 4, inner_length: 6, pattern: "GB" } },
  { name: "override BGB on GBG geometry (auto GBG → explicit BGB)", input: { inner_width: 4, inner_length: 4.3, pattern: "BGB" } },

  // ── Every distinct calculateSlab input from tests/calculation-engine.test.ts
  // and tests/calculation-engine-extras-only.test.ts, named after the it(...)
  // title, deduplicated against the cases above by effective input. ──
  { name: "4×6 no correction (auto BGB, R=0.20 exactly)", input: { inner_width: 4, inner_length: 6 } },
  { name: "4×4.3 auto GBG (R=0.24, extra block row)", input: { inner_width: 4, inner_length: 4.3 } },
  { name: "4×3.5 auto BGB (R≈0.02, extra beam)", input: { inner_width: 4, inner_length: 3.5 } },
  { name: "user's 4.5×6 explicit GBG, bearing 0.15 stated", input: { inner_width: 4.5, inner_length: 6, bearing: 0.15, pattern: "GBG" } },
  { name: "auto-picked GBG (4×3.20 → R=0.30)", input: { inner_width: 4, inner_length: 3.20 } },
  { name: "GBG + 2 manual extras (1 absorbed by conversion, 1 remains)", input: { inner_width: 4, inner_length: 4.3, extra_beams: 2 } },
  { name: "explicit GBG + 1 manual extra → GB at pitches+1", input: { inner_width: 4, inner_length: 4.3, pattern: "GBG", extra_beams: 1 } },
  { name: "auto BGB + 4 manual extra beams", input: { inner_width: 4, inner_length: 6, extra_beams: 4 } },
  { name: "blocks_per_row = CEIL(4.10 / 0.20) = 21", input: { inner_width: 4.10, inner_length: 6 } },
  { name: "blocks_per_row = CEIL(3.50 / 0.20) = 18 (over-coverage)", input: { inner_width: 3.50, inner_length: 6 } },
  { name: "bearing 0.20 on a BGB-auto geometry", input: { inner_width: 4, inner_length: 6, bearing: 0.20 } },
  { name: "bearing 0 → beam_length == inner_width", input: { inner_width: 4, inner_length: 6, bearing: 0 } },
  // (explicit GB override on BGB-auto geometry — same input as "override GB
  // on BGB geometry" in the R4 block above; not repeated here.)
  { name: "force_start_beam promotes auto-GB → BGB (exact 10 pitches)", input: { inner_width: 4, inner_length: 5.8, force_start_beam: true } },
  { name: "force_start_beam promotes explicit-GB → BGB too", input: { inner_width: 4, inner_length: 5.8, pattern: "GB", force_start_beam: true } },
  { name: "force_start_beam no-op on explicit BGB override", input: { inner_width: 4, inner_length: 6, pattern: "BGB", force_start_beam: true } },
  { name: "auto GB-at-N+1 (4×6 +0.30) plus 1 manual extra", input: { inner_width: 4, inner_length: 6, correction: 0.30, extra_beams: 1 } },
  { name: "auto GB-at-N+1 (4×6 +0.30) with force_start_beam → BGB", input: { inner_width: 4, inner_length: 6, correction: 0.30, force_start_beam: true } },
  { name: "auto BGB + 1 manual extra (no GBG conversion)", input: { inner_width: 4, inner_length: 6, extra_beams: 1 } },
  { name: "plain GB (10 pitches, R=0) + 3 manual extras", input: { inner_width: 4, inner_length: 5.8, extra_beams: 3 } },
  { name: "explicit GBG (4×6) + force_start_beam → GB at pitches+1", input: { inner_width: 4, inner_length: 6, pattern: "GBG", force_start_beam: true } },
  { name: "explicit GBG (4×6) + force_start_beam + 1 manual extra remains", input: { inner_width: 4, inner_length: 6, pattern: "GBG", force_start_beam: true, extra_beams: 1 } },
  { name: "auto-picked GBG (4×4.3) + 1 extra triggers conversion to GB", input: { inner_width: 4, inner_length: 4.3, extra_beams: 1 } },
  { name: "plain GB (10 pitches, R=0) + 5 manual extras (concrete-volume invariance)", input: { inner_width: 4, inner_length: 5.8, extra_beams: 5 } },
  { name: "extras-only width=5.05 extras=2", input: { inner_width: 5.05, inner_length: 0, extra_beams: 2 } },
  { name: "extras-only width=4.0 extras=3", input: { inner_width: 4.0, inner_length: 0, extra_beams: 3 } },
  { name: "extras-only width=5.0 extras=1 non-default bearing 0.2", input: { inner_width: 5.0, inner_length: 0, extra_beams: 1, bearing: 0.2 } },
  { name: "extras-only width=5 extras=1 sentinel pattern check", input: { inner_width: 5, inner_length: 0, extra_beams: 1 } },
  { name: "length>0 extras_beams=0 explicit → is_extras_only=false", input: { inner_width: 5.05, inner_length: 6, extra_beams: 0 } },
  { name: "length>0 + extras=2 → is_extras_only=false, extras add on top", input: { inner_width: 5.05, inner_length: 6, extra_beams: 2 } },

  // ── Pricing tier boundaries: value just above each maxBeamLength, so
  // the tier lookup crosses into the next bracket (the existing bearing
  // sweep above already covers the value AT each boundary). One input
  // exercises both m2_price_tiers and extra_beam_price_tiers, since
  // tierPrice() is called with the same beam_length for both. ──
  { name: "tier boundary just above 4.30 → next tier (5.30) price", input: { inner_width: 4.01, inner_length: 5.0 } },
  { name: "tier boundary just above 5.30 → next tier (6.30) price", input: { inner_width: 5.01, inner_length: 5.0 } },
  { name: "tier boundary just above 6.30 → next tier (7.30) price", input: { inner_width: 6.01, inner_length: 5.0 } },
  { name: "tier boundary just above 7.30 → next tier (8.30) price", input: { inner_width: 7.01, inner_length: 5.0 } },
  { name: "tier boundary just above 8.30 → clamps to last tier price", input: { inner_width: 8.01, inner_length: 5.0 } },
];

export const GOLDEN_CASES = inputs;

// ── Project vectors (projectTotal) ─────────────────────────────────
//
// One case per bullet in the task-4 brief: a percent discount, an amount
// override below the subtotal, an amount override above the subtotal (so
// the cap shows), the discount_percent clamp at each end, and an empty
// room list. Room subtotals are taken from real calculateSlab() runs so
// they're grounded in the engine, not hand-picked numbers.
const bgbSubtotal = calculateSlab({ inner_width: 4, inner_length: 6 }, DEFAULT_PRICE_CONFIG).subtotal; // auto BGB
const gbgSubtotal = calculateSlab({ inner_width: 4, inner_length: 4.3 }, DEFAULT_PRICE_CONFIG).subtotal; // auto GBG

const projectCases: Array<{
  name: string;
  room_subtotals: number[];
  discount_percent: number;
  discount_amount_override: number | null;
}> = [
  {
    name: "two rooms, 10% discount on the grand total",
    room_subtotals: [bgbSubtotal, gbgSubtotal],
    discount_percent: 10,
    discount_amount_override: null,
  },
  {
    name: "amount override below the subtotal wins over an ignored percent",
    room_subtotals: [bgbSubtotal],
    discount_percent: 25,
    discount_amount_override: 500_000,
  },
  {
    name: "amount override above the subtotal is capped at the subtotal",
    room_subtotals: [bgbSubtotal],
    discount_percent: 0,
    discount_amount_override: bgbSubtotal + 1_000_000,
  },
  {
    name: "discount_percent above 100 clamps to 100",
    room_subtotals: [bgbSubtotal],
    discount_percent: 150,
    discount_amount_override: null,
  },
  {
    name: "discount_percent below 0 clamps to 0",
    room_subtotals: [bgbSubtotal],
    discount_percent: -5,
    discount_amount_override: null,
  },
  {
    name: "empty room list gives all zeros",
    room_subtotals: [],
    discount_percent: 0,
    discount_amount_override: null,
  },
];

function buildProjectGolden(): ProjectGoldenBlock {
  return {
    cases: projectCases.map((c) => {
      const rooms = c.room_subtotals.map((subtotal) => ({ subtotal }) as SlabResult);
      const r = projectTotal(rooms, c.discount_percent, c.discount_amount_override ?? undefined);
      return {
        name: c.name,
        input: {
          room_subtotals: c.room_subtotals,
          discount_percent: c.discount_percent,
          discount_amount_override: c.discount_amount_override,
        },
        result: {
          rooms_subtotal: r.rooms_subtotal,
          discount_percent: r.discount_percent,
          discount_amount: r.discount_amount,
          total: r.total,
        },
      };
    }),
  };
}

export function buildGolden(): GoldenFile {
  return {
    version: 1,
    pricing: DEFAULT_PRICE_CONFIG,
    cases: inputs.map((c) => ({
      name: c.name,
      input: c.input,
      result: calculateSlab(c.input, DEFAULT_PRICE_CONFIG),
    })),
    project: buildProjectGolden(),
  };
}

// ── Gazoblok vectors ────────────────────────────────────────────────
//
// A parallel, self-contained export for gazoblok-engine.ts. One case per
// success path in tests/gazoblok-engine.test.ts (16 cases: volume/price/
// blocksPerM3, estimateWall, lineTotal, orderTotal) plus estimateProject
// — which that file doesn't cover — pulled from
// src/services/gazoblok-engine.test.ts (both block orientations, multiple
// catalogue thicknesses, openings, waste-once-per-size, glue rounding).
// `rejects` mirrors every `.toThrow(GazoblokError)` assertion in both
// files; the error message is captured from the real thrown error (not
// transcribed by hand) so a message change is also drift-checked.

export type GazoblokFn =
  | "blockVolumeM3"
  | "pricePerM3"
  | "blocksPerM3"
  | "estimateWall"
  | "lineTotal"
  | "orderTotal"
  | "estimateProject";

export interface GazoblokCase { name: string; fn: GazoblokFn; input: unknown; result: unknown }
export interface GazoblokReject { name: string; fn: GazoblokFn; input: unknown; error: string }
export interface GazoblokGoldenFile {
  version: 1;
  catalogue: Record<string, BlockProduct>;
  cases: GazoblokCase[];
  rejects: GazoblokReject[];
}

// The two named catalog fixtures reused across tests/gazoblok-engine.test.ts.
// Kept here for documentation/reuse; every case below still embeds its own
// full `input` (several estimateProject cases use ad-hoc products that
// aren't in this catalogue).
const B_600x300x200: BlockProduct = { lengthM: 0.6, heightM: 0.3, thicknessM: 0.2, pricePerBlock: 18_000 };
const B_600x300x100: BlockProduct = { lengthM: 0.6, heightM: 0.3, thicknessM: 0.1, pricePerBlock: 9_000 };

const gazoblokCaseSpecs: Array<{ name: string; fn: GazoblokFn; input: unknown; run: () => unknown }> = [
  // ── blockVolumeM3 ──
  { name: "blockVolumeM3 600x300x200", fn: "blockVolumeM3", input: B_600x300x200, run: () => blockVolumeM3(B_600x300x200) },
  { name: "blockVolumeM3 600x300x100", fn: "blockVolumeM3", input: B_600x300x100, run: () => blockVolumeM3(B_600x300x100) },
  // ── pricePerM3 ──
  { name: "pricePerM3 600x300x200", fn: "pricePerM3", input: B_600x300x200, run: () => pricePerM3(B_600x300x200) },
  { name: "pricePerM3 600x300x100", fn: "pricePerM3", input: B_600x300x100, run: () => pricePerM3(B_600x300x100) },
  // ── blocksPerM3 ──
  { name: "blocksPerM3 600x300x200", fn: "blocksPerM3", input: B_600x300x200, run: () => blocksPerM3(B_600x300x200) },
  { name: "blocksPerM3 600x300x100", fn: "blocksPerM3", input: B_600x300x100, run: () => blocksPerM3(B_600x300x100) },
  // ── estimateWall ──
  (() => {
    const input: WallEstimateInput = { lengthM: 10, heightM: 3, wastePct: 0 };
    return { name: "estimateWall 10x3 no openings no waste → 167 blocks", fn: "estimateWall" as const, input: { product: B_600x300x200, wall: input }, run: () => estimateWall(B_600x300x200, input) };
  })(),
  (() => {
    const input: WallEstimateInput = { lengthM: 10, heightM: 3 };
    return { name: "estimateWall default 5% waste when wastePct omitted", fn: "estimateWall" as const, input: { product: B_600x300x200, wall: input }, run: () => estimateWall(B_600x300x200, input) };
  })(),
  (() => {
    const input: WallEstimateInput = { lengthM: 10, heightM: 3, openingsM2: 3, wastePct: 0 };
    return { name: "estimateWall subtracts openings from wall area", fn: "estimateWall" as const, input: { product: B_600x300x200, wall: input }, run: () => estimateWall(B_600x300x200, input) };
  })(),
  (() => {
    const input: WallEstimateInput = { lengthM: 2, heightM: 2, openingsM2: 10, wastePct: 0 };
    return { name: "estimateWall floors wall area at 0 when openings exceed wall", fn: "estimateWall" as const, input: { product: B_600x300x200, wall: input }, run: () => estimateWall(B_600x300x200, input) };
  })(),
  // ── lineTotal ──
  { name: "lineTotal multiplies unit price by quantity", fn: "lineTotal", input: { unitPrice: 18_000, quantity: 3 }, run: () => lineTotal(18_000, 3) },
  // ── orderTotal ──
  (() => {
    const lines: OrderLineInput[] = [{ unitPrice: 18_000, quantity: 100 }, { unitPrice: 15_000, quantity: 50 }];
    return { name: "orderTotal sums lines and counts blocks", fn: "orderTotal" as const, input: { lines, opts: {} }, run: () => orderTotal(lines, {}) };
  })(),
  (() => {
    const lines: OrderLineInput[] = [{ unitPrice: 18_000, quantity: 100 }, { unitPrice: 15_000, quantity: 50 }];
    const opts = { discountPercent: 10 };
    return { name: "orderTotal applies a percentage discount", fn: "orderTotal" as const, input: { lines, opts }, run: () => orderTotal(lines, opts) };
  })(),
  (() => {
    const lines: OrderLineInput[] = [{ unitPrice: 18_000, quantity: 100 }, { unitPrice: 15_000, quantity: 50 }];
    const opts = { discountPercent: 10, deliveryCost: 100_000 };
    return { name: "orderTotal adds delivery after the discount", fn: "orderTotal" as const, input: { lines, opts }, run: () => orderTotal(lines, opts) };
  })(),
  (() => {
    const lines: OrderLineInput[] = [{ unitPrice: 18_000, quantity: 100 }, { unitPrice: 15_000, quantity: 50 }];
    const opts = { discountPercent: 10, discountAmount: 300_000 };
    return { name: "orderTotal an explicit amount wins over a percentage", fn: "orderTotal" as const, input: { lines, opts }, run: () => orderTotal(lines, opts) };
  })(),
  (() => {
    const lines: OrderLineInput[] = [{ unitPrice: 18_000, quantity: 100 }, { unitPrice: 15_000, quantity: 50 }];
    const opts = { discountAmount: 9_999_999 };
    return { name: "orderTotal caps the discount amount at the subtotal", fn: "orderTotal" as const, input: { lines, opts }, run: () => orderTotal(lines, opts) };
  })(),
  // ── estimateProject ── (src/services/gazoblok-engine.test.ts)
  (() => {
    const walls: WallInput[] = [{ id: "w1", productId: "A", lengthM: 5, heightM: 2, openings: [] }];
    const productsObj = { A: { lengthM: 0.6, heightM: 0.2, thicknessM: 0.2, pricePerBlock: 20_000, label: "600x200x200" } };
    const opts: ProjectEstimateOpts = { jointMm: 3, wastePct: 0 };
    return { name: "estimateProject single wall, joint-aware, no openings, waste 0", fn: "estimateProject" as const, input: { walls, products: productsObj, opts }, run: () => estimateProject(walls, new Map(Object.entries(productsObj)), opts) };
  })(),
  (() => {
    const walls: WallInput[] = [{ id: "w1", productId: "A", lengthM: 5, heightM: 2, openings: [{ kind: "DOOR", widthM: 0.9, heightM: 2.1, qty: 1 }] }];
    const productsObj = { A: { lengthM: 0.6, heightM: 0.2, thicknessM: 0.2, pricePerBlock: 20_000, label: "A" } };
    const opts: ProjectEstimateOpts = { jointMm: 3, wastePct: 0 };
    return { name: "estimateProject subtracts a door opening (w×h×qty) from the wall", fn: "estimateProject" as const, input: { walls, products: productsObj, opts }, run: () => estimateProject(walls, new Map(Object.entries(productsObj)), opts) };
  })(),
  (() => {
    const walls: WallInput[] = [
      { id: "w1", productId: "A", lengthM: 5, heightM: 2, openings: [] },
      { id: "w2", productId: "B", lengthM: 4, heightM: 2, openings: [] },
    ];
    const productsObj = {
      A: { lengthM: 0.6, heightM: 0.25, thicknessM: 0.3, pricePerBlock: 30_000, label: "300mm" },
      B: { lengthM: 0.6, heightM: 0.25, thicknessM: 0.1, pricePerBlock: 12_000, label: "100mm" },
    };
    const opts: ProjectEstimateOpts = { jointMm: 2, wastePct: 5 };
    return { name: "estimateProject groups blocks by size — one perSize entry per product", fn: "estimateProject" as const, input: { walls, products: productsObj, opts }, run: () => estimateProject(walls, new Map(Object.entries(productsObj)), opts) };
  })(),
  (() => {
    const walls: WallInput[] = [
      { id: "w1", productId: "A", lengthM: 3, heightM: 2, openings: [] },
      { id: "w2", productId: "A", lengthM: 3, heightM: 2, openings: [] },
    ];
    const productsObj = { A: { lengthM: 0.6, heightM: 0.2, thicknessM: 0.2, pricePerBlock: 1_000, label: "A" } };
    const opts: ProjectEstimateOpts = { jointMm: 3, wastePct: 5 };
    return { name: "estimateProject applies waste ONCE per size after aggregating walls", fn: "estimateProject" as const, input: { walls, products: productsObj, opts }, run: () => estimateProject(walls, new Map(Object.entries(productsObj)), opts) };
  })(),
  (() => {
    const walls: WallInput[] = [{ id: "w1", productId: "A", lengthM: 5, heightM: 2, openings: [] }];
    const productsObj = { A: { lengthM: 0.6, heightM: 0.2, thicknessM: 0.2, pricePerBlock: 1_000, label: "A" } };
    const opts: ProjectEstimateOpts = { jointMm: 3, wastePct: 0 };
    return { name: "estimateProject computes glue kg and 25kg bags from total net area", fn: "estimateProject" as const, input: { walls, products: productsObj, opts }, run: () => estimateProject(walls, new Map(Object.entries(productsObj)), opts) };
  })(),
  (() => {
    const walls: WallInput[] = [{ id: "w1", productId: "A", lengthM: 2, heightM: 2, openings: [{ kind: "WINDOW", widthM: 3, heightM: 3, qty: 1 }] }];
    const productsObj = { A: { lengthM: 0.6, heightM: 0.2, thicknessM: 0.2, pricePerBlock: 1_000, label: "A" } };
    const opts: ProjectEstimateOpts = { jointMm: 3, wastePct: 0 };
    return { name: "estimateProject clamps net area to 0 and warns when openings exceed the wall", fn: "estimateProject" as const, input: { walls, products: productsObj, opts }, run: () => estimateProject(walls, new Map(Object.entries(productsObj)), opts) };
  })(),
  (() => {
    const walls: WallInput[] = [{ id: "w1", productId: "GHOST", lengthM: 5, heightM: 2, openings: [] }];
    const productsObj = { A: { lengthM: 0.6, heightM: 0.2, thicknessM: 0.2, pricePerBlock: 1_000, label: "A" } };
    return { name: "estimateProject warns and skips a wall whose product is missing/unknown", fn: "estimateProject" as const, input: { walls, products: productsObj, opts: {} }, run: () => estimateProject(walls, new Map(Object.entries(productsObj)), {}) };
  })(),
  (() => {
    const walls: WallInput[] = [{ id: "w1", productId: "A", lengthM: 10, heightM: 1, openings: [] }];
    const productsObj = { A: { lengthM: 0.6, heightM: 0.3, thicknessM: 0.2, pricePerBlock: 1_000, label: "20sm" } };
    const opts: ProjectEstimateOpts = { jointMm: 2, wastePct: 0 };
    return { name: "estimateProject defaults to STANDARD orientation when absent", fn: "estimateProject" as const, input: { walls, products: productsObj, opts }, run: () => estimateProject(walls, new Map(Object.entries(productsObj)), opts) };
  })(),
  (() => {
    const walls: WallInput[] = [{ id: "w1", productId: "A", lengthM: 10, heightM: 1, openings: [], orientation: "STANDARD" }];
    const productsObj = { A: { lengthM: 0.6, heightM: 0.3, thicknessM: 0.2, pricePerBlock: 1_000, label: "20sm" } };
    const opts: ProjectEstimateOpts = { jointMm: 2, wastePct: 0 };
    return { name: "estimateProject STANDARD orientation faces length×height", fn: "estimateProject" as const, input: { walls, products: productsObj, opts }, run: () => estimateProject(walls, new Map(Object.entries(productsObj)), opts) };
  })(),
  (() => {
    const walls: WallInput[] = [{ id: "w1", productId: "A", lengthM: 10, heightM: 1, openings: [], orientation: "ROTATED" }];
    const productsObj = { A: { lengthM: 0.6, heightM: 0.3, thicknessM: 0.2, pricePerBlock: 1_000, label: "20sm" } };
    const opts: ProjectEstimateOpts = { jointMm: 2, wastePct: 0 };
    return { name: "estimateProject ROTATED orientation faces length×thickness", fn: "estimateProject" as const, input: { walls, products: productsObj, opts }, run: () => estimateProject(walls, new Map(Object.entries(productsObj)), opts) };
  })(),
];

const gazoblokRejectSpecs: Array<{ name: string; fn: GazoblokFn; input: unknown; run: () => unknown }> = [
  { name: "blockVolumeM3 rejects zero thickness", fn: "blockVolumeM3", input: { ...B_600x300x200, thicknessM: 0 }, run: () => blockVolumeM3({ ...B_600x300x200, thicknessM: 0 }) },
  { name: "blockVolumeM3 rejects negative length", fn: "blockVolumeM3", input: { ...B_600x300x200, lengthM: -1 }, run: () => blockVolumeM3({ ...B_600x300x200, lengthM: -1 }) },
  { name: "estimateWall rejects non-positive length", fn: "estimateWall", input: { product: B_600x300x200, wall: { lengthM: 0, heightM: 3 } }, run: () => estimateWall(B_600x300x200, { lengthM: 0, heightM: 3 }) },
  { name: "estimateWall rejects non-positive height", fn: "estimateWall", input: { product: B_600x300x200, wall: { lengthM: 10, heightM: -1 } }, run: () => estimateWall(B_600x300x200, { lengthM: 10, heightM: -1 }) },
  { name: "estimateWall rejects negative openings area", fn: "estimateWall", input: { product: B_600x300x200, wall: { lengthM: 10, heightM: 3, openingsM2: -1 } }, run: () => estimateWall(B_600x300x200, { lengthM: 10, heightM: 3, openingsM2: -1 }) },
  { name: "lineTotal rejects a non-integer quantity", fn: "lineTotal", input: { unitPrice: 18_000, quantity: 1.5 }, run: () => lineTotal(18_000, 1.5) },
  { name: "lineTotal rejects a negative quantity", fn: "lineTotal", input: { unitPrice: 18_000, quantity: -1 }, run: () => lineTotal(18_000, -1) },
  (() => {
    const walls: WallInput[] = [{ id: "w1", productId: "A", lengthM: 0, heightM: 2, openings: [] }];
    const productsObj = { A: { lengthM: 0.6, heightM: 0.2, thicknessM: 0.2, pricePerBlock: 1_000, label: "A" } };
    return { name: "estimateProject rejects a non-positive wall length", fn: "estimateProject" as const, input: { walls, products: productsObj, opts: {} }, run: () => estimateProject(walls, new Map(Object.entries(productsObj)), {}) };
  })(),
];

export function buildGazoblokGolden(): GazoblokGoldenFile {
  return {
    version: 1,
    catalogue: { B_600x300x200, B_600x300x100 },
    cases: gazoblokCaseSpecs.map((c) => ({ name: c.name, fn: c.fn, input: c.input, result: c.run() })),
    rejects: gazoblokRejectSpecs.map((c) => {
      try {
        c.run();
        throw new Error(`expected ${c.name} to throw`);
      } catch (e) {
        if (e instanceof GazoblokError) {
          return { name: c.name, fn: c.fn, input: c.input, error: e.message };
        }
        throw e;
      }
    }),
  };
}

const invokedDirectly = (process.argv[1] ?? "").replace(/\\/g, "/").endsWith("scripts/export-calc-golden.ts");
if (invokedDirectly) {
  const calcOut = path.resolve(__dirname, "../../docs/api/calc-golden.json");
  const gazoblokOut = path.resolve(__dirname, "../../docs/api/gazoblok-golden.json");
  const nextCalc = JSON.stringify(buildGolden(), null, 2) + "\n";
  const nextGazoblok = JSON.stringify(buildGazoblokGolden(), null, 2) + "\n";

  if (process.argv.includes("--check")) {
    let stale = false;
    const currentCalc = existsSync(calcOut) ? readFileSync(calcOut, "utf8") : "";
    if (currentCalc !== nextCalc) {
      console.error("docs/api/calc-golden.json is stale — run `npm run golden:calc`");
      stale = true;
    }
    const currentGazoblok = existsSync(gazoblokOut) ? readFileSync(gazoblokOut, "utf8") : "";
    if (currentGazoblok !== nextGazoblok) {
      console.error("docs/api/gazoblok-golden.json is stale — run `npm run golden:calc`");
      stale = true;
    }
    if (stale) process.exit(1);
    console.log("calc-golden.json and gazoblok-golden.json are up to date");
  } else {
    mkdirSync(path.dirname(calcOut), { recursive: true });
    writeFileSync(calcOut, nextCalc);
    console.log(`wrote ${calcOut}`);
    mkdirSync(path.dirname(gazoblokOut), { recursive: true });
    writeFileSync(gazoblokOut, nextGazoblok);
    console.log(`wrote ${gazoblokOut}`);
  }
}
