import { describe, it, expect } from 'vitest';
import { draftMatchesSnapshot, formatQuoteId, normalizeCustomerRef, parseQuoteId, quoteStatus, refAllows } from './status';

describe('quote ids', () => {
  it('formats as Q-<number>', () => {
    expect(formatQuoteId(12)).toBe('Q-12');
  });
  it('accepts the Q forms a person or Claude might send back', () => {
    for (const s of ['Q-12', 'Q12', 'q-12', ' Q 12 ']) expect(parseQuoteId(s)).toBe(12);
  });
  it('rejects a bare number or "#n" — those look like CRM draft numbers and would open another quote', () => {
    for (const s of ['', 'Q-', 'abc', 'Q-1.5', 'Q-0', '-3', '12', '#12', '0575D']) expect(parseQuoteId(s)).toBeNull();
  });
});

describe('quoteStatus', () => {
  const slab = { kind: 'slab', projectId: 'p1', supersededById: null, projectStatus: 'DRAFT' };
  it('a live floor quote is active', () => {
    expect(quoteStatus(slab)).toBe('active');
  });
  it('deleting the draft withdraws it — and that wins over everything', () => {
    expect(quoteStatus({ ...slab, projectId: null, projectStatus: null })).toBe('withdrawn');
    expect(quoteStatus({ ...slab, projectId: null, projectStatus: null, supersededById: 'x' })).toBe('withdrawn');
  });
  it('a newer quote for the same customer supersedes it', () => {
    expect(quoteStatus({ ...slab, supersededById: 'q2' })).toBe('superseded');
  });
  it('a draft turned into an order reads as ordered', () => {
    expect(quoteStatus({ ...slab, projectStatus: 'ORDERED' })).toBe('ordered');
  });
  it('gazoblok quotes have no draft and stay active unless superseded', () => {
    expect(quoteStatus({ kind: 'gazoblok', projectId: null, supersededById: null, projectStatus: null })).toBe('active');
    expect(quoteStatus({ kind: 'gazoblok', projectId: null, supersededById: 'g2', projectStatus: null })).toBe('superseded');
  });
});

describe('customer reference', () => {
  it('normalises a handle: trims, drops "@", lowercases', () => {
    expect(normalizeCustomerRef('  @Davron_Aka ')).toBe('davron_aka');
    expect(normalizeCustomerRef('')).toBeNull();
    expect(normalizeCustomerRef(undefined)).toBeNull();
  });
  it("a quote saved for a customer is only visible with that customer's ref", () => {
    expect(refAllows('davron', 'davron')).toBe(true);
    expect(refAllows('davron', 'other')).toBe(false);
    expect(refAllows('davron', null)).toBe(false);
    expect(refAllows(null, null)).toBe(true);
    expect(refAllows(null, 'anyone')).toBe(true);
  });
});

describe('draftMatchesSnapshot', () => {
  const snap = { rooms: [{ status: 'priced' }, { status: 'needs_manual_review' }, { status: 'priced' }], totals: { total_price: 7000000 } };
  it('true while the draft still holds exactly the quoted rooms and price', () => {
    expect(draftMatchesSnapshot({ subtotals: [3000000, 4000000], discountPercent: 0, discountAmount: 0 }, snap)).toBe(true);
  });
  it('false after staff changed a price, a room or added a discount', () => {
    expect(draftMatchesSnapshot({ subtotals: [3000000, 4100000], discountPercent: 0, discountAmount: 0 }, snap)).toBe(false);
    expect(draftMatchesSnapshot({ subtotals: [7000000], discountPercent: 0, discountAmount: 0 }, snap)).toBe(false);
    expect(draftMatchesSnapshot({ subtotals: [3000000, 4000000], discountPercent: 5, discountAmount: 0 }, snap)).toBe(false);
  });
});
