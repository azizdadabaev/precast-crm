import { describe, it, expect } from 'vitest';
import { handleApprovalCallback, type ApprovalWebhookDeps } from './approval-webhook';
import type { ApproveDb, PendingOrderRecord } from './approve-order';
import { buildSlabQuote } from './slab-quote';
import type { CreateOrderResult } from '@/lib/create-order';

const SECRET = 'quote-secret';
const ISSUED = 1_700_000_000_000;

function record(): PendingOrderRecord {
  const q = buildSlabQuote({ inner_width: 4, inner_length: 5 }, { secret: SECRET, issuedAt: ISSUED });
  return {
    id: 'po1', conversationId: 'c1', clientId: null, quoteId: q.quoteId, status: 'AWAITING_STAFF', orderId: null,
    payload: { quote: q.payload, customerName: 'Akmal', customerPhone: '998901112233', deliveryAddress: 'Tashkent', notes: null },
  };
}

function fakeDb(opts: { claim?: boolean; reject?: boolean } = {}): ApproveDb {
  let current: PendingOrderRecord | null = record();
  return {
    async getPendingOrder() { return current; },
    async claimApproval() { const w = opts.claim ?? true; if (w && current) current = { ...current, status: 'APPROVED' }; return w; },
    async linkOrder(_i, orderId) { if (current) current = { ...current, orderId }; },
    async revertApproval() { if (current) current = { ...current, status: 'AWAITING_STAFF' }; },
    async rejectPending() { const w = opts.reject ?? true; if (w && current) current = { ...current, status: 'REJECTED' }; return w; },
    async setConversationHumanActive() {},
  };
}

const okCreate = async () => ({ ok: true, order: { id: 'o1', orderNumber: '2026-06-0007' } }) as unknown as CreateOrderResult;

function harness(over: Partial<ApprovalWebhookDeps> = {}) {
  const calls: string[] = [];
  const deps: ApprovalWebhookDeps = {
    secret: SECRET,
    db: fakeDb(),
    createOrderFn: okCreate,
    now: new Date(ISSUED + 1000),
    answer: async (_id, opts) => { calls.push(`answer:${opts?.text ?? ''}`); },
    editCard: async (_c, _m, text) => { calls.push(`edit:${text.slice(0, 12)}`); },
    sendCustomer: async () => { calls.push('customer'); return { messageId: 'm' }; },
    getConversationTarget: async () => ({ externalId: '55', businessConnectionId: 'bc1' }),
    ...over,
  };
  return { deps, calls };
}

const cbq = (data: string | null) => ({ id: 'cb1', data, message: { chat: { id: -100999 }, message_id: 7 } });

describe('handleApprovalCallback', () => {
  it('ignores a non-approval callback (answers, handled:false)', async () => {
    const { deps, calls } = harness();
    const r = await handleApprovalCallback(cbq('something:else:99'), deps);
    expect(r.handled).toBe(false);
    expect(calls).toEqual(['answer:']); // answered with no toast, nothing else
  });

  it('commits on approve: toast + card edit + customer confirmation', async () => {
    const { deps, calls } = harness();
    const r = await handleApprovalCallback(cbq('approve:po1'), deps);
    expect(r.outcome).toMatchObject({ ok: true, status: 'committed', orderNumber: '2026-06-0007' });
    expect(calls.some((c) => c.startsWith('answer:✅'))).toBe(true);
    expect(calls.some((c) => c.startsWith('edit:'))).toBe(true);
    expect(calls).toContain('customer');
  });

  it('rejects: toast + card edit, NO customer confirmation', async () => {
    const { deps, calls } = harness();
    const r = await handleApprovalCallback(cbq('reject:po1'), deps);
    expect(r.outcome).toMatchObject({ ok: true, status: 'rejected' });
    expect(calls.some((c) => c.startsWith('edit:❌'))).toBe(true);
    expect(calls).not.toContain('customer');
  });

  it('does not confirm to the customer when the commit fails (forged quote)', async () => {
    // forged quote → INVALID_QUOTE, no commit, no customer send, no card rewrite
    const forged = buildSlabQuote({ inner_width: 4, inner_length: 5 }, { secret: 'attacker', issuedAt: ISSUED });
    let cur: PendingOrderRecord | null = { ...record(), quoteId: forged.quoteId };
    const db: ApproveDb = {
      async getPendingOrder() { return cur; },
      async claimApproval() { return true; },
      async linkOrder() {},
      async revertApproval() {},
      async rejectPending() { return true; },
      async setConversationHumanActive() {},
    };
    const { deps, calls } = harness({ db });
    const r = await handleApprovalCallback(cbq('approve:po1'), deps);
    expect(r.outcome).toMatchObject({ ok: false, reason: 'INVALID_QUOTE' });
    expect(calls.some((c) => c.startsWith('answer:⚠️'))).toBe(true);
    expect(calls).not.toContain('customer');
  });
});
