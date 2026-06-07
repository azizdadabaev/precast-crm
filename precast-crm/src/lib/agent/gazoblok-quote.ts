// buildGazoblokQuote — composes the pure gazoblok engine with a signed quote
// token (spec §4.2 / §5), mirroring slab-quote.ts for the floor line. The
// get_gazoblok_quote tool (tools/get-gazoblok-quote.ts) calls this with the LIVE
// catalog and process.env.QUOTE_SIGNING_SECRET; here everything is injected so
// this stays pure and unit-testable.
//
// A gazoblok customer buys a QUANTITY of blocks of one size: either a direct
// count, or derived from a wall (length × height − openings, + waste). The
// minted token carries kind:'gazoblok' so a later consumer can tell it apart
// from a kind:'slab' quote.

import {
  estimateWall,
  lineTotal,
  type BlockProduct,
} from '@/services/gazoblok-engine';
import { mintQuoteToken } from './quote-token';

const DEFAULT_VALIDITY_MS = 24 * 60 * 60 * 1000; // 24h — matches slab quotes

/** A catalog row as the quote needs it: the engine's BlockProduct + identity. */
export interface CatalogProduct extends BlockProduct {
  id: string;
  label: string;
  active?: boolean;
}

export interface GazoblokProductSelector {
  productId?: string;
  /** Wall thickness in millimetres (the natural way a customer picks a size). */
  thicknessMm?: number;
}

/**
 * Resolve a catalog row from a selector: exact productId wins; otherwise match
 * by wall thickness (mm) among ACTIVE rows. Returns null when nothing matches —
 * the caller escalates rather than inventing a size (spec §5).
 */
export function resolveGazoblokProduct(
  catalog: CatalogProduct[],
  selector: GazoblokProductSelector,
): CatalogProduct | null {
  // Never resolve a discontinued size — a price-integrity tool must not quote an
  // inactive product. (The live shell already filters active:true, but the pure
  // core enforces the same contract regardless of how the catalog was built.)
  if (selector.productId) {
    const p = catalog.find((p) => p.id === selector.productId);
    return p && p.active !== false ? p : null;
  }
  if (selector.thicknessMm != null) {
    const wantMm = Math.round(selector.thicknessMm);
    return (
      catalog.find(
        (p) => p.active !== false && Math.round(p.thicknessM * 1000) === wantMm,
      ) ?? null
    );
  }
  return null;
}

export type GazoblokQuoteRequest =
  | { quantity: number }
  | { wall: { lengthM: number; heightM: number; openingsM2?: number; wastePct?: number } };

export interface GazoblokQuotePayload {
  kind: 'gazoblok';
  currency: 'UZS';
  price: number; // the only number the order tool would trust
  productId: string;
  label: string;
  thicknessMm: number;
  unitPrice: number; // UZS per block at quote time
  quantity: number;
  mode: 'quantity' | 'wall';
  wall?: {
    lengthM: number;
    heightM: number;
    openingsM2: number;
    wastePct: number;
    blocksNeeded: number;
  };
  issuedAt: number;
  expiresAt: number;
}

export interface GazoblokQuote {
  quoteId: string;
  price: number;
  currency: 'UZS';
  quantity: number;
  payload: GazoblokQuotePayload;
}

export interface BuildGazoblokQuoteOptions {
  secret: string;
  issuedAt: number;
  validityMs?: number;
}

/**
 * Price a gazoblok order for one size and return it as a signed quote. Throws
 * GazoblokError on invalid input (the caller escalates instead of guessing).
 */
export function buildGazoblokQuote(
  product: CatalogProduct,
  request: GazoblokQuoteRequest,
  opts: BuildGazoblokQuoteOptions,
): GazoblokQuote {
  const unitPrice = product.pricePerBlock;
  const thicknessMm = Math.round(product.thicknessM * 1000);

  let quantity: number;
  let mode: 'quantity' | 'wall';
  let wall: GazoblokQuotePayload['wall'];

  if ('wall' in request) {
    const est = estimateWall(product, {
      lengthM: request.wall.lengthM,
      heightM: request.wall.heightM,
      openingsM2: request.wall.openingsM2,
      wastePct: request.wall.wastePct,
    });
    quantity = est.blocksNeeded;
    mode = 'wall';
    wall = {
      lengthM: request.wall.lengthM,
      heightM: request.wall.heightM,
      openingsM2: request.wall.openingsM2 ?? 0,
      wastePct: est.wastePct,
      blocksNeeded: est.blocksNeeded,
    };
  } else {
    quantity = request.quantity;
    mode = 'quantity';
  }

  // lineTotal validates quantity (non-negative integer) + unitPrice and rounds.
  const price = lineTotal(unitPrice, quantity);

  const issuedAt = opts.issuedAt;
  const expiresAt = issuedAt + (opts.validityMs ?? DEFAULT_VALIDITY_MS);

  const payload: GazoblokQuotePayload = {
    kind: 'gazoblok',
    currency: 'UZS',
    price,
    productId: product.id,
    label: product.label,
    thicknessMm,
    unitPrice,
    quantity,
    mode,
    ...(wall ? { wall } : {}),
    issuedAt,
    expiresAt,
  };

  return {
    quoteId: mintQuoteToken(payload, opts.secret),
    price,
    currency: 'UZS',
    quantity,
    payload,
  };
}
