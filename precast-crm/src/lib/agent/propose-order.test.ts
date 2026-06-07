import { describe, it, expect } from 'vitest';
import { formatActionCard, approvalKeyboard, proposeOrder, type ProposeDeps } from './propose-order';
import type { ApprovalDraft } from './loop';
import { buildSlabQuote } from './slab-quote';
import type { DraftOrderInput, DraftOrderResult } from './order-tool';
import type { InlineButton } from '@/lib/telegram/api';

const SECRET = 'quote-secret';
const ISSUED = 1_700_000_000_000;
const quote = buildSlabQuote({ inner_width: 4, inner_length: 5 }, { secret: SECRET, issuedAt: ISSUED }).payload;
const draft: ApprovalDraft = { quoteId: 'q1', customerName: 'Akmal', customerPhone: '998901112233', deliveryAddress: 'Tashkent', notes: 'asap' };

describe('formatActionCard', () => {
  it('shows raw customer + order facts (not agent prose)', () => {
    const text = formatActionCard(draft, quote);
    expect(text).toContain('Akmal');
    expect(text).toContain('998901112233');
    expect(text).toContain('Tashkent');
    expect(text).toContain(String(quote.price));
    expect(text).toContain('asap');
  });
});

describe('approvalKeyboard', () => {
  it('encodes approve/reject callback_data for the pending order id', () => {
    const kb = approvalKeyboard('po1');
    expect(kb[0][0].callback_data).toBe('approve:po1');
    expect(kb[0][1].callback_data).toBe('reject:po1');
  });
});

function deps(over: Partial<ProposeDeps> = {}) {
  const calls: string[] = [];
  let card: { chatId: string; text: string; kb: InlineButton[][] } | undefined;
  const base: ProposeDeps = {
    secret: SECRET,
    staffChatId: '-100999',
    draftOrder: async () =>
      ({ ok: true, created: true, pendingOrder: { id: 'po1', conversationId: 'c1', clientId: null, quoteId: 'q1', idempotencyKey: 'k', payload: { quote, customerName: 'Akmal', customerPhone: '998901112233', deliveryAddress: 'Tashkent', notes: 'asap' } } }) as unknown as DraftOrderResult,
    markAwaitingStaff: async () => { calls.push('awaitingStaff'); },
    sendCard: async (chatId, text, kb) => { calls.push('card'); card = { chatId, text, kb }; return { messageId: 'm1' }; },
    ...over,
  };
  return { deps: base, calls, getCard: () => card };
}

describe('proposeOrder', () => {
  it('drafts, advances to AWAITING_STAFF, and posts the staff card', async () => {
    const { deps: d, calls, getCard } = deps();
    const r = await proposeOrder({ draft, conversationId: 'c1', confirmationMsgId: 'msg42' }, d);
    expect(r).toEqual({ ok: true, pendingOrderId: 'po1', created: true });
    expect(calls).toEqual(['awaitingStaff', 'card']);
    expect(getCard()!.chatId).toBe('-100999');
    expect(getCard()!.kb[0][0].callback_data).toBe('approve:po1');
  });

  it('does NOT post a card when the quote is invalid (caller escalates)', async () => {
    const draftOrder: ProposeDeps['draftOrder'] = async (_i: DraftOrderInput) => ({ ok: false, reason: 'INVALID_QUOTE' });
    const { deps: d, calls } = deps({ draftOrder });
    const r = await proposeOrder({ draft, conversationId: 'c1', confirmationMsgId: 'msg42' }, d);
    expect(r).toEqual({ ok: false, reason: 'INVALID_QUOTE' });
    expect(calls).toEqual([]); // no status change, no card
  });
});
