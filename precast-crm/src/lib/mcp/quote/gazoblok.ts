// Gazoblok quote for the MCP server (spec 2026-10-07). Pure.
//
// Priced per catalog size (owner: "price per size is enough" — grade is echoed,
// not priced). Quantities come from the CRM's gazoblok engine: lineTotal,
// blockVolumeM3 / pricePerM3, and estimateWall for a wall area.

import {
  blockVolumeM3,
  estimateWall,
  lineTotal,
  pricePerM3,
} from '@/services/gazoblok-engine';
import { resolveGazoblokProduct, type CatalogProduct } from '@/lib/agent/gazoblok-quote';
import { foldForSearch } from '@/lib/search-fold';
import { QuoteInputError } from './slab';
import { textsFor, type Lang } from './texts';

export interface GazoblokCatalogRow extends CatalogProduct {
  /** On-hand blocks; null when the size is not tracked in stock. */
  stockQuantity: number | null;
}

export interface GazoblokQuoteInput {
  size?: string;
  thickness_cm?: number;
  grade?: string;
  quantity_blocks?: number;
  volume_m3?: number;
  wall_area_m2?: number;
  district?: string;
  lang?: Lang;
}

export interface GazoblokQuoteResult {
  lang: Lang;
  size: string;
  thickness_cm: number;
  grade: string | null;
  blocks: number;
  volume_m3: number;
  price_per_block: number;
  price_per_m3: number;
  total_price: number;
  currency: 'UZS';
  delivery_included: boolean | null;
  delivery_note: string;
  in_stock: boolean;
  includes: string;
}

/** "600x300x200", "600×300×200", "600*300*200" → "600x300x200". */
const sizeKey = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/[×*х]/g, 'x');
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Yangiqo'rg'on in Latin, Cyrillic Uzbek or Russian spelling. */
function isYangiqorgon(district: string): boolean {
  const f = foldForSearch(district);
  return f.includes('yangiqorgon') || f.includes('yangikurgan');
}

function pickProduct(input: GazoblokQuoteInput, catalog: GazoblokCatalogRow[]): GazoblokCatalogRow {
  const active = catalog.filter((p) => p.active !== false);
  const sizes = active.map((p) => p.label).join(', ');
  if (input.size) {
    const want = sizeKey(input.size);
    const hit = active.find((p) => sizeKey(p.label) === want);
    if (!hit) throw new QuoteInputError('UNKNOWN_SIZE', `No gazoblok size "${input.size}". Available: ${sizes}.`);
    return hit;
  }
  if (input.thickness_cm !== undefined) {
    if (!positive(input.thickness_cm)) throw new QuoteInputError('INVALID_INPUT', 'thickness_cm must be a positive number.');
    const hit = resolveGazoblokProduct(active, { thicknessMm: input.thickness_cm * 10 });
    if (!hit) {
      throw new QuoteInputError('UNKNOWN_SIZE', `No gazoblok for a ${input.thickness_cm} cm wall. Available: ${sizes}.`);
    }
    return hit as GazoblokCatalogRow;
  }
  throw new QuoteInputError('INVALID_INPUT', `Give size or thickness_cm. Available sizes: ${sizes}.`);
}

export function buildGazoblokQuote(input: GazoblokQuoteInput, catalog: GazoblokCatalogRow[]): GazoblokQuoteResult {
  const { lang, t } = textsFor(input.lang);
  const modes = [input.quantity_blocks, input.volume_m3, input.wall_area_m2].filter((v) => v !== undefined);
  if (modes.length !== 1) {
    throw new QuoteInputError('INVALID_INPUT', 'Give exactly one of quantity_blocks, volume_m3 or wall_area_m2.');
  }
  const p = pickProduct(input, catalog);

  let blocks: number;
  if (input.quantity_blocks !== undefined) {
    if (!Number.isInteger(input.quantity_blocks) || input.quantity_blocks <= 0) {
      throw new QuoteInputError('INVALID_INPUT', 'quantity_blocks must be a positive whole number.');
    }
    blocks = input.quantity_blocks;
  } else if (input.volume_m3 !== undefined) {
    if (!positive(input.volume_m3)) throw new QuoteInputError('INVALID_INPUT', 'volume_m3 must be a positive number.');
    blocks = Math.ceil(input.volume_m3 / blockVolumeM3(p) - 1e-9);
  } else {
    if (!positive(input.wall_area_m2)) throw new QuoteInputError('INVALID_INPUT', 'wall_area_m2 must be a positive number.');
    blocks = estimateWall(p, { lengthM: input.wall_area_m2 as number, heightM: 1 }).blocksNeeded;
  }

  const delivery_included = input.district ? isYangiqorgon(input.district) : null;
  return {
    lang,
    size: p.label,
    thickness_cm: Math.round(p.thicknessM * 100),
    grade: input.grade?.trim() || null,
    blocks,
    volume_m3: Math.round(blocks * blockVolumeM3(p) * 1000) / 1000,
    price_per_block: p.pricePerBlock,
    price_per_m3: pricePerM3(p),
    total_price: lineTotal(p.pricePerBlock, blocks),
    currency: 'UZS',
    delivery_included,
    delivery_note:
      delivery_included === null ? t.deliveryUnknown : delivery_included ? t.deliveryIncluded : t.deliveryNotIncluded,
    // Owner policy: an untracked size is "almost always available". Never a count.
    in_stock: p.stockQuantity === null ? true : p.stockQuantity >= blocks,
    includes: t.gazIncludes,
  };
}
