import { describe, it, expect } from 'vitest';
import {
  decidePendingOrder,
  pendingOrderToCreateInput,
  type ApproveDb,
  type PendingOrderRecord,
  type PendingOrderPayload,
} from './approve-order';
import { buildSlabQuote } from './slab-quote';
import type { CreateOrderResult } from '@/lib/create-order';

const SECRET = 'quote-secret';
const ISSUED = 1_700_000_000_000;

function record(over: Partial<PendingOrderRecord> = {}, payloadOver: Partial<PendingOrderPayload> = {}): PendingOrderRecord {
  const quote = buildSlabQuote({ inner_width: 4, inner_length: 5 }, { secret: SECRET, issuedAt: ISSUED });
  return {
    id: 'po1',
    conversationId: 'c1',
    clientId: null,
    quoteId: quote.quoteId,
    status: 'AWAITING_STAFF',
    orderId: null,
    payload: { quote: quote.payload, customerName: 'Akmal', customerPhone: '998901112233', deliveryAddress: 'Tashkent', notes: null, ...payloadOver },
    ...over,
  };
}

function fakeDb(initial: PendingOrderRecord | null, opts: { claim?: boolean; reject?: boolean } = {}) {
  const calls: string[] = [];
  let current = initial;
  const db: ApproveDb = {
    async getPendingOrder() { calls.push('get'); return current; },
    async claimApproval() { calls.push('claim'); const won = opts.claim ?? true; if (won && current) current = { ...current, status: 'APPROVED' }; return won; },
    async linkOrder(_id, orderId) { calls.push(`link:${orderId}`); if (current) current = { ...current, orderId }; },
    async revertApproval() { calls.push('revert'); if (current) current = { ...current, status: 'AWAITING_STAFF' }; },
    async rejectPending() { calls.push('reject'); const won = opts.reject ?? true; if (won && current) current = { ...current, status: 'REJECTED' }; return won; },
    async setConversationHumanActive(cid) { calls.push(`human:${cid}`); },
  };
  return { db, calls };
}

const okCreate = async () => ({ ok: true, order: { id: 'o1', orderNumber: '2026-06-0007' } }) as unknown as CreateOrderResult;
const failCreate = async () => ({ ok: false, error: { code: 'PHONE_REQUIRED', message: 'phone is required', status: 422 } }) as CreateOrderResult;
const NOW = new Date(ISSUED + 1000);

describe('pendingOrderToCreateInput', () => {
  it('maps the verified quote dims to a room and stamps placeholder costs/date', () => {
    const quote = buildSlabQuote({ inner_width: 4, inner_length: 5, bearing: 0.2 }, { secret: SECRET, issuedAt: ISSUED });
    const input = pendingOrderToCreateInput(
      { quote: quote.payload, customerName: 'Akmal', customerPhone: '998901112233', deliveryAddress: 'Tashkent', notes: 'urgent' },
      { scheduledAt: NOW },
    );
    expect(input.clientName).toBe('Akmal');
    expect(input.clientPhone).toBe('998901112233');
    expect(input.clientAddress).toBe('Tashkent');
    expect(input.rooms).toHaveLength(1);
    expect(input.rooms[0]).toMatchObject({ innerWidth: 4, innerLength: 5, bearing: 0.2, m2PriceOverride: false });
    expect(input.scheduledAt).toBe(NOW);
    expect(input.notes).toBe('urgent');
    expect(input).toMatchObject({ discountPercent: 0, discountAmount: 0, deliveryCost: 0, otherCost: 0, paidAmount: 0 });
  });
});

describe('decidePendingOrder — approve', () => {
  it('commits a real order on a valid approval and links it', async () => {
    const { db, calls } = fakeDb(record());
    const r = await decidePendingOrder({ action: 'approve', pendingOrderId: 'po1' }, { callbackId: 'cb1', decidedById: 'u1' }, { db, secret: SECRET, createOrderFn: okCreate, now: NOW });
    expect(r).toEqual({ ok: true, status: 'committed', orderId: 'o1', orderNumber: '2026-06-0007' });
    expect(calls).toContain('claim');
    expect(calls).toContain('link:o1');
  });

  it('is an idempotent no-op when already approved (no second claim/order)', async () => {
    const { db, calls } = fakeDb(record({ status: 'APPROVED', orderId: 'oX' }));
    const r = await decidePendingOrder({ action: 'approve', pendingOrderId: 'po1' }, { callbackId: 'cb2', decidedById: 'u1' }, { db, secret: SECRET, createOrderFn: okCreate, now: NOW });
    expect(r).toEqual({ ok: true, status: 'noop', current: 'APPROVED' });
    expect(calls).not.toContain('claim');
  });

  it('rejects a forged quote_id without claiming', async () => {
    const forged = buildSlabQuote({ inner_width: 4, inner_length: 5 }, { secret: 'attacker', issuedAt: ISSUED });
    const { db, calls } = fakeDb(record({ quoteId: forged.quoteId }));
    const r = await decidePendingOrder({ action: 'approve', pendingOrderId: 'po1' }, { callbackId: 'cb', decidedById: 'u1' }, { db, secret: SECRET, createOrderFn: okCreate, now: NOW });
    expect(r).toMatchObject({ ok: false, reason: 'INVALID_QUOTE' });
    expect(calls).not.toContain('claim');
  });

  it('commits an EXPIRED-but-authentic quote (provenance, not freshness)', async () => {
    const quote = buildSlabQuote({ inner_width: 4, inner_length: 5 }, { secret: SECRET, issuedAt: ISSUED, validityMs: 1000 });
    const { db } = fakeDb(record({ quoteId: quote.quoteId }, { quote: quote.payload }));
    const r = await decidePendingOrder({ action: 'approve', pendingOrderId: 'po1' }, { callbackId: 'cb', decidedById: 'u1' }, { db, secret: SECRET, createOrderFn: okCreate, now: new Date(ISSUED + 10 * 60 * 60 * 1000) });
    expect(r).toMatchObject({ ok: true, status: 'committed' });
  });

  it('blocks when customer info is missing, without claiming', async () => {
    const { db, calls } = fakeDb(record({}, { customerPhone: null }));
    const r = await decidePendingOrder({ action: 'approve', pendingOrderId: 'po1' }, { callbackId: 'cb', decidedById: 'u1' }, { db, secret: SECRET, createOrderFn: okCreate, now: NOW });
    expect(r).toMatchObject({ ok: false, reason: 'MISSING_CUSTOMER_INFO' });
    expect(calls).not.toContain('claim');
  });

  it('is a no-op when the atomic claim is lost (another tap won the race)', async () => {
    const { db, calls } = fakeDb(record(), { claim: false });
    const r = await decidePendingOrder({ action: 'approve', pendingOrderId: 'po1' }, { callbackId: 'cb', decidedById: 'u2' }, { db, secret: SECRET, createOrderFn: okCreate, now: NOW });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe('noop');
    expect(calls).not.toContain('link:o1');
  });

  it('reverts the claim and reports CREATE_FAILED when createOrder fails', async () => {
    const { db, calls } = fakeDb(record());
    const r = await decidePendingOrder({ action: 'approve', pendingOrderId: 'po1' }, { callbackId: 'cb', decidedById: 'u1' }, { db, secret: SECRET, createOrderFn: failCreate, now: NOW });
    expect(r).toMatchObject({ ok: false, reason: 'CREATE_FAILED', message: 'phone is required' });
    expect(calls).toContain('claim');
    expect(calls).toContain('revert');
  });

  it('commits EXACTLY ONE order under two concurrent taps (atomic claim)', async () => {
    // Shared db whose claim succeeds once, then loses.
    const calls: string[] = [];
    let current: PendingOrderRecord | null = record();
    let claimed = false;
    const db: ApproveDb = {
      async getPendingOrder() { return current; },
      async claimApproval() { if (claimed) return false; claimed = true; if (current) current = { ...current, status: 'APPROVED' }; return true; },
      async linkOrder(_id, orderId) { calls.push(`link:${orderId}`); if (current) current = { ...current, orderId }; },
      async revertApproval() { calls.push('revert'); },
      async rejectPending() { return false; },
      async setConversationHumanActive() {},
    };
    let creates = 0;
    const createOnce = async () => { creates++; return { ok: true, order: { id: 'o1', orderNumber: 'N1' } } as unknown as CreateOrderResult; };
    const cb = { action: 'approve' as const, pendingOrderId: 'po1' };
    const [a, b] = await Promise.all([
      decidePendingOrder(cb, { callbackId: 'cbA', decidedById: 'u1' }, { db, secret: SECRET, createOrderFn: createOnce, now: NOW }),
      decidePendingOrder(cb, { callbackId: 'cbB', decidedById: 'u2' }, { db, secret: SECRET, createOrderFn: createOnce, now: NOW }),
    ]);
    const statuses = [a, b].map((r) => (r.ok ? r.status : 'err')).sort();
    expect(statuses).toEqual(['committed', 'noop']);
    expect(creates).toBe(1);
    expect(calls.filter((c) => c.startsWith('link:'))).toHaveLength(1);
  });

  it('reverts the claim when createOrder THROWS (not just returns an error)', async () => {
    const { db, calls } = fakeDb(record());
    const throwCreate = async () => { throw new Error('P2002 order number race'); };
    const r = await decidePendingOrder({ action: 'approve', pendingOrderId: 'po1' }, { callbackId: 'cb', decidedById: 'u1' }, { db, secret: SECRET, createOrderFn: throwCreate, now: NOW });
    expect(r).toMatchObject({ ok: false, reason: 'CREATE_FAILED' });
    expect(calls).toContain('revert');
  });

  it('returns NOT_FOUND for an unknown pending order', async () => {
    const { db } = fakeDb(null);
    const r = await decidePendingOrder({ action: 'approve', pendingOrderId: 'gone' }, { callbackId: 'cb', decidedById: 'u1' }, { db, secret: SECRET, createOrderFn: okCreate, now: NOW });
    expect(r).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});

describe('decidePendingOrder — reject', () => {
  it('rejects and hands the conversation to a human', async () => {
    const { db, calls } = fakeDb(record());
    const r = await decidePendingOrder({ action: 'reject', pendingOrderId: 'po1' }, { callbackId: 'cb', decidedById: 'u1' }, { db, secret: SECRET, now: NOW });
    expect(r).toEqual({ ok: true, status: 'rejected' });
    expect(calls).toContain('human:c1');
  });

  it('is a no-op when the reject claim is lost (already decided)', async () => {
    const { db, calls } = fakeDb(record(), { reject: false });
    const r = await decidePendingOrder({ action: 'reject', pendingOrderId: 'po1' }, { callbackId: 'cb', decidedById: 'u1' }, { db, secret: SECRET, now: NOW });
    expect(r).toMatchObject({ ok: true, status: 'noop' });
    expect(calls).not.toContain('human:c1');
  });
});
