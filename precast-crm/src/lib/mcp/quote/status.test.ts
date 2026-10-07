import { describe, it, expect } from 'vitest';
import { formatQuoteId, parseQuoteId, quoteStatus } from './status';

describe('quote ids', () => {
  it('formats as Q-<number>', () => {
    expect(formatQuoteId(12)).toBe('Q-12');
  });
  it('accepts the forms a person or Claude might send back', () => {
    for (const s of ['Q-12', 'Q12', 'q-12', '#12', '12', ' Q 12 ']) expect(parseQuoteId(s)).toBe(12);
  });
  it('rejects anything else', () => {
    for (const s of ['', 'Q-', 'abc', 'Q-1.5', '0', '-3']) expect(parseQuoteId(s)).toBeNull();
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
