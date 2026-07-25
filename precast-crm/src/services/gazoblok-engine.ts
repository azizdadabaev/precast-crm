/**
 * ─────────────────────────────────────────────────────────────────
 *  ГАЗОБЛОК (aerated-concrete wall block) ENGINE
 * ─────────────────────────────────────────────────────────────────
 *
 *  Pure module. NO database access. NO side effects. Mirrors the
 *  beam-and-block calculation-engine.ts in spirit, but far simpler:
 *  газоблок is a COMMODITY — a customer buys a quantity of blocks of
 *  given sizes. There is no room geometry, no pattern, no pitch math.
 *
 *  Pricing: the operator sets a price PER BLOCK for each size. The
 *  per-m³ price is DERIVED here (pricePerBlock / blockVolumeM3) for
 *  display/quoting. An order line is quantity × unitPrice; the order
 *  total applies a discount with the SAME precedence as the floor
 *  engine's projectTotal (an explicit UZS amount > 0 wins over a %).
 *
 *  Wall estimator: turns a wall (length × height, minus openings) into
 *  the number of blocks needed for a chosen size, plus a waste margin.
 *
 *  Reuses round2/round3/CalculationError from the floor engine so the
 *  rounding convention and the API error mapping (handler() in
 *  src/lib/api.ts treats CalculationError as a 400) stay identical.
 * ─────────────────────────────────────────────────────────────────
 */

import { round2, round3, CalculationError } from "./calculation-engine";

/** Default % of extra blocks added to cover cutting waste / breakage. */
export const DEFAULT_WASTE_PCT = 5;

/** Distinct error type so call sites can tell a блок error from a floor
 *  error, while still being caught by handler()'s CalculationError check. */
export class GazoblokError extends CalculationError {
  constructor(message: string) {
    super(message);
    this.name = "GazoblokError";
  }
}

/** A catalog product as the engine needs it: dimensions in METERS plus the
 *  operator-set price per single block (UZS). */
export interface BlockProduct {
  lengthM: number;
  heightM: number;
  thicknessM: number; // = the wall thickness this block builds
  pricePerBlock: number;
}

// ── Volume / derived price ──────────────────────────────────────

/** Volume of a single block in m³ (length × height × thickness). */
export function blockVolumeM3(p: BlockProduct): number {
  const v = p.lengthM * p.heightM * p.thicknessM;
  if (!Number.isFinite(v) || v <= 0) {
    throw new GazoblokError("block dimensions must be positive numbers (meters)");
  }
  return round3(v);
}

/** Derived price per m³ (UZS), for display alongside the per-block price. */
export function pricePerM3(p: BlockProduct): number {
  if (!Number.isFinite(p.pricePerBlock) || p.pricePerBlock < 0) {
    throw new GazoblokError("price per block must be a non-negative number");
  }
  return round2(p.pricePerBlock / blockVolumeM3(p));
}

/** How many blocks fit in one m³ (informational). */
export function blocksPerM3(p: BlockProduct): number {
  return round2(1 / blockVolumeM3(p));
}

// ── Wall estimator ──────────────────────────────────────────────

export interface WallEstimateInput {
  /** Wall length (m). */
  lengthM: number;
  /** Wall height (m). */
  heightM: number;
  /** Total openings area (doors/windows) to subtract (m²). Default 0. */
  openingsM2?: number;
  /** Waste margin added on top (%). Default DEFAULT_WASTE_PCT. */
  wastePct?: number;
}

export interface WallEstimateResult {
  /** Wall face area net of openings, never below 0 (m²). */
  wallAreaM2: number;
  /** Face area of one block shown on the wall = length × height (m²). */
  blockFaceAreaM2: number;
  wastePct: number;
  /** ceil(wallArea / blockFaceArea × (1 + waste%)). */
  blocksNeeded: number;
  /** blocksNeeded × block volume (m³). */
  volumeM3: number;
  /** blocksNeeded × pricePerBlock (UZS). */
  price: number;
}

/**
 * Estimate how many blocks a wall needs. The block laid in a wall shows
 * its length × height face; its thickness equals the wall thickness, so
 * the operator should pick the size whose thicknessM matches the wall.
 */
export function estimateWall(p: BlockProduct, input: WallEstimateInput): WallEstimateResult {
  if (!Number.isFinite(input.lengthM) || input.lengthM <= 0) {
    throw new GazoblokError("wall length must be a positive number (meters)");
  }
  if (!Number.isFinite(input.heightM) || input.heightM <= 0) {
    throw new GazoblokError("wall height must be a positive number (meters)");
  }
  const openings = input.openingsM2 ?? 0;
  if (!Number.isFinite(openings) || openings < 0) {
    throw new GazoblokError("openings area must be a non-negative number (m²)");
  }
  const wastePct = input.wastePct ?? DEFAULT_WASTE_PCT;
  if (!Number.isFinite(wastePct) || wastePct < 0) {
    throw new GazoblokError("waste percent must be a non-negative number");
  }

  const blockFaceAreaM2 = round3(p.lengthM * p.heightM);
  if (blockFaceAreaM2 <= 0) {
    throw new GazoblokError("block face area must be positive (check length/height)");
  }

  const wallAreaM2 = round3(Math.max(0, input.lengthM * input.heightM - openings));
  // Subtract a tiny epsilon before ceil() so a float artifact (e.g.
  // 30 / 0.18 × 1.05 lands on 175.00000000000003) can't silently add a
  // whole extra block. Same 1e-9 guard the floor engine uses for tiers.
  const raw = (wallAreaM2 / blockFaceAreaM2) * (1 + wastePct / 100);
  const blocksNeeded = Math.max(0, Math.ceil(raw - 1e-9));
  const volumeM3 = round3(blocksNeeded * blockVolumeM3(p));
  const price = round2(blocksNeeded * p.pricePerBlock);

  return { wallAreaM2, blockFaceAreaM2, wastePct, blocksNeeded, volumeM3, price };
}

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
  orientation?: "STANDARD" | "ROTATED";
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

/** Blocks per m² of wall face for an explicit face (length × height), joint-aware.
 *  = 1 / ((faceL + joint) × (faceH + joint)), all in meters. */
function facePerM2(faceLM: number, faceHM: number, jointM: number): number {
  const denom = (faceLM + jointM) * (faceHM + jointM);
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

    const faceHM = w.orientation === "ROTATED" ? product.thicknessM : product.heightM;
    const perM2 = facePerM2(product.lengthM, faceHM, jointM);
    rawByProduct.set(w.productId, (rawByProduct.get(w.productId) ?? 0) + net * perM2);
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

// ── Order line + totals ─────────────────────────────────────────

export interface OrderLineInput {
  /** Price per block (UZS) at the moment of quoting. */
  unitPrice: number;
  quantity: number;
}

/** A single line's total (UZS). */
export function lineTotal(unitPrice: number, quantity: number): number {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new GazoblokError("quantity must be a non-negative integer");
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new GazoblokError("unit price must be a non-negative number");
  }
  return round2(unitPrice * quantity);
}

export interface BlockOrderTotal {
  linesSubtotal: number;
  discountPercent: number;
  discountAmount: number;
  deliveryCost: number;
  total: number;
  totalBlocks: number;
}

/**
 * Compute an order's grand total from its lines and a single discount
 * input. Discount precedence mirrors the floor engine's projectTotal:
 * an explicit UZS `discountAmount` > 0 wins (and the percent is back-
 * computed for downstream consistency); otherwise `discountPercent` is
 * applied. The amount is capped at the subtotal so a typo can't make the
 * total negative. Delivery is added after the discount.
 */
export function orderTotal(
  lines: OrderLineInput[],
  opts: { discountPercent?: number; discountAmount?: number; deliveryCost?: number } = {},
): BlockOrderTotal {
  const linesSubtotal = round2(
    lines.reduce((s, l) => s + lineTotal(l.unitPrice, l.quantity), 0),
  );
  const totalBlocks = lines.reduce((s, l) => s + l.quantity, 0);
  const deliveryCost = Math.max(0, opts.deliveryCost ?? 0);

  let discountAmount: number;
  let discountPercent: number;
  const amt = opts.discountAmount ?? 0;
  if (amt > 0) {
    discountAmount = round2(Math.min(amt, linesSubtotal));
    discountPercent =
      linesSubtotal > 0 ? round2((discountAmount / linesSubtotal) * 100) : 0;
  } else {
    discountPercent = Math.max(0, Math.min(100, opts.discountPercent ?? 0));
    discountAmount = round2((linesSubtotal * discountPercent) / 100);
  }
  const total = round2(linesSubtotal - discountAmount + deliveryCost);
  return { linesSubtotal, discountPercent, discountAmount, deliveryCost, total, totalBlocks };
}
