// Live pricing config — owner-editable, backed by a single AppConfig
// row keyed by "pricing.tiers". The bracket boundaries
// (max_beam_length: 4.30, 5.30, …) are physical factory constants and
// not editable; only the 11 prices in the 5+5+1 grid can change.
//
// Historical orders are NOT affected by edits — the Calculation row
// already snapshots m2Price and extraBeamPricePerM at save time, so
// placed orders stay frozen at their original tier. New calculations
// and orders compute against whatever loadPricingConfig() returns at
// the moment of save/place.

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_PRICE_CONFIG,
  M2_PRICE_TIERS,
  EXTRA_BEAM_PRICE_TIERS,
  type PriceConfig,
} from "@/services/calculation-engine";

const APP_CONFIG_KEY = "pricing.tiers";

/**
 * Wire-shape for the AppConfig.value JSON. We persist plain numbers
 * (not Prisma Decimals) — the tier table is a small, finite list and
 * the prices are integers in practice. snake_case to match the engine.
 */
interface StoredPricingShape {
  m2: number[];          // length 5, aligned to M2_PRICE_TIERS brackets
  extra_beam: number[];  // length 5, aligned to EXTRA_BEAM_PRICE_TIERS brackets
  block: number;
}

function isStoredShape(v: unknown): v is StoredPricingShape {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    Array.isArray(o.m2) &&
    o.m2.length === M2_PRICE_TIERS.length &&
    o.m2.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0) &&
    Array.isArray(o.extra_beam) &&
    o.extra_beam.length === EXTRA_BEAM_PRICE_TIERS.length &&
    o.extra_beam.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0) &&
    typeof o.block === "number" &&
    Number.isFinite(o.block) &&
    o.block >= 0
  );
}

/**
 * Load the current pricing. Falls back to engine defaults if the
 * AppConfig row is missing, malformed, or has a different bracket
 * count (e.g. after a schema migration that adds a new tier).
 */
export async function loadPricingConfig(): Promise<PriceConfig> {
  const row = await prisma.appConfig.findUnique({
    where: { key: APP_CONFIG_KEY },
  });
  if (!row) return DEFAULT_PRICE_CONFIG;

  const value = row.value;
  if (!isStoredShape(value)) {
    console.error(
      `[pricing-config] AppConfig "${APP_CONFIG_KEY}" row is malformed; falling back to defaults`,
      value,
    );
    return DEFAULT_PRICE_CONFIG;
  }

  return {
    m2_price_tiers: M2_PRICE_TIERS.map((t, i) => ({
      max_beam_length: t.max_beam_length,
      price: value.m2[i],
    })),
    extra_beam_price_tiers: EXTRA_BEAM_PRICE_TIERS.map((t, i) => ({
      max_beam_length: t.max_beam_length,
      price: value.extra_beam[i],
    })),
    block_unit_price: value.block,
  };
}

/**
 * Persist a new pricing config. Returns the saved config (which is the
 * same shape as the input — pure write, no transformation beyond what
 * the storage layer does to Decimals). Throws on validation errors so
 * the caller route can return a 400 with a clear message.
 */
export async function savePricingConfig(next: PriceConfig): Promise<PriceConfig> {
  if (
    next.m2_price_tiers.length !== M2_PRICE_TIERS.length ||
    next.extra_beam_price_tiers.length !== EXTRA_BEAM_PRICE_TIERS.length
  ) {
    throw new Error(
      `Pricing config must have ${M2_PRICE_TIERS.length} m² tiers and ${EXTRA_BEAM_PRICE_TIERS.length} extra-beam tiers`,
    );
  }
  for (const t of [...next.m2_price_tiers, ...next.extra_beam_price_tiers]) {
    if (!Number.isFinite(t.price) || t.price < 0) {
      throw new Error("Every tier price must be a non-negative finite number");
    }
  }
  if (!Number.isFinite(next.block_unit_price) || next.block_unit_price < 0) {
    throw new Error("Block unit price must be a non-negative finite number");
  }

  const stored: StoredPricingShape = {
    m2: next.m2_price_tiers.map((t) => t.price),
    extra_beam: next.extra_beam_price_tiers.map((t) => t.price),
    block: next.block_unit_price,
  };

  await prisma.appConfig.upsert({
    where: { key: APP_CONFIG_KEY },
    create: { key: APP_CONFIG_KEY, value: stored as unknown as object },
    update: { value: stored as unknown as object },
  });

  return next;
}

/**
 * Read the raw AppConfig row so callers can show "last updated" stamps.
 * Separate from loadPricingConfig() to avoid two DB calls for the
 * common case where you only need the prices.
 */
export async function loadPricingMeta(): Promise<{ updatedAt: Date | null }> {
  const row = await prisma.appConfig.findUnique({
    where: { key: APP_CONFIG_KEY },
    select: { updatedAt: true },
  });
  return { updatedAt: row?.updatedAt ?? null };
}
