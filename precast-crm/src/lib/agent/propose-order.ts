// Propose an order for staff approval (spec §5 notify_staff / §10 Action Card) —
// the "Propose" → staff-card half of the write-action HITL. On a loop
// `request_approval` decision: write the PendingOrder (Plan 06 draft_order —
// price comes ONLY from the verified quote_id), flip it to AWAITING_STAFF (the
// customer has agreed), and post a staff-group card showing RAW facts (not agent
// prose) with [Approve]/[Reject] buttons. The staff tap is committed by
// decidePendingOrder (approve-order.ts). Sends nothing to the customer here.

import { encodeApprovalCallback } from './approval-callback';
import { draftOrder as realDraftOrder, type DraftOrderInput, type DraftOrderResult } from './order-tool';
import type { ApprovalDraft } from './loop';
import type { SlabQuotePayload } from './slab-quote';
import { tgSendMessageWithInlineKeyboard, type InlineButton } from '@/lib/telegram/api';

/** Staff-facing Action Card text — raw order facts, never the agent's prose. */
export function formatActionCard(draft: ApprovalDraft, quote: SlabQuotePayload): string {
  const lines = [
    'Yangi buyurtma · New order — tasdiqlash kerak · needs approval',
    '',
    `Mijoz · Customer: ${draft.customerName ?? '—'}`,
    `Tel: ${draft.customerPhone ?? '—'}`,
    `Manzil · Address: ${draft.deliveryAddress ?? '—'}`,
    '',
    `Pol · Slab: ${quote.pattern}, ${quote.beamCount} × ${quote.beamLength}m balka, ${quote.totalBlocks} blok`,
    `Maydon · Area: ${quote.billedArea} m²`,
    `Narx · Price: ${quote.price} ${quote.currency}`,
  ];
  if (draft.notes) lines.push('', `Izoh · Note: ${draft.notes}`);
  return lines.join('\n');
}

/** [✅ Approve] [❌ Reject] keyed to the pending order id (≤64-byte callback_data). */
export function approvalKeyboard(pendingOrderId: string): InlineButton[][] {
  return [
    [
      { text: '✅ Tasdiqlash · Approve', callback_data: encodeApprovalCallback('approve', pendingOrderId) },
      { text: '❌ Rad etish · Reject', callback_data: encodeApprovalCallback('reject', pendingOrderId) },
    ],
  ];
}

export type ProposeOutcome =
  | { ok: true; pendingOrderId: string; created: boolean }
  | { ok: false; reason: 'INVALID_QUOTE' | 'MISSING_FIELDS' };

export interface ProposeInput {
  draft: ApprovalDraft;
  conversationId: string;
  /** Customer message that triggered the agreement (idempotency key seed). */
  confirmationMsgId: string;
  clientId?: string | null;
}

export interface ProposeDeps {
  secret: string;
  staffChatId: string;
  draftOrder?: (input: DraftOrderInput, deps: { secret: string; now?: number }) => Promise<DraftOrderResult>;
  markAwaitingStaff?: (pendingOrderId: string) => Promise<void>;
  sendCard?: (chatId: string, text: string, keyboard: InlineButton[][]) => Promise<{ messageId: string }>;
  now?: number;
}

async function defaultMarkAwaitingStaff(pendingOrderId: string): Promise<void> {
  const { prisma } = await import('@/lib/prisma');
  // Only advance from the freshly-drafted AWAITING_CUSTOMER (idempotent on retry).
  await prisma.pendingOrder.updateMany({
    where: { id: pendingOrderId, status: 'AWAITING_CUSTOMER' },
    data: { status: 'AWAITING_STAFF' },
  });
}

/**
 * Write the pending order (idempotent, quote_id-verified) and post the staff
 * Action Card. A bad/forged quote → no card, structured failure (caller
 * escalates). Idempotent: a retry of the same confirmation reuses the draft.
 */
export async function proposeOrder(input: ProposeInput, deps: ProposeDeps): Promise<ProposeOutcome> {
  const draftFn = deps.draftOrder ?? realDraftOrder;
  const res = await draftFn(
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
  if (!res.ok) return { ok: false, reason: res.reason };

  const po = res.pendingOrder;
  await (deps.markAwaitingStaff ?? defaultMarkAwaitingStaff)(po.id);

  const text = formatActionCard(input.draft, po.payload.quote);
  const send = deps.sendCard ?? tgSendMessageWithInlineKeyboard;
  await send(deps.staffChatId, text, approvalKeyboard(po.id));

  return { ok: true, pendingOrderId: po.id, created: res.created };
}
