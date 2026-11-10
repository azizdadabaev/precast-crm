/**
 * Gazoblok orders list screen — filter state kept in the URL (a link reproduces
 * the view), cursor paging and the per-row figures (spec §9, comp 05). Pure,
 * browser-safe: the screen and its tests share it.
 */

export const ORDER_PAGE_SIZE = 50;

const STATUSES = ["PLACED", "IN_PRODUCTION", "DELIVERED", "CANCELED"] as const;
const PAY_STATES = ["AWAITING_PAYMENT", "PARTIALLY_PAID", "FULLY_PAID"] as const;
const FLAGS = ["debt", "refund", "unconfirmed"] as const;

export type ListStatus = (typeof STATUSES)[number];
export type ListPay = (typeof PAY_STATES)[number];
export type ListFlag = (typeof FLAGS)[number];

export type OrderListFilters = {
  q: string;
  status: ListStatus | "";
  pay: ListPay | "";
  flag: ListFlag | "";
  seller: string;
  /** Placed date bounds, YYYY-MM-DD (the API's format), inclusive. */
  from: string;
  to: string;
  /** Scheduled day picked on the calendar (YYYY-MM-DD), or "none" = open orders with no date. */
  day: string;
};

export const EMPTY_FILTERS: OrderListFilters = {
  q: "",
  status: "",
  pay: "",
  flag: "",
  seller: "",
  from: "",
  to: "",
  day: "",
};

const KEYS = Object.keys(EMPTY_FILTERS) as (keyof OrderListFilters)[];

function oneOf<T extends string>(allowed: readonly T[], v: string | null): T | "" {
  return allowed.find((a) => a === v) ?? "";
}

function isoDay(v: string | null): string {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

export function filtersFromParams(sp: URLSearchParams): OrderListFilters {
  return {
    q: sp.get("q")?.trim() ?? "",
    status: oneOf(STATUSES, sp.get("status")),
    pay: oneOf(PAY_STATES, sp.get("pay")),
    flag: oneOf(FLAGS, sp.get("flag")),
    seller: sp.get("seller")?.trim() ?? "",
    from: isoDay(sp.get("from")),
    to: isoDay(sp.get("to")),
    day: sp.get("day") === "none" ? "none" : isoDay(sp.get("day")),
  };
}

export function filtersToParams(f: OrderListFilters): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of KEYS) {
    const v = f[k].trim();
    if (v) p.set(k, v);
  }
  return p;
}

export function hasActiveFilters(f: OrderListFilters): boolean {
  return KEYS.some((k) => f[k].trim() !== "");
}

/** The API pages by the last row's id; a short page means the list ended. */
export function nextCursor(page: { id: string }[], limit: number): string | undefined {
  return page.length >= limit && page.length > 0 ? page[page.length - 1].id : undefined;
}

/** What the client still owes. A cancelled order owes nothing and shows «—». */
export function remainingToPay(o: { status: string; totalPrice: string; confirmedPaid: string }): number | null {
  if (o.status === "CANCELED") return null;
  // Money arrives as decimal strings; work in tiyin so 0.3 − 0.1 stays 0.2.
  const left = Math.round(Number(o.totalPrice) * 100) - Math.round(Number(o.confirmedPaid) * 100);
  return Math.max(0, left) / 100;
}

/** «168 / 200» bar: the loaded share, and the over-load share past the ordered amount. */
export function blocksBar(loaded: number, ordered: number): { fillPct: number; overPct: number } {
  const scale = Math.max(loaded, ordered);
  if (scale <= 0) return { fillPct: 0, overPct: 0 };
  return {
    fillPct: (Math.min(loaded, ordered) / scale) * 100,
    overPct: (Math.max(0, loaded - ordered) / scale) * 100,
  };
}
