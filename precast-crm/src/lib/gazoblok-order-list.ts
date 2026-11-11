/**
 * Gazoblok orders list route helpers — phone search, the extra money/loaded
 * fields per row, and the reorder-source check on placement. Pure.
 */
import type { Prisma } from "@prisma/client";
import { digitsOnly, normalizePhone } from "@/lib/phone";
import { buildOrderWhere, orderFlags, type OrderListQuery } from "@/lib/gazoblok-order-filters";
import { deliveredWithoutTrucks, loadedByLine, unpaidOverload } from "@/lib/gazoblok-quantities";
import { refundDue } from "@/lib/overpayment";

/**
 * Digit fragments to substring-match against the stored (digits-only) phone.
 * Operators type partial numbers («90 123 45»), so the raw digits are always
 * searched; a typed whole local number also matches its full 998 form.
 */
export function phoneSearchFragments(q: string): string[] {
  if (/\p{L}/u.test(q)) return [];
  const raw = digitsOnly(q);
  if (raw.length < 4) return [];
  const full = normalizePhone(q);
  const fragments = [raw];
  if (full !== raw && full.length === 12 && full.startsWith("998")) fragments.push(full);
  return fragments;
}

/** buildOrderWhere's filters, with the phone branch matching partial numbers. */
export function orderListWhere(q: OrderListQuery, flaggedIds: string[] | null): Prisma.GazoblokOrderWhereInput {
  const where = buildOrderWhere({ ...q, q: "" }, flaggedIds);
  if (q.q) {
    where.OR = [
      { orderNumber: { contains: q.q, mode: "insensitive" } },
      { client: { name: { contains: q.q, mode: "insensitive" } } },
      ...phoneSearchFragments(q.q).map((f) => ({ client: { phone: { contains: f } } })),
    ];
  }
  return where;
}

/** A cancelled order carries no over-load debt (same rule as orderFlags). */
export function orderListExtras(o: {
  status: string;
  totalBlocks: number;
  totalPrice: number;
  confirmedPaid: number;
  overshipAmount: number;
  shipments: { loadedLines: unknown }[];
}): { loadedBlocks: number; deliveredWithoutTrucks: boolean; unpaidOverload: number; refundDue: number } {
  let loadedBlocks = 0;
  for (const n of Array.from(loadedByLine(o.shipments).values())) loadedBlocks += n;
  const noTrucks = deliveredWithoutTrucks(o.status, o.shipments);
  return {
    loadedBlocks: noTrucks ? o.totalBlocks : loadedBlocks,
    deliveredWithoutTrucks: noTrucks,
    unpaidOverload: o.status === "CANCELED" ? 0 : unpaidOverload(o),
    refundDue: refundDue({ status: o.status, totalPrice: o.totalPrice, confirmedPaid: o.confirmedPaid, writeOffAmount: 0 }),
  };
}

/** A reorder must point at an existing order of the same client (phone = client id). */
export function reorderSourceProblem(
  source: { client: { phone: string } } | null,
  phoneNorm: string,
): { status: number; message: string } | null {
  if (!source) return { status: 422, message: "Асл буюртма топилмади · Source order not found" };
  if (source.client.phone !== phoneNorm) {
    return { status: 422, message: "Асл буюртма бошқа мижозники · The source order belongs to another client" };
  }
  return null;
}

export type OrderCounts = {
  all: number;
  byStatus: Record<"PLACED" | "IN_PRODUCTION" | "DELIVERED" | "CANCELED", number>;
  flags: { debt: number; refund: number; unconfirmed: number };
  sellers: { id: string; name: string; count: number }[];
};

/** Pill counts and the seller select. Orders placed before sellers were recorded have no seller. */
export function orderCounts(
  rows: {
    status: string;
    totalPrice: number;
    confirmedPaid: number;
    overshipAmount: number;
    pendingCount: number;
    createdById: string | null;
  }[],
  userNames: Map<string, string>,
): OrderCounts {
  const out: OrderCounts = {
    all: rows.length,
    byStatus: { PLACED: 0, IN_PRODUCTION: 0, DELIVERED: 0, CANCELED: 0 },
    flags: { debt: 0, refund: 0, unconfirmed: 0 },
    sellers: [],
  };
  const perSeller = new Map<string, number>();
  for (const r of rows) {
    if (r.status in out.byStatus) out.byStatus[r.status as keyof OrderCounts["byStatus"]] += 1;
    const f = orderFlags(r);
    if (f.debt) out.flags.debt += 1;
    if (f.refund) out.flags.refund += 1;
    if (f.unconfirmed) out.flags.unconfirmed += 1;
    if (r.createdById) perSeller.set(r.createdById, (perSeller.get(r.createdById) ?? 0) + 1);
  }
  out.sellers = Array.from(perSeller, ([id, count]) => ({ id, name: userNames.get(id) ?? "—", count })).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
  return out;
}
