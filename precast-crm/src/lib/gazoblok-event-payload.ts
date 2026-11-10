/**
 * Structured payloads + Uzbek messages for gazoblok order-history events.
 * "Logs should register both the quantity and size" — owner, 2026-11-10.
 * Routes write these; the history view reads them back (and rebuilds old rows).
 * Pure: no Prisma, no Date.
 */
import { formatNumber } from "@/lib/utils";
import { loadedByLine } from "@/lib/gazoblok-quantities";
import { PAYMENT_METHOD_LABELS } from "@/lib/gazoblok-labels";

/** One size on an event: label + count (+ the count before, for corrections). */
export type SizeCount = { lineId?: string; label: string; qty: number; before?: number };

export type LoadExtras = {
  lines: SizeCount[];
  truckTotal: number;
  truckTotalBefore?: number;
  orderedTotal: number;
  loadedTotal: number;
  leftTotal: number;
  overTotal: number;
  photos: number;
};

type OrderLine = { id: string; productLabel: string; quantity: number };

const n0 = (v: number) => formatNumber(v, 0);
const money = (v: number) => `${formatNumber(v, 2)} UZS`;
const sum = (r: Record<string, number> | null | undefined) => Object.values(r ?? {}).reduce((s, v) => s + (Number(v) || 0), 0);

export function methodName(method: string | null | undefined): string | null {
  if (!method) return null;
  return PAYMENT_METHOD_LABELS[method]?.[0] ?? method;
}

/** Running totals after a load: ordered, loaded (all trucks), left and over. */
export function orderTotals(lines: OrderLine[], loaded: Map<string, number>) {
  let orderedTotal = 0;
  let loadedTotal = 0;
  let leftTotal = 0;
  let overTotal = 0;
  for (const l of lines) {
    const got = loaded.get(l.id) ?? 0;
    orderedTotal += l.quantity;
    loadedTotal += got;
    leftTotal += Math.max(0, l.quantity - got);
    overTotal += Math.max(0, got - l.quantity);
  }
  return { orderedTotal, loadedTotal, leftTotal, overTotal };
}

/** A load lists every size on the truck; a correction only the sizes it changed. */
export function loadExtras(i: {
  lines: OrderLine[];
  otherShipments: { loadedLines: unknown }[];
  prevLoaded: Record<string, number> | null;
  nextLoaded: Record<string, number>;
  isCorrection: boolean;
  photos: number;
}): LoadExtras {
  const label = new Map(i.lines.map((l) => [l.id, l.productLabel]));
  const ids = [...i.lines.map((l) => l.id), ...Object.keys(i.nextLoaded).filter((k) => !label.has(k))];
  const sizes: SizeCount[] = [];
  for (const id of ids) {
    const qty = i.nextLoaded[id] ?? 0;
    if (i.isCorrection) {
      const before = i.prevLoaded?.[id] ?? 0;
      if (before !== qty) sizes.push({ lineId: id, label: label.get(id) ?? id, qty, before });
    } else if (qty > 0) {
      sizes.push({ lineId: id, label: label.get(id) ?? id, qty });
    }
  }
  const loaded = loadedByLine([...i.otherShipments, { loadedLines: i.nextLoaded }]);
  return {
    lines: sizes,
    truckTotal: sum(i.nextLoaded),
    ...(i.isCorrection ? { truckTotalBefore: sum(i.prevLoaded) } : {}),
    ...orderTotals(i.lines, loaded),
    photos: i.photos,
  };
}

function sizeList(sizes: SizeCount[]): string {
  return sizes.map((s) => `${s.label} — ${n0(s.qty)} та`).join(", ");
}

function signed(d: number): string {
  return d > 0 ? `+${n0(d)}` : `−${n0(-d)}`;
}

export function loadMessage(
  number: number,
  x: Pick<LoadExtras, "lines" | "truckTotal" | "truckTotalBefore" | "orderedTotal" | "loadedTotal" | "leftTotal">,
  isCorrection: boolean,
  over?: { blocks: number; amount: number } | null,
): string {
  const head = isCorrection ? `Жўнатма ${number} тузатилди` : `Жўнатма ${number} юкланди`;
  const body = isCorrection
    ? `${x.lines.map((s) => `${s.label} ${n0(s.before ?? 0)} → ${n0(s.qty)} та (${signed(s.qty - (s.before ?? 0))})`).join(", ")}. Ҳаммаси ${n0(x.truckTotalBefore ?? 0)} → ${n0(x.truckTotal)} та.`
    : `${sizeList(x.lines)} (ҳаммаси ${n0(x.truckTotal)} та).`;
  const run = ` Юкланди ${n0(x.loadedTotal)} / ${n0(x.orderedTotal)}, қолди ${n0(x.leftTotal)} та.`;
  const extra = over && over.blocks > 0 ? ` Буюртмадан ортиқ +${n0(over.blocks)} та · +${n0(over.amount)} UZS.` : "";
  return `${head}: ${body}${run}${extra}`;
}

/** The truck's sizes as they were delivered. */
export function deliverExtras(lines: OrderLine[], loadedLines: Record<string, number> | null): { lines: SizeCount[]; deliveredTotal: number } {
  const label = new Map(lines.map((l) => [l.id, l.productLabel]));
  const sizes = Object.entries(loadedLines ?? {})
    .filter(([, v]) => Number(v) > 0)
    .map(([id, v]) => ({ lineId: id, label: label.get(id) ?? id, qty: Number(v) }));
  const order = new Map(lines.map((l, i) => [l.id, i]));
  sizes.sort((a, b) => (order.get(a.lineId) ?? 999) - (order.get(b.lineId) ?? 999));
  return { lines: sizes, deliveredTotal: sizes.reduce((s, x) => s + x.qty, 0) };
}

export function deliverMessage(number: number, x: { lines: SizeCount[]; deliveredTotal: number }): string {
  if (!x.lines.length) return `Жўнатма ${number} етказилди`;
  return `Жўнатма ${number} етказилди: ${sizeList(x.lines)} (${n0(x.deliveredTotal)} та).`;
}

type ShortQty = { label: string; ordered: number; loaded: number };

export function closeShortExtras(i: { quantities: ShortQty[]; totalBefore: number; totalAfter: number; confirmedPaid: number }) {
  const notTakenTotal = i.quantities.reduce((s, q) => s + Math.max(0, q.ordered - q.loaded), 0);
  const refundDue = Math.max(0, Math.round((i.confirmedPaid - i.totalAfter) * 100) / 100);
  return { notTakenTotal, refundDue };
}

export function closeShortMessage(i: { quantities: ShortQty[]; totalBefore: number; totalAfter: number; refundDue: number; reason: string }): string {
  const sizes = i.quantities
    .map((q) => {
      const left = Math.max(0, q.ordered - q.loaded);
      return `${q.label} — ${n0(q.loaded)} / ${n0(q.ordered)} та${left > 0 ? ` (${n0(left)} та олинмади)` : ""}`;
    })
    .join(", ");
  const refund = i.refundDue >= 0.01 ? ` Қайтариш керак ${n0(i.refundDue)} UZS.` : "";
  return `Юкланганича ёпилди: ${sizes}. Жами ${n0(i.totalBefore)} → ${n0(i.totalAfter)} UZS.${refund} Сабаб: ${i.reason}`;
}

export function paymentRecordedMessage(p: { amount: number; method: string; receipts: number }): string {
  const parts = [`Тўлов ёзилди: ${money(p.amount)}`, methodName(p.method)];
  if (p.receipts > 0) parts.push(`чек ${n0(p.receipts)} та`);
  return parts.filter(Boolean).join(" · ");
}

export function paymentDecisionMessage(p: {
  approve: boolean;
  amount: number;
  method: string;
  recordedBy?: string | null;
  reason?: string | null;
  auto?: boolean;
}): string {
  const verb = p.approve ? (p.auto ? "Тўлов тасдиқланди (автоматик)" : "Тўлов тасдиқланди") : "Тўлов рад этилди";
  let s = `${verb}: ${money(p.amount)} · ${methodName(p.method)}`;
  if (p.approve && !p.auto && p.recordedBy) s += ` (ёзган: ${p.recordedBy})`;
  if (!p.approve && p.reason) s += ` — сабаб: ${p.reason}`;
  return s;
}

/** Sizes on the ORDER_PLACED event, so the placement line names what was ordered. */
export function placedLines(rows: { productLabel: string; quantity: number; unitPrice: number }[]) {
  return rows.map((r) => ({ label: r.productLabel, qty: r.quantity, unitPrice: Number(r.unitPrice) }));
}
