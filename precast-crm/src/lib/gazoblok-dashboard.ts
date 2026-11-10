/**
 * Gazoblok dashboard math (Stage 2 spec §4). Pure: no Prisma, no `new Date()`
 * — `now` is passed in so months and days are testable. Money arrives as
 * `Number(Decimal)` and leaves through `round2`, like the rest of the codebase.
 * Months and days are bucketed in the server's LOCAL zone (see dashboard-metrics.ts).
 */
import { round2 } from "@/services/calculation-engine";
import { monthWindow, monthKey, dayKey } from "@/lib/dashboard-metrics";
import { lineQuantities, unpaidOverload } from "@/lib/gazoblok-quantities";
import { blockWeightKg, loadWeightKg, type GazoblokLine } from "@/lib/gazoblok-weight";

export type GazoblokMonth = { key: string; label: string; year: number; booked: number; orders: number;
  blocks: number; volumeM3: number; collected: number };
export type OverloadOperator = { operatorId: string | null; name: string | null; extraBlocks: number; unpaid: number;
  orders: { id: string; orderNumber: string; clientName: string; extraBlocks: number; unpaid: number }[] };
export type GazoblokOverload = { total: number; extraBlocks: number; orders: number; operators: OverloadOperator[] };
export type StockRow = { productId: string; label: string; onHand: number; reserved: number; free: number;
  state: "ok" | "low" | "out" };
export type TruckRow = { shipmentId: string; orderId: string; orderNumber: string; clientName: string; number: number;
  status: "PENDING" | "LOADED" | "DELIVERED"; blocks: number; weightKg: number; overBlocks: number; at: string | null };
export type PlanDay = { date: string; orders: { id: string; orderNumber: string; clientName: string; blocksLeft: number }[] };
export type GazoblokDashboard = { generatedAt: string;
  money: null | { months: GazoblokMonth[]; receivables: { total: number; orders: number };
    unconfirmed: { total: number; count: number }; overload: GazoblokOverload };
  stock: StockRow[]; trucks: TruckRow[]; plan: PlanDay[]; unscheduledOpen: number };

type DimLine = { id: string; productId: string | null; productLabel: string; quantity: number;
  product: { lengthM: number; heightM: number; thicknessM: number } | null };
type DashShipment = { id: string; number: number; status: "PENDING" | "LOADED" | "DELIVERED"; loadedLines: unknown;
  loadedAt: Date | null; deliveredAt: Date | null };
export type MoneyOrderRow = { id: string; orderNumber: string; totalPrice: number; confirmedPaid: number;
  overshipAmount: number; createdById: string | null; createdByName: string | null; clientName: string;
  lines: { id: string; productId: string | null; productLabel: string; quantity: number }[];
  shipments: { loadedLines: unknown }[] };
export type OpenOrderRow = { id: string; orderNumber: string; clientName: string; scheduledAt: Date | null;
  shortClosedAt: Date | null; lines: DimLine[]; shipments: DashShipment[] };

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const owedOf = (r: { totalPrice: number; confirmedPaid: number }) =>
  Math.max(0, Number(r.totalPrice) - Number(r.confirmedPaid));

/** 12 local months, oldest → newest: booked by placedAt, collected by confirmedAt (refunds net out). */
export function monthlySeries(
  now: Date,
  orders: { placedAt: Date; totalPrice: number; totalBlocks: number; totalVolumeM3: number }[],
  payments: { amount: number; confirmedAt: Date | null }[],
): GazoblokMonth[] {
  const months = monthWindow(now, 12).map((b) => ({
    key: b.key, label: b.label, year: b.year, booked: 0, orders: 0, blocks: 0, volumeM3: 0, collected: 0,
  }));
  const byKey = new Map(months.map((m) => [m.key, m]));
  for (const o of orders) {
    const m = byKey.get(monthKey(o.placedAt));
    if (!m) continue;
    m.booked += Number(o.totalPrice);
    m.orders += 1;
    m.blocks += Number(o.totalBlocks);
    m.volumeM3 += Number(o.totalVolumeM3);
  }
  for (const p of payments) {
    if (!p.confirmedAt) continue;
    const m = byKey.get(monthKey(p.confirmedAt));
    if (m) m.collected += Number(p.amount);
  }
  return months.map((m) => ({ ...m, booked: round2(m.booked), volumeM3: round3(m.volumeM3), collected: round2(m.collected) }));
}

/** Σ what is still owed; an overpaid order owes 0 and is not counted. */
export function receivablesOf(rows: { totalPrice: number; confirmedPaid: number }[]): { total: number; orders: number } {
  let total = 0;
  let orders = 0;
  for (const r of rows) {
    const owed = owedOf(r);
    if (owed > 0) {
      total += owed;
      orders += 1;
    }
  }
  return { total: round2(total), orders };
}

/**
 * Unpaid over-load per selling operator — "ask the operator where the leftover money is".
 * The extra is the last money in (unpaidOverload); orders with nothing unpaid drop out.
 * createdById null = legacy order never backfilled; it stays visible under a null operator.
 */
export function overloadByOperator(rows: MoneyOrderRow[]): GazoblokOverload {
  const groups = new Map<string | null, OverloadOperator>();
  for (const r of rows) {
    const unpaid = unpaidOverload(r);
    if (unpaid <= 0) continue;
    const extraBlocks = lineQuantities(r.lines, r.shipments).reduce((s, q) => s + q.over, 0);
    let g = groups.get(r.createdById);
    if (!g) {
      g = { operatorId: r.createdById, name: r.createdByName, extraBlocks: 0, unpaid: 0, orders: [] };
      groups.set(r.createdById, g);
    }
    g.extraBlocks += extraBlocks;
    g.unpaid = round2(g.unpaid + unpaid);
    g.orders.push({ id: r.id, orderNumber: r.orderNumber, clientName: r.clientName, extraBlocks, unpaid });
  }
  const operators = [...groups.values()].sort((a, b) => b.unpaid - a.unpaid);
  for (const op of operators) op.orders.sort((a, b) => b.unpaid - a.unpaid);
  return {
    total: round2(operators.reduce((s, o) => s + o.unpaid, 0)),
    extraBlocks: operators.reduce((s, o) => s + o.extraBlocks, 0),
    orders: operators.reduce((s, o) => s + o.orders.length, 0),
    operators,
  };
}

/** Blocks still to load on an open order; a short-closed order released its remainder. */
function leftOf(o: OpenOrderRow) {
  return o.shortClosedAt ? [] : lineQuantities(o.lines, o.shipments);
}

/** Per product: on hand, reserved by open orders, free = max(0, onHand − reserved), and its state. */
export function stockRows(
  products: { id: string; label: string; lowStockThreshold: number; onHand: number }[],
  open: OpenOrderRow[],
): StockRow[] {
  const reserved = new Map<string, number>();
  for (const o of open) {
    for (const q of leftOf(o)) if (q.productId) reserved.set(q.productId, (reserved.get(q.productId) ?? 0) + q.left);
  }
  return products.map((p) => {
    const res = reserved.get(p.id) ?? 0;
    const free = Math.max(0, p.onHand - res);
    const state: StockRow["state"] = p.onHand <= 0 ? "out" : free <= p.lowStockThreshold ? "low" : "ok";
    return { productId: p.id, label: p.label, onHand: p.onHand, reserved: res, free, state };
  });
}

function weightLines(lines: DimLine[]): GazoblokLine[] {
  return lines.map((l) => ({
    lineId: l.id,
    label: l.productLabel,
    quantity: l.quantity,
    perBlockKg: l.product ? blockWeightKg(Number(l.product.lengthM), Number(l.product.heightM), Number(l.product.thicknessM)) : 0,
  }));
}

function countsOf(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, Number(v) || 0]));
}

const STATUS_ORDER: Record<TruckRow["status"], number> = { LOADED: 0, PENDING: 1, DELIVERED: 2 };

/**
 * Today's trucks: PENDING/LOADED shipments of open orders plus shipments delivered
 * today (open or finished orders). Rows carry ALL their order's shipments, so the
 * order's total over-load is exact; `now` picks out what was delivered today.
 */
export function truckRows(now: Date, open: OpenOrderRow[], deliveredToday: OpenOrderRow[]): TruckRow[] {
  const today = dayKey(now);
  const out: TruckRow[] = [];
  const add = (o: OpenOrderRow, isOpen: boolean) => {
    const wl = weightLines(o.lines);
    const overBlocks = lineQuantities(o.lines, o.shipments).reduce((s, q) => s + q.over, 0);
    for (const s of o.shipments) {
      const active = isOpen && (s.status === "PENDING" || s.status === "LOADED");
      const doneToday = s.status === "DELIVERED" && s.deliveredAt !== null && dayKey(s.deliveredAt) === today;
      if (!active && !doneToday) continue;
      const counts = s.status === "PENDING" ? {} : countsOf(s.loadedLines);
      const at = s.deliveredAt ?? s.loadedAt;
      out.push({
        shipmentId: s.id,
        orderId: o.id,
        orderNumber: o.orderNumber,
        clientName: o.clientName,
        number: s.number,
        status: s.status,
        blocks: Object.values(counts).reduce((a, b) => a + b, 0),
        weightKg: Math.round(loadWeightKg(wl, counts)),
        overBlocks,
        at: at ? at.toISOString() : null,
      });
    }
  };
  for (const o of open) add(o, true);
  for (const o of deliveredToday) add(o, false);
  return out.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (a.at ?? "￿").localeCompare(b.at ?? "￿") ||
      a.orderNumber.localeCompare(b.orderNumber) ||
      a.number - b.number,
  );
}

/** Open orders scheduled today … today+(days−1), grouped by local day (one order = one day, its scheduled day). */
export function dayPlan(now: Date, open: OpenOrderRow[], days = 7): { plan: PlanDay[]; unscheduledOpen: number } {
  const keys = Array.from({ length: days }, (_, i) =>
    dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)),
  );
  const byDay = new Map<string, PlanDay>(keys.map((k) => [k, { date: k, orders: [] }]));
  let unscheduledOpen = 0;
  for (const o of open) {
    if (!o.scheduledAt) {
      unscheduledOpen += 1;
      continue;
    }
    const day = byDay.get(dayKey(o.scheduledAt));
    if (!day) continue;
    const blocksLeft = leftOf(o).reduce((s, q) => s + q.left, 0);
    day.orders.push({ id: o.id, orderNumber: o.orderNumber, clientName: o.clientName, blocksLeft });
  }
  const plan = keys.map((k) => byDay.get(k)!).filter((d) => d.orders.length > 0);
  for (const d of plan) d.orders.sort((a, b) => a.orderNumber.localeCompare(b.orderNumber));
  return { plan, unscheduledOpen };
}

/** Client page card: count every gazoblok order; book and owe only the non-cancelled ones. */
export function clientGazoblokSummary(rows: { status: string; totalPrice: number; confirmedPaid: number }[]):
  { orderCount: number; totalBooked: number; debt: number } {
  const live = rows.filter((r) => r.status !== "CANCELED");
  return {
    orderCount: rows.length,
    totalBooked: round2(live.reduce((s, r) => s + Number(r.totalPrice), 0)),
    debt: round2(live.reduce((s, r) => s + owedOf(r), 0)),
  };
}
