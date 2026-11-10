/**
 * Decisions of the gazoblok order DETAIL page (redesign 2026-11-10): Uzbek dates,
 * the per-size fulfilment picture (ordered / loaded / delivered / on the road / left /
 * over), the two status pills and the ONE primary next action (fixed rule, first match
 * wins) with every other blocker spelled out. Pure (browser-safe), tested apart.
 */
import { formatNumber } from "@/lib/utils";
import { canDeliver, isOpen } from "@/lib/gazoblok-rules";
import type { LineQty } from "@/lib/gazoblok-quantities";
import type { Tone } from "@/lib/gazoblok-history";

const n0 = (v: number) => formatNumber(v, 0);
const pad = (n: number) => String(n).padStart(2, "0");

function asDate(d: Date | string): Date | null {
  const x = typeof d === "string" ? new Date(d) : d;
  return x instanceof Date && !Number.isNaN(x.getTime()) ? x : null;
}

/** «10.11.2026» — digits only, so no month name can come out in Russian. */
export function dotDate(d: Date | string): string {
  const x = asDate(d);
  return x ? `${pad(x.getDate())}.${pad(x.getMonth() + 1)}.${x.getFullYear()}` : "—";
}

/** «10.11.2026 18:56» (24-hour clock). */
export function dotDateTime(d: Date | string): string {
  const x = asDate(d);
  return x ? `${dotDate(x)} ${pad(x.getHours())}:${pad(x.getMinutes())}` : "—";
}

const WEEKDAYS = ["якшанба", "душанба", "сешанба", "чоршанба", "пайшанба", "жума", "шанба"];
export function weekdayUz(d: Date | string): string {
  const x = asDate(d);
  return x ? WEEKDAYS[x.getDay()] : "";
}

type Truck = { id: string; number: number; status: "PENDING" | "LOADED" | "DELIVERED" | string; loadedLines: Record<string, number> | null };

export type Bar = { delivered: number; onRoad: number; left: number; over: number };
export type LoadRow = { lineId: string; label: string; ordered: number; loaded: number; delivered: number; onRoad: number; left: number; over: number; bar: Bar };

/** Percent bar: delivered and on-the-road inside the order, then left, then over-load. */
function bar(ordered: number, loaded: number, delivered: number, left: number, over: number): Bar {
  const whole = ordered + over;
  if (whole <= 0) return { delivered: 0, onRoad: 0, left: 100, over: 0 };
  const inOrderLoaded = Math.min(loaded, ordered);
  const del = Math.min(delivered, inOrderLoaded);
  const pct = (v: number) => (v / whole) * 100;
  return { delivered: pct(del), onRoad: pct(inOrderLoaded - del), left: pct(left), over: pct(over) };
}

export function loadSummary(quantities: LineQty[], shipments: Truck[]) {
  const delivered = new Map<string, number>();
  for (const s of shipments) {
    if (s.status !== "DELIVERED") continue;
    for (const [k, v] of Object.entries(s.loadedLines ?? {})) delivered.set(k, (delivered.get(k) ?? 0) + (Number(v) || 0));
  }
  const rows: LoadRow[] = quantities.map((q) => {
    const d = delivered.get(q.lineId) ?? 0;
    return {
      lineId: q.lineId,
      label: q.label,
      ordered: q.ordered,
      loaded: q.loaded,
      delivered: d,
      onRoad: Math.max(0, q.loaded - d),
      left: q.left,
      over: q.over,
      bar: bar(q.ordered, q.loaded, d, q.left, q.over),
    };
  });
  const t = rows.reduce(
    (a, r) => ({
      ordered: a.ordered + r.ordered,
      loaded: a.loaded + r.loaded,
      delivered: a.delivered + r.delivered,
      onRoad: a.onRoad + r.onRoad,
      left: a.left + r.left,
      over: a.over + r.over,
    }),
    { ordered: 0, loaded: 0, delivered: 0, onRoad: 0, left: 0, over: 0 },
  );
  return {
    rows,
    total: { ...t, bar: bar(t.ordered, t.loaded, t.delivered, t.left, t.over) },
    trucks: shipments.filter((s) => s.status !== "PENDING").length,
  };
}

export type DetailOrder = {
  status: string;
  shortClosedAt: string | null;
  totalPrice: string | number;
  confirmedPaid: string | number;
  refundDue: number;
  quantities: LineQty[];
  shipments: Truck[];
  payments: { id?: string; status: string; amount: string | number }[];
};

export type PrimaryKind = "refund" | "load" | "deliverTruck" | "pay" | "confirmPayment" | "markDelivered" | "reorder";
export type Primary = { kind: PrimaryKind; label: string; amount?: number; shipmentId?: string; paymentId?: string };

/** Payable now = total − confirmed − money already waiting for a confirmer (the server's ceiling). */
export function payable(o: Pick<DetailOrder, "totalPrice" | "confirmedPaid" | "payments">): number {
  const pending = o.payments.filter((p) => p.status === "PENDING_CONFIRMATION").reduce((s, p) => s + Number(p.amount), 0);
  return Math.max(0, Number(o.totalPrice) - Number(o.confirmedPaid) - pending);
}

/**
 * The next thing to do (direction.md table, first match wins), the blockers still
 * between the order and «Етказилди», and which secondary actions to show.
 */
export function nextAction(o: DetailOrder, perms: string[]) {
  const can = (p: string) => perms.includes(p);
  const open = isOpen(o);
  const active = o.status === "PLACED" || o.status === "IN_PRODUCTION";
  const left = o.quantities.reduce((s, q) => s + q.left, 0);
  const loaded = o.quantities.reduce((s, q) => s + q.loaded, 0);
  const onRoad = [...o.shipments].filter((s) => s.status === "LOADED").sort((a, b) => a.number - b.number);
  const empty = o.shipments.filter((s) => s.status === "PENDING");
  const owed = Math.max(0, Number(o.totalPrice) - Number(o.confirmedPaid));
  const toPay = payable(o);
  const pendingPay = o.payments.find((p) => p.status === "PENDING_CONFIRMATION");
  const deliverProblem = active
    ? canDeliver({ lines: o.quantities, shortClosed: !!o.shortClosedAt, openShipments: onRoad.length + empty.length, remaining: owed })
    : "final";

  let primary: Primary | null = null;
  if (o.status === "CANCELED") primary = null;
  else if (o.refundDue >= 0.01 && can("payment.confirm"))
    primary = { kind: "refund", label: `Пулни қайтариш · ${n0(o.refundDue)} UZS`, amount: o.refundDue };
  else if (open && left > 0 && can("order.edit")) primary = { kind: "load", label: `Жўнатма юклаш · ${n0(left)} та қолди` };
  else if (active && onRoad.length && can("order.edit"))
    primary = { kind: "deliverTruck", label: `Жўнатма ${onRoad[0].number} етказилди`, shipmentId: onRoad[0].id };
  else if (toPay > 0.005 && can("payment.record")) primary = { kind: "pay", label: `Тўлов қўшиш · ${n0(toPay)} UZS`, amount: toPay };
  else if (pendingPay && can("payment.confirm")) primary = { kind: "confirmPayment", label: "Тўловни тасдиқлаш", paymentId: pendingPay.id };
  else if (active && deliverProblem === null && can("order.edit")) primary = { kind: "markDelivered", label: "Етказилди деб ёпиш" };
  else if (o.status === "DELIVERED" && can("order.create")) primary = { kind: "reorder", label: "Қайта буюртма" };

  const blockers: string[] = [];
  if (active) {
    if (left > 0 && !o.shortClosedAt) blockers.push(`${n0(left)} та юкланмаган`);
    if (left === 0 && loaded === 0 && !o.shortClosedAt) blockers.push("Ҳали ҳеч нарса юкланмаган");
    if (onRoad.length) blockers.push(`${n0(onRoad.length)} та жўнатма йўлда — етказилмаган`);
    if (empty.length) blockers.push(`${n0(empty.length)} та жўнатма бўш — юкланг ёки ўчиринг`);
    if (owed > 0.005) blockers.push(`${n0(owed)} UZS тўланмаган`);
  }

  const secondary = {
    production: o.status === "PLACED" && !o.shortClosedAt && can("order.edit"),
    /** «Етказилди деб ёпиш» as a quiet row: "later" while blocked, "ready" when it's not the primary but allowed. */
    markDelivered: !active || !can("order.edit") || primary?.kind === "markDelivered" ? ("hidden" as const) : deliverProblem ? ("later" as const) : ("ready" as const),
    closeShort: open && loaded > 0 && left > 0 && can("order.edit"),
    cancel: !open || !can("order.cancel") ? ("hidden" as const) : loaded > 0 ? ("blocked" as const) : ("allowed" as const),
  };
  return { primary, blockers, secondary };
}

export type Pill = { text: string; tone: Tone };

export function loadPill(o: Pick<DetailOrder, "status" | "shortClosedAt" | "quantities">): Pill | null {
  if (o.status === "CANCELED") return null;
  if (o.shortClosedAt) return { text: "Юкланганича ёпилган", tone: "warning" };
  const ordered = o.quantities.reduce((s, q) => s + q.ordered, 0);
  const loaded = o.quantities.reduce((s, q) => s + q.loaded, 0);
  const left = o.quantities.reduce((s, q) => s + q.left, 0);
  const over = o.quantities.reduce((s, q) => s + q.over, 0);
  if (over > 0) return { text: `Ортиқча юкланди +${n0(over)}`, tone: "destructive" };
  if (loaded === 0) return { text: "Юкланмаган", tone: "muted" };
  if (left === 0) return { text: "Тўлиқ юкланди", tone: "success" };
  return { text: `Юкланди ${n0(loaded)} / ${n0(ordered)}`, tone: "primary" };
}

export function paymentPill(o: { status: string; refundDue: number; paymentState: string }): Pill | null {
  if (o.status === "CANCELED") return null;
  if (o.refundDue >= 0.01) return { text: "Қайтариш керак", tone: "warning" };
  if (o.paymentState === "FULLY_PAID") return { text: "Тўлиқ тўланган", tone: "success" };
  if (o.paymentState === "PARTIALLY_PAID") return { text: "Қисман тўланган", tone: "primary" };
  return { text: "Тўлов кутилмоқда", tone: "muted" };
}

/** One-step loading reuses the lowest empty (PENDING) truck before creating a new one. */
export function pickTruckForLoad(shipments: { id: string; number: number; status: string }[]): string | null {
  const empty = shipments.filter((s) => s.status === "PENDING").sort((a, b) => a.number - b.number);
  return empty[0]?.id ?? null;
}

/** A payment its recorder confirmed in the same step (payment.confirm holders). */
export function isAutoConfirmed(p: {
  status: string;
  recordedById: string | null;
  confirmedById: string | null;
  recordedAt: string | null;
  confirmedAt: string | null;
}): boolean {
  if (p.status !== "CONFIRMED" || !p.recordedById || p.recordedById !== p.confirmedById) return false;
  const a = Date.parse(p.recordedAt ?? "");
  const b = Date.parse(p.confirmedAt ?? "");
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(b - a) <= 10_000;
}
