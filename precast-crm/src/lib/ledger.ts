// Attribution ledger — where each number the dashboard shows actually landed.
//
// The dashboard reports monthly totals, but several dates are involved in
// getting a figure into a month, and they do not always agree:
//
//   MONEY   counts on `paidOn` if recorded, else `confirmedAt` — which is
//           stamped when the row is ENTERED, not when the customer paid.
//   VOLUME  counts on the truck's `loadedAt` for quantities that were entered,
//           and on the order's `deliveredAt` for the unrecorded balance of a
//           delivered order.
//
// So an order placed in July can put cash in August and beam-metres in both
// months at once. This module turns those attributions into rows the owner can
// read, and flags the ones that landed outside their order's own month.

export type LedgerKind = 'money' | 'volume';

export interface LedgerRow {
  id: string;
  kind: LedgerKind;
  orderId: string;
  orderNumber: string;
  clientName: string;
  /** `YYYY-MM` the order itself belongs to (by `placedAt`). */
  orderMonth: string;
  /** `YYYY-MM` this figure was COUNTED in. */
  attributedMonth: string;
  /** The instant behind `attributedMonth`. */
  attributedAt: string;
  /** Why it counted on that date, in Uzbek. */
  reason: string;
  /** Money rows only. */
  amount?: number;
  /** Volume rows only. */
  blocks?: number;
  beamCount?: number;
  beamMeters?: number;
  area?: number;
  /**
   * True when the figure counted in a month other than its order's month.
   * Not an error — it is usually correct — but it is the thing worth
   * looking at when a monthly total is surprising.
   */
  crossesMonth: boolean;
  /** Present on delivered-remainder rows only. See `RemainderContext`. */
  context?: RemainderContext;
}

/**
 * What a delivered-remainder row needs in order to explain itself.
 *
 * A remainder row shows only the BALANCE nobody entered, so on a well-recorded
 * order most of its columns are empty — which reads as "nothing was counted"
 * when the truth is the opposite: everything was counted, just earlier and in
 * another month. Order 2026-07-0081 is the case in point — its 1 216 blocks
 * were recorded in full on the July trucks, so its August remainder row shows
 * a blocks column of "—" and looks broken.
 *
 * Carrying the order totals, what was already recorded, and WHERE it was
 * recorded lets the row say so.
 */
export interface RemainderContext {
  orderTotals: { blocks: number; beamCount: number; beamMeters: number; area: number };
  recorded: { blocks: number; beamCount: number; beamMeters: number; area: number };
  /** `YYYY-MM` months the already-recorded loads counted in, oldest first. */
  recordedMonths: string[];
  /** True when the trucks accounted for every block the order carried. */
  blocksComplete: boolean;
  /** True when the trucks accounted for every beam metre. */
  beamsComplete: boolean;
}

/** Build the context, rounding measurements once so the UI never re-rounds. */
export function buildRemainderContext(
  orderTotals: { blocks: number; beamCount: number; beamMeters: number; area: number },
  recorded: { blocks: number; beamCount: number; beamMeters: number; area: number },
  recordedMonths: string[],
): RemainderContext {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    orderTotals: { ...orderTotals, beamMeters: r1(orderTotals.beamMeters), area: r1(orderTotals.area) },
    recorded: { ...recorded, beamMeters: r1(recorded.beamMeters), area: r1(recorded.area) },
    recordedMonths: Array.from(new Set(recordedMonths)).sort(),
    blocksComplete: recorded.blocks >= orderTotals.blocks,
    // Tolerance, not equality: metres are floating-point sums of
    // length × count and will not land exactly on the total.
    beamsComplete: recorded.beamMeters >= orderTotals.beamMeters - 0.05,
  };
}

export function monthOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Human reason strings, kept together so the wording stays consistent. */
export const LEDGER_REASONS = {
  paidOn: 'Мижоз тўлаган сана (қўлда киритилган)',
  confirmedAt: 'Тўлов тасдиқланган сана',
  shipmentLoaded: (n: number) => `${n}-жўнатма юкланган сана`,
  singleTruck: 'Битта машинада юкланган сана',
  deliveredRemainder: 'Етказилди — ёзилмаган қолдиқ',
} as const;

/**
 * Sort newest attribution first, tie-broken by order number so the order of
 * two events stamped in the same second is stable between requests rather
 * than left to the database.
 */
export function sortLedger(rows: LedgerRow[]): LedgerRow[] {
  return [...rows].sort((a, b) => {
    const t = b.attributedAt.localeCompare(a.attributedAt);
    return t !== 0 ? t : b.orderNumber.localeCompare(a.orderNumber);
  });
}

export interface LedgerTotals {
  money: number;
  blocks: number;
  beamMeters: number;
  area: number;
  crossMonthCount: number;
  crossMonthMoney: number;
}

/** Totals for a set of rows — what this month's figures are made of. */
export function ledgerTotals(rows: LedgerRow[]): LedgerTotals {
  const t: LedgerTotals = {
    money: 0, blocks: 0, beamMeters: 0, area: 0,
    crossMonthCount: 0, crossMonthMoney: 0,
  };
  for (const r of rows) {
    if (r.kind === 'money') {
      t.money += r.amount ?? 0;
      if (r.crossesMonth) t.crossMonthMoney += r.amount ?? 0;
    } else {
      t.blocks += r.blocks ?? 0;
      t.beamMeters += r.beamMeters ?? 0;
      t.area += r.area ?? 0;
    }
    if (r.crossesMonth) t.crossMonthCount += 1;
  }
  // Metres and area are measurements; round once here rather than at every
  // call site, so the header and the rows agree.
  t.beamMeters = Math.round(t.beamMeters * 10) / 10;
  t.area = Math.round(t.area * 10) / 10;
  return t;
}
