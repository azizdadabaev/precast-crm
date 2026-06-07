// get_quote — the slab (beam-and-block flooring) price tool (spec §5).
//
// THE KEYSTONE of the price-integrity chain: it wraps the pure calculator with
// the LIVE PriceConfig and the QUOTE_SIGNING_SECRET to mint a signed quote_id.
// That quote_id is exactly what the Plan 06 order tool (draft_order) re-verifies
// before writing a PendingOrder — so a price reaches an order only via a token
// minted here from live config. The model is FORCED to call this on price turns
// (Plan 08), so it physically cannot emit a slab price first (spec §4.2 layer 1).

import { z } from 'zod';
import {
  CalculationError,
  type PriceConfig,
} from '@/services/calculation-engine';
import { loadPricingConfig } from '@/lib/pricing-config';
import { buildSlabQuote } from '@/lib/agent/slab-quote';
import {
  type AgentTool,
  type AgentToolContext,
  type AgentToolDefinition,
  type ToolResult,
  toolOk,
  toolEscalate,
} from './types';

const DEFAULT_VALIDITY_MS = 24 * 60 * 60 * 1000; // 24h — matches buildSlabQuote

// Numeric min/max live in code, not the JSON schema, so the schema stays
// strict-friendly (spec §4.2 layer 3 — plausibility checks run server-side).
export const GetQuoteInput = z.object({
  inner_width: z.coerce.number().positive(),
  inner_length: z.coerce.number().positive(),
  bearing: z.coerce.number().min(0).optional(),
  correction: z.coerce.number().optional(),
  extra_beams: z.coerce.number().int().min(0).optional(),
  force_start_beam: z.coerce.boolean().optional(),
  pattern: z.enum(['GB', 'BGB', 'GBG']).optional(),
});
export type GetQuoteInputType = z.infer<typeof GetQuoteInput>;

export interface QuoteData {
  subtotal: number;
  m2_price: number;
  pattern: string;
  bill_of_materials: {
    beams: { count: number; lengthM: number };
    blockRows: number;
    totalBlocks: number;
    billedAreaM2: number;
  };
  quote_id: string;
  currency: 'UZS';
  validity_ts: number; // ms epoch the quote_id expires at
}

export interface GetQuoteDeps {
  pricing: PriceConfig;
  secret: string;
  now: number;
  validityMs?: number;
}

/**
 * Pure core: validate dimensions, price via buildSlabQuote, map to the tool's
 * output shape. Any failure (bad dims, missing secret, calculator error) returns
 * an escalation — never a guessed or partial price.
 */
export function runGetQuote(raw: unknown, deps: GetQuoteDeps): ToolResult<QuoteData> {
  const parsed = GetQuoteInput.safeParse(raw);
  if (!parsed.success) {
    return toolEscalate('invalid dimensions — re-confirm inner width and length in meters');
  }
  if (!deps.secret) {
    return toolEscalate('quote signing unavailable (QUOTE_SIGNING_SECRET unset)');
  }

  const i = parsed.data;
  let quote;
  try {
    quote = buildSlabQuote(
      {
        inner_width: i.inner_width,
        inner_length: i.inner_length,
        bearing: i.bearing,
        correction: i.correction,
        extra_beams: i.extra_beams,
        force_start_beam: i.force_start_beam,
        pattern: i.pattern,
      },
      {
        secret: deps.secret,
        issuedAt: deps.now,
        validityMs: deps.validityMs ?? DEFAULT_VALIDITY_MS,
        priceConfig: deps.pricing,
      },
    );
  } catch (err) {
    if (err instanceof CalculationError) {
      return toolEscalate(`cannot price these dimensions: ${err.message}`);
    }
    throw err;
  }

  const p = quote.payload;
  return toolOk({
    subtotal: quote.price,
    m2_price: p.m2Price,
    pattern: p.pattern,
    bill_of_materials: {
      beams: { count: p.beamCount, lengthM: p.beamLength },
      blockRows: p.blockRows,
      totalBlocks: p.totalBlocks,
      billedAreaM2: p.billedArea,
    },
    quote_id: quote.quoteId,
    currency: 'UZS',
    validity_ts: p.expiresAt,
  });
}

export const getQuoteDefinition: AgentToolDefinition = {
  name: 'get_quote',
  description:
    'Price a beam-and-block (precast) FLOORING slab for one room and return a ' +
    'binding quote_id. Input the inside-wall dimensions in METERS (wall-to-wall). ' +
    'Returns subtotal, m²-price, pattern, a bill of materials, and a signed ' +
    'quote_id (UZS) — this quote_id is REQUIRED to later draft an order. ' +
    'Does NOT cover: gazoblok wall blocks (use get_gazoblok_quote), delivery ' +
    'dates or costs, discounts, or non-standard / irregular / multi-level shapes. ' +
    'If the dimensions are unclear or the job is non-standard, escalate instead of guessing.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['inner_width', 'inner_length'],
    properties: {
      inner_width: { type: 'number', description: 'Inside-wall width, perpendicular to beams (meters).' },
      inner_length: { type: 'number', description: 'Inside-wall length, parallel to beams (meters).' },
      bearing: { type: 'number', description: 'Beam bearing onto each wall (meters). Default 0.15.' },
      correction: { type: 'number', description: 'Length adjustment before pitch math (meters). Default 0.' },
      extra_beams: { type: 'integer', description: 'Manual extra beams. Default 0.' },
      force_start_beam: { type: 'boolean', description: 'Force a starting beam (promotes GB→BGB). Default false.' },
      pattern: { type: 'string', enum: ['GB', 'BGB', 'GBG'], description: 'Explicit pattern override; omit to auto-pick.' },
    },
  },
};

export const getQuoteTool: AgentTool<QuoteData> = {
  definition: getQuoteDefinition,
  async execute(rawInput, ctx?: AgentToolContext) {
    const pricing = await loadPricingConfig();
    const secret = process.env.QUOTE_SIGNING_SECRET ?? '';
    const now = ctx?.now ?? Date.now();
    return runGetQuote(rawInput, { pricing, secret, now });
  },
};
