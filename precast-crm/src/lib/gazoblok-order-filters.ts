/**
 * Gazoblok orders list — query parsing, the Prisma filter and the per-order
 * flags (debt / refund / unconfirmed payment) the list pills read (spec §9).
 * Pure: no Prisma client, only its types.
 */
import type { Prisma, GazoblokOrderStatus } from "@prisma/client";
import { normalizePhone } from "@/lib/phone";
import { unpaidOverload } from "@/lib/gazoblok-quantities";
import { refundDue, OVERPAY_ALERT_MIN } from "@/lib/overpayment";

const STATUSES = ["PLACED", "IN_PRODUCTION", "DELIVERED", "CANCELED"] as const;
const PAY_STATES = ["AWAITING_PAYMENT", "PARTIALLY_PAID", "FULLY_PAID"] as const;
const FLAGS = ["debt", "refund", "unconfirmed"] as const;

export type OrderListQuery = {
  q: string;
  status?: GazoblokOrderStatus;
  pay?: (typeof PAY_STATES)[number];
  flag?: (typeof FLAGS)[number];
  seller?: string;
  from?: Date;
  to?: Date;
  limit: number;
  cursor?: string;
};

function oneOf<T extends string>(allowed: readonly T[], v: string | null): T | undefined {
  return allowed.find((a) => a === v);
}

/** "YYYY-MM-DD" → local midnight of that day (+ dayOffset days); impossible dates → undefined. */
function localDay(v: string | null, dayOffset: number): Date | undefined {
  const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const date = new Date(y, mo, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return undefined;
  return dayOffset ? new Date(y, mo, d + dayOffset) : date;
}

export function parseOrderListQuery(sp: URLSearchParams): OrderListQuery {
  const rawLimit = Number(sp.get("limit"));
  const limit = sp.get("limit") && Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, Math.trunc(rawLimit))) : 50;
  return {
    q: sp.get("q")?.trim() ?? "",
    status: oneOf(STATUSES, sp.get("status")),
    pay: oneOf(PAY_STATES, sp.get("pay")),
    flag: oneOf(FLAGS, sp.get("flag")),
    seller: sp.get("seller") || undefined,
    from: localDay(sp.get("from"), 0),
    // `to` is inclusive for the operator, so the bound is the next day's midnight.
    to: localDay(sp.get("to"), 1),
    limit,
    cursor: sp.get("cursor") || undefined,
  };
}

/**
 * The query as a stored phone fragment, or null when it doesn't look like a phone.
 * Phones are stored digits-only (the client's unique id), so a number typed as
 * displayed («+998 90 111 22 33») goes through the project's normalizePhone.
 */
export function phoneDigits(q: string): string | null {
  if (/\p{L}/u.test(q)) return null;
  if (q.replace(/\D/g, "").length < 3) return null;
  return normalizePhone(q) || null;
}

export function buildOrderWhere(q: OrderListQuery, flaggedIds: string[] | null): Prisma.GazoblokOrderWhereInput {
  const where: Prisma.GazoblokOrderWhereInput = {};
  if (q.q) {
    const or: Prisma.GazoblokOrderWhereInput[] = [
      { orderNumber: { contains: q.q, mode: "insensitive" } },
      { client: { name: { contains: q.q, mode: "insensitive" } } },
    ];
    const digits = phoneDigits(q.q);
    if (digits) or.push({ client: { phone: { contains: digits } } });
    where.OR = or;
  }
  if (q.status) where.status = q.status;
  if (q.pay) where.paymentState = q.pay;
  if (q.seller) where.createdById = q.seller;
  if (q.from || q.to) where.placedAt = { ...(q.from && { gte: q.from }), ...(q.to && { lt: q.to }) };
  if (flaggedIds) where.id = { in: flaggedIds };
  return where;
}

/** Gazoblok orders have no write-off, so refundDue sees writeOffAmount 0. */
export function orderFlags(o: {
  status: string;
  totalPrice: number;
  confirmedPaid: number;
  overshipAmount: number;
  pendingCount: number;
}): { debt: boolean; refund: boolean; unconfirmed: boolean } {
  return {
    debt: o.status !== "CANCELED" && unpaidOverload(o) > 0.005,
    refund:
      refundDue({ status: o.status, totalPrice: o.totalPrice, confirmedPaid: o.confirmedPaid, writeOffAmount: 0 }) >=
      OVERPAY_ALERT_MIN,
    unconfirmed: o.pendingCount > 0,
  };
}
