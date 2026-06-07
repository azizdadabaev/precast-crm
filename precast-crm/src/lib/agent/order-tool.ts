// The order tool (`draft_order`) — spec §5 / §6 guardrail 3.
//
// This is the FIRST node of the write-action HITL state machine
// (Propose → Customer-confirm → Staff-approve → Commit). It writes a
// PendingOrder whose price is carried ONLY by a verified `quote_id`: the tool
// re-verifies the token with verifyQuoteToken, so a tampered / forged / expired
// price is rejected and the agent must re-quote or escalate — it can never
// write a free-text price into a pending order. The real Order is created later
// (Plan 08 approval webhook → createOrder) when status flips to APPROVED.
//
// Idempotency (spec §5): the PendingOrder's unique key is
// sha256(conversationId + ":" + confirmation_msg_id), written with
// ON CONFLICT DO NOTHING — a webhook retry can never duplicate a draft.

import { createHash } from 'crypto';
import { verifyQuoteToken, type VerifyQuoteOptions } from './quote-token';
import type { SlabQuotePayload } from './slab-quote';

/** sha256(conversationId + ":" + confirmationMsgId), hex — the exact formula
 *  fixed by spec §5. The PendingOrder's unique idempotency key: a retry of the
 *  same customer confirmation maps to the same key, so the write is a no-op the
 *  second time. The ":" delimiter is unambiguous because both inputs are
 *  colon-free in practice (conversationId is a CUID, confirmationMsgId is a
 *  numeric Telegram message id). */
export function idempotencyKey(conversationId: string, confirmationMsgId: string): string {
  return createHash('sha256').update(`${conversationId}:${confirmationMsgId}`).digest('hex');
}

export interface DraftOrderInput {
  /** The ONLY source of price — a signed quote token (Plan 04). */
  quoteId: string;
  conversationId: string;
  /** The customer message that triggered the draft; seeds the idempotency key. */
  confirmationMsgId: string;
  clientId?: string | null;
  /** Read-back context for the staff Action Card (raw facts, not agent prose). */
  customerName?: string | null;
  customerPhone?: string | null;
  deliveryAddress?: string | null;
  notes?: string | null;
}

/** The PendingOrder fields the draft fills in (DB-shape, no generated columns).
 *  `status` is omitted here — it defaults to AWAITING_CUSTOMER in the schema. */
export interface PendingOrderDraft {
  conversationId: string;
  clientId: string | null;
  quoteId: string;
  idempotencyKey: string;
  /** Stored as PendingOrder.payload JSON. The price lives ONLY inside the
   *  verified `quote` snapshot — there is no free-text price field. */
  payload: {
    quote: SlabQuotePayload;
    customerName: string | null;
    customerPhone: string | null;
    deliveryAddress: string | null;
    notes: string | null;
  };
}

export type BuildDraftResult =
  | { ok: true; draft: PendingOrderDraft }
  | { ok: false; reason: 'MISSING_FIELDS' | 'INVALID_QUOTE' };

/**
 * Pure core: verify the quote_id and assemble the PendingOrder draft.
 * Returns INVALID_QUOTE for any untrusted token (tampered / forged / expired /
 * malformed) so the caller escalates or re-quotes rather than inventing a price.
 */
export function buildPendingOrderDraft(
  input: DraftOrderInput,
  secret: string,
  opts?: VerifyQuoteOptions,
): BuildDraftResult {
  if (!input.quoteId || !input.conversationId || !input.confirmationMsgId) {
    return { ok: false, reason: 'MISSING_FIELDS' };
  }
  const quote = verifyQuoteToken<SlabQuotePayload>(input.quoteId, secret, opts);
  if (!quote) return { ok: false, reason: 'INVALID_QUOTE' };

  return {
    ok: true,
    draft: {
      conversationId: input.conversationId,
      clientId: input.clientId ?? null,
      quoteId: input.quoteId,
      idempotencyKey: idempotencyKey(input.conversationId, input.confirmationMsgId),
      payload: {
        quote,
        customerName: input.customerName ?? null,
        customerPhone: input.customerPhone ?? null,
        deliveryAddress: input.deliveryAddress ?? null,
        notes: input.notes ?? null,
      },
    },
  };
}

/** The row shape passed to the DB on create (payload is JSON). */
export interface PendingOrderRow {
  conversationId: string;
  clientId: string | null;
  quoteId: string;
  idempotencyKey: string;
  payload: PendingOrderDraft['payload'];
}

/** A narrow structural subset of PrismaClient — only what draftOrder needs.
 *  Defaulting to the real `prisma` keeps callers simple; a fake makes the
 *  idempotency path unit-testable without a database. */
export interface DraftOrderDb {
  pendingOrder: {
    createMany(args: {
      data: PendingOrderRow[];
      skipDuplicates: boolean;
    }): Promise<{ count: number }>;
    findUnique(args: {
      where: { idempotencyKey: string };
    }): Promise<(PendingOrderRow & { id: string }) | null>;
  };
}

export type DraftOrderResult =
  | { ok: true; pendingOrder: PendingOrderRow & { id: string }; created: boolean }
  | { ok: false; reason: 'MISSING_FIELDS' | 'INVALID_QUOTE' };

export interface DraftOrderDeps {
  secret: string;
  db?: DraftOrderDb;
  /** Forwarded to verifyQuoteToken (expiry clock); defaults to Date.now(). */
  now?: number;
}

/**
 * Thin DB shell: build the draft, then write it idempotently.
 * `createMany({ skipDuplicates: true })` is Postgres ON CONFLICT DO NOTHING, so
 * a retry of the same confirmation neither duplicates the row nor bumps
 * `updatedAt`; the canonical row (new or pre-existing) is then read back.
 */
export async function draftOrder(
  input: DraftOrderInput,
  deps: DraftOrderDeps,
): Promise<DraftOrderResult> {
  const built = buildPendingOrderDraft(input, deps.secret, { now: deps.now });
  if (!built.ok) return built;

  const { draft } = built;
  const row: PendingOrderRow = {
    conversationId: draft.conversationId,
    clientId: draft.clientId,
    quoteId: draft.quoteId,
    idempotencyKey: draft.idempotencyKey,
    payload: draft.payload,
  };

  // Lazy import so unit tests that pass a fake `db` never load the Prisma client.
  const db = deps.db ?? ((await import('@/lib/prisma')).prisma as unknown as DraftOrderDb);

  const { count } = await db.pendingOrder.createMany({ data: [row], skipDuplicates: true });
  const pendingOrder = await db.pendingOrder.findUnique({
    where: { idempotencyKey: draft.idempotencyKey },
  });
  if (!pendingOrder) {
    // Unreachable in practice (we just inserted or it already existed), but keep
    // the type honest rather than asserting non-null.
    throw new Error('draftOrder: pending order vanished after upsert');
  }
  return { ok: true, pendingOrder, created: count === 1 };
}
