// get_gazoblok_quote — the gazoblok (aerated wall-block) price tool (spec §5).
//
// Parallels get_quote for the block line: loads the LIVE catalog, resolves the
// requested size, prices it with buildGazoblokQuote, and returns a signed
// quote_id. The catalog may be empty or missing the requested size → structured
// not-found → escalate, NEVER invent a size or price (spec §5).

import { z } from 'zod';
import { GazoblokError } from '@/services/gazoblok-engine';
import {
  buildGazoblokQuote,
  resolveGazoblokProduct,
  type CatalogProduct,
} from '@/lib/agent/gazoblok-quote';
import {
  type AgentTool,
  type AgentToolContext,
  type AgentToolDefinition,
  type ToolResult,
  toolOk,
  toolEscalate,
} from './types';

const DEFAULT_VALIDITY_MS = 24 * 60 * 60 * 1000;

export const GetGazoblokQuoteInput = z
  .object({
    product_id: z.string().optional(),
    thickness_mm: z.coerce.number().positive().optional(),
    quantity: z.coerce.number().int().positive().optional(),
    wall: z
      .object({
        length_m: z.coerce.number().positive(),
        height_m: z.coerce.number().positive(),
        openings_m2: z.coerce.number().min(0).optional(),
        waste_pct: z.coerce.number().min(0).optional(),
      })
      .optional(),
  })
  .refine((v) => !!v.product_id || v.thickness_mm != null, {
    message: 'specify product_id or thickness_mm',
  })
  .refine((v) => v.quantity != null || v.wall != null, {
    message: 'specify quantity or wall dimensions',
  })
  .refine((v) => !(v.quantity != null && v.wall != null), {
    message: 'specify quantity OR wall dimensions, not both',
  });
export type GetGazoblokQuoteInputType = z.infer<typeof GetGazoblokQuoteInput>;

export interface GazoblokQuoteData {
  price: number;
  unit_price: number;
  quantity: number;
  label: string;
  thickness_mm: number;
  mode: 'quantity' | 'wall';
  quote_id: string;
  currency: 'UZS';
  validity_ts: number;
}

export interface GetGazoblokQuoteDeps {
  catalog: CatalogProduct[];
  secret: string;
  now: number;
  validityMs?: number;
}

/**
 * Pure core: validate the request, resolve the size from the live catalog, and
 * mint a signed gazoblok quote. Empty catalog / unknown size / missing secret /
 * bad quantity all escalate — never a guessed price.
 */
export function runGetGazoblokQuote(
  raw: unknown,
  deps: GetGazoblokQuoteDeps,
): ToolResult<GazoblokQuoteData> {
  const parsed = GetGazoblokQuoteInput.safeParse(raw);
  if (!parsed.success) {
    return toolEscalate('invalid gazoblok request — need a size and a quantity or wall dimensions');
  }
  if (!deps.secret) {
    return toolEscalate('quote signing unavailable (QUOTE_SIGNING_SECRET unset)');
  }
  if (deps.catalog.length === 0) {
    return toolEscalate('gazoblok catalog is empty — escalate, do not invent a price');
  }

  const i = parsed.data;
  const product = resolveGazoblokProduct(deps.catalog, {
    productId: i.product_id,
    thicknessMm: i.thickness_mm,
  });
  if (!product) {
    return toolEscalate('no gazoblok size matches the request — escalate, do not invent a size');
  }

  const request = i.wall
    ? {
        wall: {
          lengthM: i.wall.length_m,
          heightM: i.wall.height_m,
          openingsM2: i.wall.openings_m2,
          wastePct: i.wall.waste_pct,
        },
      }
    : { quantity: i.quantity as number };

  let quote;
  try {
    quote = buildGazoblokQuote(product, request, {
      secret: deps.secret,
      issuedAt: deps.now,
      validityMs: deps.validityMs ?? DEFAULT_VALIDITY_MS,
    });
  } catch (err) {
    if (err instanceof GazoblokError) {
      return toolEscalate(`cannot price this gazoblok request: ${err.message}`);
    }
    throw err;
  }

  const p = quote.payload;
  return toolOk({
    price: quote.price,
    unit_price: p.unitPrice,
    quantity: p.quantity,
    label: p.label,
    thickness_mm: p.thicknessMm,
    mode: p.mode,
    quote_id: quote.quoteId,
    currency: 'UZS',
    validity_ts: p.expiresAt,
  });
}

/** Load the active gazoblok catalog, coercing Prisma Decimals to numbers. */
async function loadGazoblokCatalog(): Promise<CatalogProduct[]> {
  const { prisma } = await import('@/lib/prisma');
  const rows = await prisma.gazoblokProduct.findMany({
    where: { active: true },
    orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    lengthM: Number(r.lengthM),
    heightM: Number(r.heightM),
    thicknessM: Number(r.thicknessM),
    pricePerBlock: Number(r.pricePerBlock),
    active: r.active,
  }));
}

export const getGazoblokQuoteDefinition: AgentToolDefinition = {
  name: 'get_gazoblok_quote',
  description:
    'Price GAZOBLOK aerated-concrete WALL BLOCKS and return a binding quote_id. ' +
    'Pick a size by wall thickness in millimetres (thickness_mm) or by product_id, ' +
    'then give either a block quantity or wall dimensions (length_m × height_m, ' +
    'minus openings_m2) to estimate the count. Returns price, unit price, quantity, ' +
    'and a signed quote_id (UZS). Does NOT cover: beam-and-block flooring (use ' +
    'get_quote), delivery dates or costs, or custom densities. If no size matches ' +
    'or the catalog is empty, escalate — never invent a size or price.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      product_id: { type: 'string', description: 'Exact catalog product id (optional if thickness_mm given).' },
      thickness_mm: { type: 'number', description: 'Wall thickness in millimetres to select a block size.' },
      quantity: { type: 'integer', description: 'Number of blocks (use this OR wall).' },
      wall: {
        type: 'object',
        additionalProperties: false,
        required: ['length_m', 'height_m'],
        properties: {
          length_m: { type: 'number', description: 'Wall length (meters).' },
          height_m: { type: 'number', description: 'Wall height (meters).' },
          openings_m2: { type: 'number', description: 'Doors/windows area to subtract (m²). Default 0.' },
          waste_pct: { type: 'number', description: 'Cutting-waste margin (%). Default 5.' },
        },
      },
    },
  },
};

export const getGazoblokQuoteTool: AgentTool<GazoblokQuoteData> = {
  definition: getGazoblokQuoteDefinition,
  async execute(rawInput, ctx?: AgentToolContext) {
    const catalog = await loadGazoblokCatalog();
    const secret = process.env.QUOTE_SIGNING_SECRET ?? '';
    const now = ctx?.now ?? Date.now();
    return runGetGazoblokQuote(rawInput, { catalog, secret, now });
  },
};
