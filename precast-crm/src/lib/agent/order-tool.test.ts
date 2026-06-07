import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import {
  idempotencyKey,
  buildPendingOrderDraft,
  draftOrder,
  type DraftOrderInput,
  type DraftOrderDb,
  type PendingOrderRow,
} from './order-tool';
import { buildSlabQuote } from './slab-quote';
import { mintQuoteToken } from './quote-token';

const SECRET = 'quote-secret-key';
const ISSUED = 1_700_000_000_000;

function validQuoteId(secret = SECRET): string {
  return buildSlabQuote({ inner_width: 4, inner_length: 5 }, { secret, issuedAt: ISSUED }).quoteId;
}

function input(overrides: Partial<DraftOrderInput> = {}): DraftOrderInput {
  return {
    quoteId: validQuoteId(),
    conversationId: 'conv_1',
    confirmationMsgId: 'msg_42',
    clientId: 'client_1',
    customerName: 'Akmal',
    customerPhone: '998901234567',
    deliveryAddress: 'Tashkent',
    notes: null,
    ...overrides,
  };
}

describe('idempotencyKey', () => {
  it('is a stable 64-char hex sha256 of conversationId:confirmationMsgId', () => {
    const k = idempotencyKey('conv_1', 'msg_42');
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(idempotencyKey('conv_1', 'msg_42')).toBe(k); // stable
  });

  it('differs for different conversation or message ids', () => {
    expect(idempotencyKey('conv_1', 'msg_42')).not.toBe(idempotencyKey('conv_2', 'msg_42'));
    expect(idempotencyKey('conv_1', 'msg_42')).not.toBe(idempotencyKey('conv_1', 'msg_43'));
  });

  it('matches the exact spec §5 formula: sha256(conversationId + ":" + msgId)', () => {
    // Pin the contract: a future approval handler must derive the same key.
    const expected = createHash('sha256').update('conv_1:msg_42').digest('hex');
    expect(idempotencyKey('conv_1', 'msg_42')).toBe(expected);
  });
});

describe('buildPendingOrderDraft', () => {
  it('accepts a valid quote and carries the trusted price only inside the verified snapshot', () => {
    const quote = buildSlabQuote({ inner_width: 4, inner_length: 5 }, { secret: SECRET, issuedAt: ISSUED });
    const res = buildPendingOrderDraft(input({ quoteId: quote.quoteId }), SECRET, { now: ISSUED });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.draft.payload.quote.price).toBe(quote.price);
    expect(res.draft.quoteId).toBe(quote.quoteId);
    expect(res.draft.idempotencyKey).toBe(idempotencyKey('conv_1', 'msg_42'));
    expect(res.draft.clientId).toBe('client_1');
    // No free-text price field anywhere on the payload — price lives only in `quote`.
    expect(Object.keys(res.draft.payload).sort()).toEqual(
      ['customerName', 'customerPhone', 'deliveryAddress', 'notes', 'quote'].sort(),
    );
  });

  it('rejects a quote signed with a different secret (forged price → INVALID_QUOTE)', () => {
    const res = buildPendingOrderDraft(input({ quoteId: validQuoteId('attacker-secret') }), SECRET, { now: ISSUED });
    expect(res).toEqual({ ok: false, reason: 'INVALID_QUOTE' });
  });

  it('rejects an expired quote (now ≥ expiresAt → INVALID_QUOTE)', () => {
    const quote = buildSlabQuote(
      { inner_width: 4, inner_length: 5 },
      { secret: SECRET, issuedAt: ISSUED, validityMs: 1000 },
    );
    const res = buildPendingOrderDraft(input({ quoteId: quote.quoteId }), SECRET, { now: ISSUED + 2000 });
    expect(res).toEqual({ ok: false, reason: 'INVALID_QUOTE' });
  });

  it('rejects a malformed quote token', () => {
    const res = buildPendingOrderDraft(input({ quoteId: 'not-a-token' }), SECRET, { now: ISSUED });
    expect(res).toEqual({ ok: false, reason: 'INVALID_QUOTE' });
  });

  it('rejects a valid token of the WRONG kind (a gazoblok quote can not draft a slab order)', () => {
    // Signed with the SAME secret, but kind:'gazoblok' — must not pass as a slab quote.
    const gazoblokToken = mintQuoteToken(
      { kind: 'gazoblok', price: 500_000, expiresAt: ISSUED + 60_000 },
      SECRET,
    );
    const res = buildPendingOrderDraft(input({ quoteId: gazoblokToken }), SECRET, { now: ISSUED });
    expect(res).toEqual({ ok: false, reason: 'INVALID_QUOTE' });
  });

  it('returns MISSING_FIELDS when a required field is empty', () => {
    expect(buildPendingOrderDraft(input({ quoteId: '' }), SECRET).ok).toBe(false);
    expect(buildPendingOrderDraft(input({ conversationId: '' }), SECRET)).toEqual({
      ok: false,
      reason: 'MISSING_FIELDS',
    });
    expect(buildPendingOrderDraft(input({ confirmationMsgId: '' }), SECRET)).toEqual({
      ok: false,
      reason: 'MISSING_FIELDS',
    });
  });

  it('defaults optional context fields to null', () => {
    const res = buildPendingOrderDraft(
      { quoteId: validQuoteId(), conversationId: 'c', confirmationMsgId: 'm' },
      SECRET,
      { now: ISSUED },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.draft.clientId).toBeNull();
    expect(res.draft.payload.customerName).toBeNull();
    expect(res.draft.payload.deliveryAddress).toBeNull();
  });
});

// A minimal in-memory fake of the Prisma pendingOrder API, enforcing the
// unique idempotencyKey so we can prove ON CONFLICT DO NOTHING behavior.
function fakeDb(): DraftOrderDb & { rows: (PendingOrderRow & { id: string })[] } {
  const rows: (PendingOrderRow & { id: string })[] = [];
  return {
    rows,
    pendingOrder: {
      async createMany({ data, skipDuplicates }) {
        let count = 0;
        for (const r of data) {
          const exists = rows.some((x) => x.idempotencyKey === r.idempotencyKey);
          if (exists) {
            if (!skipDuplicates) throw new Error('unique violation');
            continue;
          }
          rows.push({ ...r, id: `po_${rows.length + 1}` });
          count++;
        }
        return { count };
      },
      async findUnique({ where }) {
        return rows.find((x) => x.idempotencyKey === where.idempotencyKey) ?? null;
      },
    },
  };
}

describe('draftOrder (idempotent write)', () => {
  it('creates on first call and is a no-op on a retry of the same confirmation', async () => {
    const db = fakeDb();
    const first = await draftOrder(input(), { secret: SECRET, db, now: ISSUED });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.created).toBe(true);

    // Retry: same conversation + confirmation message id → same idempotency key.
    const second = await draftOrder(input(), { secret: SECRET, db, now: ISSUED });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.created).toBe(false); // skipDuplicates hit — no duplicate row
    expect(second.pendingOrder.id).toBe(first.pendingOrder.id);
    expect(db.rows).toHaveLength(1);
  });

  it('does not touch the DB when the quote is invalid', async () => {
    const db = fakeDb();
    const res = await draftOrder(input({ quoteId: validQuoteId('attacker-secret') }), {
      secret: SECRET,
      db,
      now: ISSUED,
    });
    expect(res).toEqual({ ok: false, reason: 'INVALID_QUOTE' });
    expect(db.rows).toHaveLength(0);
  });
});
