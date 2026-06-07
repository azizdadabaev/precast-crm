// Approval callback handler (spec §5 / §10) — the staff [Approve]/[Reject] tap.
// A Telegram callback_query lands at the main webhook; this parses it, commits
// or rejects via decidePendingOrder (approve-order.ts), answers the callback,
// edits the card to show the outcome, and on commit sends the customer a warm
// confirmation. Best-effort on each side-effect — one failing send never throws
// out (the webhook must always 200).

import { parseApprovalCallback } from './approval-callback';
import { decidePendingOrder, makeApproveDb, type ApproveDb, type DecideOutcome } from './approve-order';
import type { CreateOrderInput, CreateOrderResult } from '@/lib/create-order';
import {
  tgAnswerCallbackQuery,
  tgEditMessageText,
  tgSendBusinessMessage,
  type InlineButton,
} from '@/lib/telegram/api';

export interface TelegramCallbackQuery {
  id: string;
  data?: string | null;
  message?: { chat?: { id?: number | string }; message_id?: number | string } | null;
  from?: { id?: number | string } | null;
}

export interface ConversationTarget {
  externalId: string;
  businessConnectionId: string | null;
}

export interface ApprovalWebhookDeps {
  secret: string;
  db?: ApproveDb;
  /** Inject a fake createOrder in tests; defaults to the real service. */
  createOrderFn?: (input: CreateOrderInput, actor: { userId: string | null }) => Promise<CreateOrderResult>;
  answer?: (callbackQueryId: string, opts?: { text?: string; showAlert?: boolean }) => Promise<void>;
  editCard?: (chatId: string, messageId: string, text: string, opts?: { inlineKeyboard?: InlineButton[][] }) => Promise<void>;
  sendCustomer?: (businessConnectionId: string, chatId: string, text: string) => Promise<{ messageId: string }>;
  getConversationTarget?: (pendingOrderId: string) => Promise<ConversationTarget | null>;
  now?: Date;
}

export interface ApprovalWebhookResult {
  handled: boolean;
  outcome?: DecideOutcome;
}

async function defaultGetConversationTarget(pendingOrderId: string): Promise<ConversationTarget | null> {
  const { prisma } = await import('@/lib/prisma');
  const po = await prisma.pendingOrder.findUnique({
    where: { id: pendingOrderId },
    select: { conversation: { select: { externalId: true, businessConnectionId: true } } },
  });
  return po?.conversation ? { externalId: po.conversation.externalId, businessConnectionId: po.conversation.businessConnectionId } : null;
}

/** Toast shown on the tapped button + the text the card is rewritten to. */
function outcomeMessages(o: DecideOutcome): { toast: string; card?: string } {
  if (o.ok) {
    switch (o.status) {
      case 'committed':
        return { toast: `✅ Buyurtma №${o.orderNumber}`, card: `✅ Tasdiqlandi · Approved — buyurtma №${o.orderNumber}` };
      case 'rejected':
        return { toast: '❌ Rad etildi · Rejected', card: '❌ Rad etildi · Rejected' };
      case 'noop':
        return { toast: `Allaqachon hal qilingan · Already ${o.current.toLowerCase()}` };
    }
  }
  switch (o.reason) {
    case 'INVALID_QUOTE':
      return { toast: '⚠️ Narx tasdigʻi eskirgan · Quote invalid — escalated' };
    case 'MISSING_CUSTOMER_INFO':
      return { toast: '⚠️ Mijoz maʻlumoti yetarli emas · Missing customer info' };
    case 'NOT_FOUND':
      return { toast: 'Buyurtma topilmadi · Order not found' };
    case 'CREATE_FAILED':
      return { toast: '⚠️ Xatolik · Could not place — try again' };
  }
}

/**
 * Handle one approval callback_query. Returns { handled:false } for any
 * callback_data that isn't a well-formed approval (so unrelated callbacks are
 * ignored). Never throws.
 */
export async function handleApprovalCallback(
  cbq: TelegramCallbackQuery,
  deps: ApprovalWebhookDeps,
): Promise<ApprovalWebhookResult> {
  const answer = deps.answer ?? tgAnswerCallbackQuery;
  const parsed = parseApprovalCallback(cbq.data);
  if (!parsed) {
    await answer(cbq.id).catch(() => {});
    return { handled: false };
  }

  const outcome = await decidePendingOrder(
    parsed,
    { callbackId: cbq.id, decidedById: null }, // the Telegram tapper is not a CRM user → system actor
    { db: deps.db ?? makeApproveDb(), secret: deps.secret, createOrderFn: deps.createOrderFn, now: deps.now },
  );

  const { toast, card } = outcomeMessages(outcome);
  await answer(cbq.id, { text: toast }).catch(() => {});

  // Rewrite the card (drop the buttons) to show the decision — best-effort.
  if (card && cbq.message?.chat?.id != null && cbq.message.message_id != null) {
    const editCard = deps.editCard ?? tgEditMessageText;
    await editCard(String(cbq.message.chat.id), String(cbq.message.message_id), card, { inlineKeyboard: [] }).catch(() => {});
  }

  // On commit, confirm to the customer (business connection) — best-effort.
  if (outcome.ok && outcome.status === 'committed') {
    const getTarget = deps.getConversationTarget ?? defaultGetConversationTarget;
    const target = await getTarget(parsed.pendingOrderId).catch(() => null);
    if (target?.businessConnectionId) {
      const send = deps.sendCustomer ?? tgSendBusinessMessage;
      const text = `Buyurtmangiz qabul qilindi · Your order is confirmed. №${outcome.orderNumber}`;
      await send(target.businessConnectionId, target.externalId, text).catch(() => {});
    }
  }

  return { handled: true, outcome };
}
