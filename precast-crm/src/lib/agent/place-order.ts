// Place an order from an agent request_approval proposal — the inbox-UI half of
// the write-action HITL (Plan 09 Slice C Step 4, decision c: a logged-in CRM
// operator approves in /inbox, not an anonymous Telegram tap).
//
// It wires the dormant chain in ONE operator action: draftOrder writes the
// PendingOrder from the verified quote_id (price never free-text), it is flipped
// to AWAITING_STAFF (the customer agreed — that's what request_approval means),
// and decidePendingOrder commits a real Order via the Plan 06 createOrder service
// with the OPERATOR as the actor + decidedById. Idempotent + race-safe via the
// pieces it composes (draftOrder's idempotency key, decidePendingOrder's atomic
// claim). Posts no Telegram card — the approval already happened in the inbox.

import { draftOrder as realDraftOrder, type DraftOrderInput, type DraftOrderResult } from './order-tool';
import {
  decidePendingOrder as realDecide,
  makeApproveDb,
  type ApproveDb,
  type DecideDeps,
  type DecideOutcome,
} from './approve-order';
import type { ApprovalCallback } from './approval-callback';
import type { ApprovalDraft } from './loop';

export interface PlaceOrderInput {
  /** quote_id + customer details the agent gathered (proposal.approvalDraft). */
  draft: ApprovalDraft;
  conversationId: string;
  /** The inbound message that triggered the request_approval (idempotency seed). */
  confirmationMsgId: string;
  clientId?: string | null;
  /** The logged-in operator who approved — recorded as decidedById + Order actor. */
  decidedById: string;
}

export type PlaceOrderResult = DecideOutcome | { ok: false; reason: 'INVALID_QUOTE' | 'MISSING_FIELDS' };

export interface PlaceOrderDeps {
  secret: string;
  now?: number;
  // Injectables for unit tests (default to the real services).
  draftOrderFn?: (input: DraftOrderInput, deps: { secret: string; now?: number }) => Promise<DraftOrderResult>;
  markAwaitingStaff?: (pendingOrderId: string) => Promise<void>;
  decideFn?: (callback: ApprovalCallback, tap: { callbackId: string | null; decidedById: string | null }, deps: DecideDeps) => Promise<DecideOutcome>;
  approveDb?: ApproveDb;
}

/** Advance the freshly-drafted PendingOrder to AWAITING_STAFF (idempotent). */
async function defaultMarkAwaitingStaff(pendingOrderId: string): Promise<void> {
  const { prisma } = await import('@/lib/prisma');
  await prisma.pendingOrder.updateMany({
    where: { id: pendingOrderId, status: 'AWAITING_CUSTOMER' },
    data: { status: 'AWAITING_STAFF' },
  });
}

export async function placeOrderFromProposal(input: PlaceOrderInput, deps: PlaceOrderDeps): Promise<PlaceOrderResult> {
  const drafted = await (deps.draftOrderFn ?? realDraftOrder)(
    {
      quoteId: input.draft.quoteId,
      conversationId: input.conversationId,
      confirmationMsgId: input.confirmationMsgId,
      clientId: input.clientId,
      customerName: input.draft.customerName,
      customerPhone: input.draft.customerPhone,
      deliveryAddress: input.draft.deliveryAddress,
      notes: input.draft.notes,
    },
    { secret: deps.secret, now: deps.now },
  );
  if (!drafted.ok) return { ok: false, reason: drafted.reason };

  await (deps.markAwaitingStaff ?? defaultMarkAwaitingStaff)(drafted.pendingOrder.id);

  return (deps.decideFn ?? realDecide)(
    { action: 'approve', pendingOrderId: drafted.pendingOrder.id },
    { callbackId: null, decidedById: input.decidedById },
    { db: deps.approveDb ?? makeApproveDb(), secret: deps.secret, now: deps.now != null ? new Date(deps.now) : undefined },
  );
}

/** Brief factual order confirmation for the customer, in their detected language
 *  (spec §10: Approve → createOrder + customer confirmation). Not agent prose. */
export function orderConfirmationMessage(language: string, orderNumber: string): string {
  switch (language) {
    case 'ru':
      return `Ваш заказ принят ✅ (№ ${orderNumber}). Наша команда свяжется с вами в ближайшее время.`;
    case 'uz-cyrillic':
      return `Буюртмангиз қабул қилинди ✅ (№ ${orderNumber}). Жамоамиз тез орада сиз билан боғланади.`;
    default: // uz-latin (market default)
      return `Buyurtmangiz qabul qilindi ✅ (№ ${orderNumber}). Jamoamiz tez orada siz bilan bog'lanadi.`;
  }
}
