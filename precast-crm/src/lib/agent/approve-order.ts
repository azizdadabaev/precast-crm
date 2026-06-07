// Approval commit/reject — the write-action HITL terminal step (spec §6.3 / §10).
//
// A staff [Approve]/[Reject] tap on the Action Card lands as a Telegram
// callback_query (routed in Plan 08 Task 6). `decidePendingOrder` turns that tap
// into the final write: APPROVE re-verifies the quote_id's PROVENANCE (signature,
// expiry ignored — the order is re-priced live at placement), maps the pending
// order to a CreateOrderInput, and commits a real Order via the Plan 06
// `createOrder` service with a service-account actor (userId = the staff
// approver). REJECT flips the conversation to HUMAN_ACTIVE. Both are idempotent
// and race-safe: the AWAITING→APPROVED/REJECTED transition is an atomic claim, so
// a double-tap (or two staff racing) commits exactly one Order.

import { createOrder as realCreateOrder, type CreateOrderInput, type CreateOrderResult } from '@/lib/create-order';
import type { ApprovalCallback } from './approval-callback';
import { verifyQuoteToken } from './quote-token';
import type { SlabQuotePayload } from './slab-quote';

export type PendingStatus = 'AWAITING_CUSTOMER' | 'AWAITING_STAFF' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

/** The PendingOrder.payload written by draft_order (order-tool.ts). */
export interface PendingOrderPayload {
  quote: SlabQuotePayload;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  notes: string | null;
}

export interface PendingOrderRecord {
  id: string;
  conversationId: string;
  clientId: string | null;
  quoteId: string;
  payload: PendingOrderPayload;
  status: PendingStatus;
  orderId: string | null;
}

type RoomInput = CreateOrderInput['rooms'][number];

/** Map the quote's signed SlabInput snapshot → a placement room. */
function slabInputToRoom(input: SlabQuotePayload['input']): RoomInput {
  return {
    name: null,
    innerWidth: input.inner_width,
    innerLength: input.inner_length,
    bearing: input.bearing ?? 0.15,
    correction: input.correction ?? 0,
    extraBeams: input.extra_beams ?? 0,
    forceStartBeam: input.force_start_beam ?? false,
    patternOverride: input.pattern ?? null,
    m2PriceOverride: false,
    m2PriceOverrideValue: null,
    m2PriceReason: null,
  };
}

/**
 * Build a CreateOrderInput from an approved pending order. The rooms come from
 * the quote's cryptographically-verified dimension snapshot (pass the VERIFIED
 * payload). `createOrder` re-prices these rooms with live pricing at placement —
 * the frozen quote price is not reused, so a price config change since the quote
 * is reflected and staff see the real total. Customer name/phone/address must be
 * present (guarded by the caller).
 *
 * `scheduledAt` is a PLACEHOLDER (the approval moment): the bot never commits a
 * delivery date (spec), so staff set the real delivery date on the order page.
 */
export function pendingOrderToCreateInput(
  payload: PendingOrderPayload,
  opts: { scheduledAt: Date },
): CreateOrderInput {
  return {
    clientName: payload.customerName ?? '',
    clientPhone: payload.customerPhone ?? '',
    clientAddress: payload.deliveryAddress ?? '',
    shapeType: 'RECTANGULAR',
    rooms: [slabInputToRoom(payload.quote.input)],
    discountPercent: 0,
    discountAmount: 0,
    deliveryCost: 0,
    otherCost: 0,
    scheduledAt: opts.scheduledAt,
    notes: payload.notes ?? null,
    paidAmount: 0,
  };
}

export type DecideOutcome =
  | { ok: true; status: 'committed'; orderId: string; orderNumber: string }
  | { ok: true; status: 'rejected' }
  | { ok: true; status: 'noop'; current: PendingStatus } // already decided (idempotent re-tap)
  | { ok: false; reason: 'NOT_FOUND' | 'INVALID_QUOTE' | 'MISSING_CUSTOMER_INFO' | 'CREATE_FAILED'; message?: string };

/** Narrow DB surface — injectable so the decision orchestration is unit-tested
 *  without a database. The real implementation (makeApproveDb) makes the
 *  AWAITING→APPROVED/REJECTED transition atomic. */
export interface ApproveDb {
  getPendingOrder(id: string): Promise<PendingOrderRecord | null>;
  /** Atomically claim AWAITING_* → APPROVED, stamping the tap. True iff this call won. */
  claimApproval(id: string, callbackId: string | null, decidedById: string | null, decidedAt: Date): Promise<boolean>;
  /** Link the committed real Order after createOrder succeeds. */
  linkOrder(id: string, orderId: string): Promise<void>;
  /** Revert a claimed-but-failed approval back to AWAITING_STAFF so staff can retry. */
  revertApproval(id: string): Promise<void>;
  /** Atomically claim AWAITING_* → REJECTED. True iff this call won. */
  rejectPending(id: string, callbackId: string | null, decidedById: string | null, decidedAt: Date): Promise<boolean>;
  /** On reject, hand the chat to a human. */
  setConversationHumanActive(conversationId: string): Promise<void>;
}

export interface DecideDeps {
  db: ApproveDb;
  /** QUOTE_SIGNING_SECRET — provenance check on the quote_id. */
  secret: string;
  /** Inject a fake createOrder in tests; defaults to the real service. */
  createOrderFn?: (input: CreateOrderInput, actor: { userId: string | null }) => Promise<CreateOrderResult>;
  /** Decision time; defaults to new Date(). */
  now?: Date;
}

/**
 * Commit or reject a pending order from a staff Approval tap. Idempotent and
 * race-safe via the atomic claim; a quote that fails provenance, or missing
 * customer info, blocks the commit without claiming.
 */
export async function decidePendingOrder(
  callback: ApprovalCallback,
  tap: { callbackId: string | null; decidedById: string | null },
  deps: DecideDeps,
): Promise<DecideOutcome> {
  const now = deps.now ?? new Date();
  const po = await deps.db.getPendingOrder(callback.pendingOrderId);
  if (!po) return { ok: false, reason: 'NOT_FOUND' };

  if (callback.action === 'reject') {
    const won = await deps.db.rejectPending(po.id, tap.callbackId, tap.decidedById, now);
    if (!won) return { ok: true, status: 'noop', current: po.status };
    await deps.db.setConversationHumanActive(po.conversationId);
    return { ok: true, status: 'rejected' };
  }

  // approve — already committed? idempotent no-op.
  if (po.status === 'APPROVED' && po.orderId) return { ok: true, status: 'noop', current: po.status };

  // Provenance: a tampered/forged quote_id never commits. Expiry is ignored —
  // the order is re-priced live, and the staff SLA can exceed the 24h validity.
  const quote = verifyQuoteToken<SlabQuotePayload>(po.quoteId, deps.secret, { ignoreExpiry: true });
  if (!quote || quote.kind !== 'slab') return { ok: false, reason: 'INVALID_QUOTE' };

  if (!po.payload.customerName || !po.payload.customerPhone || !po.payload.deliveryAddress) {
    return { ok: false, reason: 'MISSING_CUSTOMER_INFO' };
  }

  // Claim AFTER the cheap guards so a bad quote never flips status.
  const claimed = await deps.db.claimApproval(po.id, tap.callbackId, tap.decidedById, now);
  if (!claimed) {
    const fresh = await deps.db.getPendingOrder(po.id);
    return { ok: true, status: 'noop', current: fresh?.status ?? po.status };
  }

  const input = pendingOrderToCreateInput({ ...po.payload, quote }, { scheduledAt: now });
  const create = deps.createOrderFn ?? realCreateOrder;
  // Any failure — a returned error OR a thrown exception (Prisma tx P2002,
  // in-tx PROJECT_NOT_FOUND, DB errors) — must revert the claim, or the row is
  // left permanently APPROVED with no Order.
  try {
    const result = await create(input, { userId: tap.decidedById });
    if (!result.ok) {
      await deps.db.revertApproval(po.id);
      return { ok: false, reason: 'CREATE_FAILED', message: result.error.message };
    }
    await deps.db.linkOrder(po.id, result.order.id);
    return { ok: true, status: 'committed', orderId: result.order.id, orderNumber: result.order.orderNumber };
  } catch (err) {
    await deps.db.revertApproval(po.id);
    return { ok: false, reason: 'CREATE_FAILED', message: err instanceof Error ? err.message : 'order placement failed' };
  }
}

/** Real Prisma-backed ApproveDb. The AWAITING→APPROVED/REJECTED transitions use
 *  conditional updateMany so concurrent taps resolve to exactly one winner. */
export function makeApproveDb(): ApproveDb {
  // Approve is only valid AFTER the customer has confirmed (AWAITING_STAFF);
  // reject may cancel from either pre-decision state (spec §6.3 state machine).
  const REJECTABLE: PendingStatus[] = ['AWAITING_CUSTOMER', 'AWAITING_STAFF'];
  return {
    async getPendingOrder(id) {
      const { prisma } = await import('@/lib/prisma');
      const row = await prisma.pendingOrder.findUnique({ where: { id } });
      if (!row) return null;
      return {
        id: row.id,
        conversationId: row.conversationId,
        clientId: row.clientId,
        quoteId: row.quoteId,
        payload: row.payload as unknown as PendingOrderPayload,
        status: row.status as PendingStatus,
        orderId: row.orderId,
      };
    },
    async claimApproval(id, callbackId, decidedById, decidedAt) {
      const { prisma } = await import('@/lib/prisma');
      const r = await prisma.pendingOrder.updateMany({
        where: { id, status: 'AWAITING_STAFF' },
        data: { status: 'APPROVED', telegramCallbackId: callbackId, decidedById, decidedAt },
      });
      return r.count === 1;
    },
    async linkOrder(id, orderId) {
      const { prisma } = await import('@/lib/prisma');
      await prisma.pendingOrder.update({ where: { id }, data: { orderId } });
    },
    async revertApproval(id) {
      const { prisma } = await import('@/lib/prisma');
      await prisma.pendingOrder.update({ where: { id }, data: { status: 'AWAITING_STAFF' } });
    },
    async rejectPending(id, callbackId, decidedById, decidedAt) {
      const { prisma } = await import('@/lib/prisma');
      const r = await prisma.pendingOrder.updateMany({
        where: { id, status: { in: REJECTABLE } },
        data: { status: 'REJECTED', telegramCallbackId: callbackId, decidedById, decidedAt },
      });
      return r.count === 1;
    },
    async setConversationHumanActive(conversationId) {
      const { prisma } = await import('@/lib/prisma');
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { aiState: 'HUMAN_ACTIVE', aiPaused: true },
      });
    },
  };
}
