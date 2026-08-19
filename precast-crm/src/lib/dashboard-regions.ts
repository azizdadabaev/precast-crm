/**
 * Group live orders by PROVINCE (viloyat) for the dashboard's region
 * ranking. Prisma-free so the bucketing is unit-testable, and so the
 * regions catalogue never reaches the client bundle.
 *
 * ── How an address becomes a province ─────────────────────────────────
 * `Client.address` is written by AddressInput as
 * `<Viloyat>, <Tuman>, <street>`, but rows exist in BOTH alphabets
 * («Наманган вилояти, …» and "Namangan viloyati, …") plus a legacy
 * city-only form. `parseAddress` already resolves all three: its
 * `findViloyatByName` / `findTumanByName` lookups match a viloyat by
 * its Latin `name` OR its Cyrillic `nameUz`, and it falls back to the
 * old 14-city catalogue. We therefore key on the canonical LATIN name
 * (stable join key) and carry the Cyrillic `nameUz` for the UI.
 *
 * Anything that resolves to no viloyat — an empty address, a free-text
 * one, a misspelling — lands in the «Бошқа · Other» bucket. Rows are
 * never dropped: Σ orderCount over the returned list always equals the
 * number of rows passed in.
 */

import { findViloyatByName, parseAddress } from '@/lib/regions';

/** Canonical key + label for everything that matched no viloyat. */
export const OTHER_REGION = 'Other';
export const OTHER_REGION_UZ = 'Бошқа';

export interface RegionOrderRow {
  clientId: string;
  address: string | null;
  /** Σ Order.totalPrice for this order — BOOKED, not cash received. */
  booked: number;
}

export interface RegionRow {
  /** Canonical Latin viloyat name, or `Other`. Stable list key. */
  region: string;
  /** Cyrillic name for display, or «Бошқа». */
  regionUz: string;
  orderCount: number;
  /** DISTINCT clients with at least one order in the province. */
  clientCount: number;
  booked: number;
}

/** Resolve one address to `{ region, regionUz }`, falling back to Other. */
function resolveRegion(address: string | null): { region: string; regionUz: string } {
  const viloyat = address ? parseAddress(address).viloyat : '';
  const match = viloyat ? findViloyatByName(viloyat) : null;
  if (!match) return { region: OTHER_REGION, regionUz: OTHER_REGION_UZ };
  return { region: match.name, regionUz: match.nameUz };
}

/**
 * Rank provinces by ORDERS PLACED (descending), booked value as the
 * tie-break. The `topN` highest-ranked named provinces are returned
 * individually; every remaining province is folded into the «Бошқа»
 * row together with the unmatched addresses, so the totals still add up.
 */
export function aggregateByRegion(rows: readonly RegionOrderRow[], topN = 8): RegionRow[] {
  const buckets = new Map<
    string,
    { regionUz: string; orderCount: number; clients: Set<string>; booked: number }
  >();

  for (const row of rows) {
    const { region, regionUz } = resolveRegion(row.address);
    const cur = buckets.get(region) ?? { regionUz, orderCount: 0, clients: new Set<string>(), booked: 0 };
    cur.orderCount += 1;
    cur.clients.add(row.clientId);
    cur.booked += row.booked;
    buckets.set(region, cur);
  }

  const other = buckets.get(OTHER_REGION);
  const named = Array.from(buckets.entries())
    .filter(([region]) => region !== OTHER_REGION)
    .sort((a, b) => b[1].orderCount - a[1].orderCount || b[1].booked - a[1].booked);

  const kept = named.slice(0, topN);
  const folded = named.slice(topN);

  const otherOrders = (other?.orderCount ?? 0) + folded.reduce((s, [, b]) => s + b.orderCount, 0);
  const otherBooked = (other?.booked ?? 0) + folded.reduce((s, [, b]) => s + b.booked, 0);
  const otherClients = new Set<string>(other?.clients ?? []);
  for (const [, b] of folded) for (const id of b.clients) otherClients.add(id);

  const out: RegionRow[] = kept.map(([region, b]) => ({
    region,
    regionUz: b.regionUz,
    orderCount: b.orderCount,
    clientCount: b.clients.size,
    booked: Math.round(b.booked),
  }));

  if (otherOrders > 0) {
    out.push({
      region: OTHER_REGION,
      regionUz: OTHER_REGION_UZ,
      orderCount: otherOrders,
      clientCount: otherClients.size,
      booked: Math.round(otherBooked),
    });
  }

  return out;
}
