import { describe, it, expect } from 'vitest';
import { aggregateByRegion, OTHER_REGION, type RegionOrderRow } from './dashboard-regions';

const row = (clientId: string, address: string | null, booked = 0): RegionOrderRow => ({
  clientId,
  address,
  booked,
});

describe('aggregateByRegion — province bucketing', () => {
  it('matches an address stored in Cyrillic', () => {
    const out = aggregateByRegion([row('c1', 'Наманган вилояти, Чортоқ тумани, Марказ 1')]);
    expect(out).toHaveLength(1);
    expect(out[0]!.region).toBe('Namangan viloyati');
    expect(out[0]!.regionUz).toBe('Наманган вилояти');
  });

  it('matches the same province stored in Latin and merges the two forms', () => {
    const out = aggregateByRegion([
      row('c1', 'Наманган вилояти, Чортоқ тумани, Марказ 1', 1000),
      row('c2', 'Namangan viloyati, Chortoq tumani, Markaz 2', 500),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.orderCount).toBe(2);
    expect(out[0]!.clientCount).toBe(2);
    expect(out[0]!.booked).toBe(1500);
  });

  it('resolves a bare tuman prefix to its parent province', () => {
    const out = aggregateByRegion([row('c1', 'Чортоқ тумани, Марказ 1')]);
    expect(out[0]!.region).toBe('Namangan viloyati');
  });

  it('counts orders, not clients', () => {
    const out = aggregateByRegion([
      row('c1', 'Andijon viloyati, A', 100),
      row('c1', 'Andijon viloyati, B', 200),
      row('c1', 'Andijon viloyati, C', 300),
    ]);
    expect(out[0]!.orderCount).toBe(3);
    expect(out[0]!.clientCount).toBe(1);
  });

  it('ranks by order count descending, not by booked value', () => {
    const out = aggregateByRegion([
      row('c1', 'Andijon viloyati, A', 1),
      row('c2', 'Andijon viloyati, B', 1),
      row('c3', 'Buxoro viloyati, C', 9_000_000),
    ]);
    expect(out.map((r) => r.region)).toEqual(['Andijon viloyati', 'Buxoro viloyati']);
  });

  it('buckets unmatched and empty addresses into Other rather than dropping them', () => {
    const out = aggregateByRegion([
      row('c1', null, 10),
      row('c2', 'какой-то свободный текст', 20),
      row('c3', '', 30),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.region).toBe(OTHER_REGION);
    expect(out[0]!.regionUz).toBe('Бошқа');
    expect(out[0]!.orderCount).toBe(3);
    expect(out[0]!.booked).toBe(60);
  });

  it('folds provinces past topN into Other and never loses a row', () => {
    const rows: RegionOrderRow[] = [
      row('a', 'Andijon viloyati, x', 5),
      row('a', 'Andijon viloyati, x', 5),
      row('b', 'Buxoro viloyati, x', 4),
      row('c', 'Jizzax viloyati, x', 3),
      row('d', null, 1),
    ];
    const out = aggregateByRegion(rows, 2);
    expect(out.map((r) => r.region)).toEqual(['Andijon viloyati', 'Buxoro viloyati', OTHER_REGION]);
    const other = out[2]!;
    // Jizzax (1 order) + the unmatched row.
    expect(other.orderCount).toBe(2);
    expect(other.booked).toBe(4);
    expect(out.reduce((s, r) => s + r.orderCount, 0)).toBe(rows.length);
  });

  it('omits the Other row when everything matched', () => {
    const out = aggregateByRegion([row('c1', 'Xorazm viloyati, x')]);
    expect(out.some((r) => r.region === OTHER_REGION)).toBe(false);
  });
});
