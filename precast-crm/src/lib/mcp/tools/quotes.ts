// MCP quote tools for Claude answering Instagram customers (spec 2026-10-07).
//
// Every price and quantity comes from the CRM's own engine (see quote/slab.ts,
// quote/gazoblok.ts). Floor quotes are saved as AI drafts with an immutable
// snapshot; nothing here edits or deletes a draft. Each call is audited with
// source "claude_mcp" and rate-limited to ~60 calls per hour.

import { randomBytes } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadPricingConfig } from '@/lib/pricing-config';
import { recordAudit } from '@/lib/audit';
import { RateLimiter } from '@/lib/agent/rate-limiter';
import { renderAgentQuoteImage } from '@/lib/agent/quote-card-shot';
import { saveBufferToUploads } from '@/lib/uploads';
import { publicBaseUrl } from '@/lib/instagram/config';
import { buildSlabQuote, QuoteInputError, type QuoteErrorCode } from '@/lib/mcp/quote/slab';
import { buildGazoblokQuote } from '@/lib/mcp/quote/gazoblok';
import { cardCaption, gazoblokResponse, slabResponse, withStatus } from '@/lib/mcp/quote/response';
import { draftMatchesSnapshot, normalizeCustomerRef, parseQuoteId, refAllows } from '@/lib/mcp/quote/status';
import {
  gazoblokPriceListVersion,
  loadGazoblokCatalog,
  loadQuote,
  saveGazoblokQuote,
  saveSlabQuote,
  slabPriceListVersion,
} from '@/lib/mcp/quote/store';

const SOURCE = 'claude_mcp';
const BIG = Number.MAX_SAFE_INTEGER;
// One bearer token = one client, so one shared key: ~60 calls per hour.
const limiter = new RateLimiter({
  perMinute: 60, perHour: 60, perUserDailyMessages: BIG,
  globalDailyMessages: BIG, userDailyTokens: BIG, globalDailyTokens: BIG,
});

type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };
type ToolResultShape = { content: ToolContent[]; isError?: boolean };

function ok(summary: string, body: unknown): ToolResultShape {
  return {
    content: [
      { type: 'text', text: summary },
      { type: 'text', text: '```json\n' + JSON.stringify(body, null, 2) + '\n```' },
    ],
  };
}

function fail(error_code: QuoteErrorCode, message: string): ToolResultShape {
  return { content: [{ type: 'text', text: JSON.stringify({ error_code, message }) }], isError: true };
}

function audit(tool: string, metadata: Record<string, unknown>): void {
  void recordAudit({ userId: null, action: `mcp.${tool}`, targetType: 'mcp_quote', metadata: { source: SOURCE, ...metadata } });
}

/** Rate limit + audit + error envelope around one tool body. */
async function guarded(tool: string, args: unknown, body: () => Promise<ToolResultShape>): Promise<ToolResultShape> {
  const gate = limiter.check(SOURCE, 0);
  if (!gate.allowed) {
    audit(tool, { args, error_code: 'RATE_LIMITED' });
    return fail('RATE_LIMITED', `Too many quote calls; try again in ${gate.retryAfterSec ?? 60} seconds.`);
  }
  try {
    const res = await body();
    audit(tool, { args, ok: !res.isError });
    return res;
  } catch (err) {
    if (err instanceof QuoteInputError) {
      audit(tool, { args, error_code: err.code });
      return fail(err.code, err.message);
    }
    console.error(`[MCP ${tool}]`, err);
    audit(tool, { args, error_code: 'PRICING_UNAVAILABLE' });
    return fail('PRICING_UNAVAILABLE', 'Pricing is temporarily unavailable. Please try again shortly.');
  }
}

const money = (n: number) => `${n.toLocaleString('ru-RU')} UZS`;
const lang = z.enum(['uz', 'ru', 'en']).optional().describe('Language for labels and warnings (uz = Latin Uzbek, default)');
const customerRef = z.string().max(80).optional().describe(
  'Always pass the customer\'s Instagram handle. A new quote with the same ref replaces the previous one (older quote becomes "superseded"); ' +
    'a quote saved with a ref can only be read back or rendered with that same ref.',
);
const quoteId = z.string().describe('The quote_id returned by get_quote / get_gazoblok_quote, e.g. "Q-12" (not a CRM draft number)');

/** A quote by id, but only for the customer it was given to. */
async function findQuote(rawId: string, rawRef: string | undefined) {
  const n = parseQuoteId(rawId);
  const q = n ? await loadQuote(n) : null;
  return q && refAllows(q.customerRef, normalizeCustomerRef(rawRef)) ? q : null;
}

export function registerQuoteTools(server: McpServer): void {
  server.tool(
    'get_quote',
    'Price a beam-and-block (yig\'ma monolit) floor for 1–20 rooms from inside wall-to-wall sizes in metres. ' +
      'Prices come from the CRM\'s live price list and engine — never compute prices yourself. ' +
      'By default the beams span the SHORTER wall (orientation "auto"); use "as_given" only when the customer says which walls carry the beams. ' +
      'Rooms whose beam would exceed 6.30 m come back as needs_manual_review and are not priced. ' +
      'Send ALL of a customer\'s rooms in one call: each call replaces that customer\'s previous quote. ' +
      'The quote is saved as an AI draft in the CRM and stays valid until staff withdraw it. Materials only (beams + blocks).',
    {
      rooms: z.array(z.object({
        name: z.string().max(80).optional().describe('e.g. "Zal", "Room 1"'),
        width_m: z.number().describe('Inner wall-to-wall size, metres'),
        length_m: z.number().describe('Inner wall-to-wall size, metres'),
      })).describe('1–20 rooms'),
      bearing_cm: z.number().optional().describe('Beam bearing on each wall, cm (default 15)'),
      orientation: z.enum(['auto', 'as_given']).optional().describe('auto (default) = beams span the shorter wall; as_given = width_m is the beam span'),
      customer_ref: customerRef,
      lang,
    },
    async (args) => guarded('get_quote', args, async () => {
      const pricing = await loadPricingConfig();
      const result = buildSlabQuote(args, pricing);
      const ref = normalizeCustomerRef(args.customer_ref);
      const version = await slabPriceListVersion(pricing);
      if (result.calcs.length === 0) {
        const body = slabResponse(result, { quoteId: null, draftNumber: null, customerRef: ref, createdAt: new Date(), priceListVersion: version, supersedes: null });
        return ok('No room could be priced — see warnings. Nothing was saved.', body);
      }
      const saved = await saveSlabQuote({
        input: args,
        result,
        customerRef: ref,
        priceListVersion: version,
        snapshot: (m) => slabResponse(result, { ...m, customerRef: ref, priceListVersion: version }),
      });
      const body = saved.snapshot as { quote_id: string; draft_number: number };
      return ok(`Quote ${body.quote_id} (CRM draft #${body.draft_number}) — total ${money(result.totals.total_price)}`, body);
    }),
  );

  server.tool(
    'get_gazoblok_quote',
    'Price gazoblok (aerated concrete wall blocks) for one catalog size, from a block count, a volume or a wall area. ' +
      'Priced per size from the CRM catalog. in_stock is yes/no only. Delivery is included only inside Yangiqo\'rg\'on district.',
    {
      size: z.string().optional().describe('Catalog size, e.g. "600x300x200"'),
      thickness_cm: z.number().optional().describe('Wall thickness in cm (alternative to size)'),
      grade: z.string().optional().describe('D500 / D600 / D700 — echoed only; price depends on size'),
      quantity_blocks: z.number().optional(),
      volume_m3: z.number().optional(),
      wall_area_m2: z.number().optional(),
      district: z.string().optional().describe('Delivery district, to say whether delivery is included'),
      customer_ref: customerRef,
      lang,
    },
    async (args) => guarded('get_gazoblok_quote', args, async () => {
      const catalog = await loadGazoblokCatalog();
      const result = buildGazoblokQuote(args, catalog);
      const ref = normalizeCustomerRef(args.customer_ref);
      const version = gazoblokPriceListVersion(catalog);
      const saved = await saveGazoblokQuote({
        input: args,
        customerRef: ref,
        priceListVersion: version,
        snapshot: (m) => gazoblokResponse(result, { ...m, customerRef: ref, priceListVersion: version }),
      });
      const body = saved.snapshot as { quote_id: string };
      return ok(`Quote ${body.quote_id} — ${result.blocks} blocks ${result.size} — total ${money(result.total_price)}`, body);
    }),
  );

  server.tool(
    'get_quote_by_id',
    'Look up a saved quote (e.g. "Q-12") exactly as it was given, with its status: active, superseded (see superseded_by), ordered, or withdrawn.',
    { quote_id: quoteId, customer_ref: customerRef },
    async (args) => guarded('get_quote_by_id', args, async () => {
      const q = await findQuote(args.quote_id, args.customer_ref);
      if (!q) return fail('QUOTE_NOT_FOUND', `No quote ${args.quote_id} for this customer.`);
      const body = withStatus(q.snapshot, q.status, q.supersededBy);
      return ok(`Quote ${args.quote_id} — ${q.status}${q.supersededBy ? ` (replaced by ${q.supersededBy})` : ''}`, body);
    }),
  );

  server.tool(
    'render_quote_image',
    'Render the CRM quote card (the same image the Telegram agent sends) for an active floor quote: the PNG ' +
      'itself plus a download_url to the same file, for attaching it in a chat, and the caption to send with it ' +
      '(word for word, the same three lines staff send with the card on Telegram).',
    { quote_id: quoteId, customer_ref: customerRef },
    async (args) => guarded('render_quote_image', args, async () => {
      const q = await findQuote(args.quote_id, args.customer_ref);
      if (!q) return fail('QUOTE_NOT_FOUND', `No quote ${args.quote_id} for this customer.`);
      if (q.kind !== 'slab') return fail('NOT_AVAILABLE', 'Images are available for floor quotes only.');
      if (q.status === 'withdrawn' || !q.projectId || !q.draft) return fail('QUOTE_WITHDRAWN', `Quote ${args.quote_id} was withdrawn.`);
      if (q.status === 'superseded') {
        return fail('QUOTE_SUPERSEDED', `Quote ${args.quote_id} was replaced by ${q.supersededBy}; render that one instead.`);
      }
      // The card prints the draft's client name, phone and address, and its
      // link is public — once staff have attached a customer, they send it.
      if (q.status === 'ordered' || q.draft.hasClientDetails) {
        return fail('NOT_AVAILABLE', `Quote ${args.quote_id} is being handled by the team; they will send the details.`);
      }
      if (!draftMatchesSnapshot(q.draft, q.snapshot)) {
        return fail('QUOTE_CHANGED', `Staff changed quote ${args.quote_id} in the CRM; it no longer matches what was quoted. Ask the team before sending a card.`);
      }
      const png = await renderAgentQuoteImage(q.projectId);
      // Same file behind an unguessable public link (Caddy serves /uploads), so
      // Claude can attach the card in an Instagram chat (owner/web agent 2026-10-07).
      const path = await saveBufferToUploads(png, 'quote-cards', `${randomBytes(16).toString('hex')}.png`);
      const download_url = `${publicBaseUrl()}${path}`;
      return {
        content: [
          { type: 'image', data: png.toString('base64'), mimeType: 'image/png' },
          { type: 'text', text: '```json\n' + JSON.stringify({ quote_id: args.quote_id, download_url, caption: cardCaption(q.snapshot) }, null, 2) + '\n```' },
        ],
      };
    }),
  );
}
