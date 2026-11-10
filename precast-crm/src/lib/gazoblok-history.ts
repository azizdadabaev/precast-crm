/**
 * The order «Тарих» as a view-model: every load, correction, delivery, close, edit and
 * placement names its sizes and counts; payments name amount + method (+ reason).
 * Reads the structured payloads routes write now AND old rows: old truck rows hold
 * `loadedLines` by line id, mapped to labels through the order's lines, with the running
 * loaded / left replayed oldest → newest (no migration). An auto-confirmed payment shows
 * as one line (both events stay stored). Pure.
 */
import { formatNumber } from "@/lib/utils";
import { EVENT_TYPE_LABELS } from "@/lib/gazoblok-labels";
import { methodName, orderTotals } from "@/lib/gazoblok-event-payload";
import { statusChangeText } from "@/lib/gazoblok-text";
import { loadedByLine } from "@/lib/gazoblok-quantities";

export type Tone = "primary" | "success" | "destructive" | "warning" | "muted";
export type HistoryGroup = "load" | "payment" | "change";
export type HistoryIcon =
  | "load" | "deliver" | "correct" | "closeShort" | "placed" | "edit" | "date" | "status" | "cancel" | "delivered"
  | "payRecorded" | "payConfirmed" | "payRejected" | "refund" | "location" | "proof" | "other";

export type HistoryRow = { label: string; value: string; before?: string; delta?: string; deltaTone?: Tone; note?: string };
export type HistoryItem = {
  id: string;
  at: string;
  actor: string | null;
  group: HistoryGroup;
  icon: HistoryIcon;
  tone: Tone;
  title: string;
  sub: { text: string; tone?: Tone }[];
  rows: HistoryRow[];
  foot?: { label: string; value?: string; right?: string };
  alert?: { tone: Tone; text: string };
  photos: number;
};

type EventIn = {
  id: string;
  type: string;
  message: string | null;
  payload: unknown;
  createdAt: string;
  actor: { id: string; name: string } | null;
};
type PaymentIn = {
  id: string;
  amount: string | number;
  method: string;
  status: string;
  notes: string | null;
  recordedBy?: { name: string } | null;
  receipts?: unknown[];
};
type LineIn = { id: string; label: string; quantity: number };

const n0 = (v: number) => formatNumber(v, 0);
const uzs = (v: number) => `${formatNumber(v, 2)} UZS`;
const ta = (v: number) => `${n0(v)} та`;
const GONE = "ўчирилган ўлчам";

type P = Record<string, unknown>;
const obj = (v: unknown): P => (v && typeof v === "object" ? (v as P) : {});
const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const counts = (v: unknown): Record<string, number> =>
  Object.fromEntries(Object.entries(obj(v)).map(([k, x]) => [k, Number(x) || 0]));

function sizesOf(v: unknown): { label: string; qty: number; before?: number }[] | null {
  if (!Array.isArray(v)) return null;
  return v.map((x) => {
    const o = obj(x);
    const before = num(o.before);
    return { label: String(o.label ?? ""), qty: Number(o.qty) || 0, ...(before === null ? {} : { before }) };
  });
}

function signed(d: number): string {
  return d > 0 ? `+${n0(d)}` : `−${n0(-d)}`;
}

/** Method of a payment row: payload, then the payment itself, then a legacy «(CASH)» suffix. */
function methodOf(p: P, pay: PaymentIn | undefined, message: string): string | null {
  const legacy = /\(([A-Za-z_]+|[^()]+)\)\.?$/.exec(message)?.[1] ?? null;
  return methodName(str(p.method) ?? pay?.method ?? legacy);
}

export function buildHistory(input: {
  events: EventIn[];
  lines: LineIn[];
  payments: PaymentIn[];
  sellerName: string | null;
}): HistoryItem[] {
  const labelById = new Map(input.lines.map((l) => [l.id, l.label]));
  const lineOrder = new Map(input.lines.map((l, i) => [l.id, i]));
  const orderLines = input.lines.map((l) => ({ id: l.id, productLabel: l.label, quantity: l.quantity }));
  const payById = new Map(input.payments.map((p) => [p.id, p]));
  const events = [...input.events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Replay of every truck's counts, so old rows get the running loaded / left.
  const trucks = new Map<string, Record<string, number>>();
  const replayTotals = () => orderTotals(orderLines, loadedByLine([...trucks.values()].map((l) => ({ loadedLines: l }))));
  const idRows = (c: Record<string, number>) =>
    Object.entries(c)
      .filter(([, v]) => v > 0)
      .sort(([a], [b]) => (lineOrder.get(a) ?? 999) - (lineOrder.get(b) ?? 999))
      .map(([id, v]) => ({ label: labelById.get(id) ?? GONE, value: ta(v) }));
  const running = (p: P, fallback: ReturnType<typeof replayTotals>) => {
    const loaded = num(p.loadedTotal) ?? fallback.loadedTotal;
    const ordered = num(p.orderedTotal) ?? fallback.orderedTotal;
    const left = num(p.leftTotal) ?? fallback.leftTotal;
    return `юкланди ${n0(loaded)} / ${n0(ordered)} · қолди ${n0(left)}`;
  };

  const items: HistoryItem[] = [];
  const recorded: { item: HistoryItem; paymentId: string | null; amount: number | null; actor: string | null; at: number }[] = [];

  for (const e of events) {
    const p = obj(e.payload);
    const message = e.message ?? "";
    const base = {
      id: e.id,
      at: e.createdAt,
      actor: e.actor?.name ?? null,
      sub: [] as HistoryItem["sub"],
      rows: [] as HistoryRow[],
      photos: num(p.photos) ?? 0,
    };
    const number = num(p.number);
    const truck = number === null ? "Жўнатма" : `Жўнатма ${number}`;
    const sid = str(p.shipmentId);

    switch (e.type) {
      case "SHIPMENT_LOADED": {
        const loaded = counts(p.loadedLines);
        if (sid) trucks.set(sid, loaded);
        const sizes = sizesOf(p.lines);
        const total = num(p.truckTotal) ?? Object.values(loaded).reduce((s, v) => s + v, 0);
        const overBlocks = num(p.overBlocks);
        const overMoney = num(p.overshipDelta);
        const item: HistoryItem = {
          ...base,
          group: "load",
          icon: "load",
          tone: overMoney && overMoney > 0 ? "destructive" : "primary",
          title: `${truck} юкланди`,
          rows: sizes ? sizes.map((s) => ({ label: s.label, value: ta(s.qty) })) : idRows(loaded),
          foot: { label: "Ҳаммаси", value: ta(total), right: running(p, replayTotals()) },
        };
        if (overMoney && overMoney > 0) {
          const blocks = overBlocks !== null ? `+${n0(overBlocks)} та · ` : "";
          item.alert = {
            tone: "destructive",
            text: `Буюртмадан ортиқ ${blocks}+${n0(overMoney)} UZS — қарз, сотувчи ${input.sellerName ?? "—"}`,
          };
        }
        items.push(item);
        break;
      }
      case "SHIPMENT_CORRECTED": {
        const after = counts(p.loadedLines);
        const before = counts(p.before);
        if (sid) trucks.set(sid, after);
        const sizes =
          sizesOf(p.lines) ??
          [...new Set([...Object.keys(before), ...Object.keys(after)])]
            .filter((k) => (before[k] ?? 0) !== (after[k] ?? 0))
            .sort((a, b) => (lineOrder.get(a) ?? 999) - (lineOrder.get(b) ?? 999))
            .map((k) => ({ label: labelById.get(k) ?? GONE, qty: after[k] ?? 0, before: before[k] ?? 0 }));
        const total = num(p.truckTotal) ?? Object.values(after).reduce((s, v) => s + v, 0);
        items.push({
          ...base,
          group: "load",
          icon: "correct",
          tone: "warning",
          title: `${truck} тузатилди`,
          rows: sizes.map((s) => {
            const d = s.qty - (s.before ?? 0);
            return { label: s.label, value: ta(s.qty), before: n0(s.before ?? 0), delta: signed(d), deltaTone: d < 0 ? "destructive" : "success" };
          }),
          foot: { label: "Жўнатмада", value: ta(total), right: running(p, replayTotals()) },
        });
        break;
      }
      case "SHIPMENT_DELIVERED": {
        const sizes = sizesOf(p.lines);
        const old = sid ? trucks.get(sid) ?? {} : {};
        const rows = sizes ? sizes.map((s) => ({ label: s.label, value: ta(s.qty) })) : idRows(old);
        const total = num(p.deliveredTotal) ?? Object.values(old).reduce((s, v) => s + v, 0);
        items.push({
          ...base,
          group: "load",
          icon: "deliver",
          tone: "success",
          title: `${truck} етказилди`,
          rows,
          foot: rows.length ? { label: "Ҳаммаси", value: ta(total) } : undefined,
        });
        break;
      }
      case "ORDER_SHORT_CLOSED": {
        const qs = Array.isArray(p.quantities) ? p.quantities.map(obj) : [];
        const before = num(obj(p.before).totalPrice);
        const after = num(obj(p.after).totalPrice);
        const rows: HistoryRow[] = qs.map((q) => {
          const ordered = Number(q.ordered) || 0;
          const loaded = Number(q.loaded) || 0;
          const left = Math.max(0, ordered - loaded);
          return { label: String(q.label ?? ""), value: `${n0(loaded)} / ${n0(ordered)} та`, ...(left > 0 ? { note: `${n0(left)} олинмади` } : {}) };
        });
        if (after !== null) rows.push({ label: "Жами", value: `${n0(after)} UZS`, ...(before !== null ? { before: n0(before) } : {}) });
        const refund = num(p.refundDue);
        const sub: HistoryItem["sub"] = [];
        if (refund !== null && refund >= 0.01) sub.push({ text: `Қайтариш керак ${n0(refund)} UZS`, tone: "warning" });
        const reason = str(p.reason);
        if (reason) sub.push({ text: `Сабаб: ${reason}` });
        items.push({ ...base, group: "load", icon: "closeShort", tone: "warning", title: "Юкланганича ёпилди", rows, sub });
        break;
      }
      case "ORDER_PLACED": {
        const reorderOf = str(p.reorderOf);
        const sizes = sizesOf(p.lines);
        const blocks = num(p.totalBlocks);
        const total = num(p.totalPrice);
        const item: HistoryItem = {
          ...base,
          group: "change",
          icon: "placed",
          tone: "muted",
          title: reorderOf ? `Қайта буюртма (${reorderOf} асосида)` : "Буюртма қабул қилинди",
        };
        if (sizes) {
          item.rows = sizes.map((s) => ({ label: s.label, value: ta(s.qty) }));
          item.foot = { label: "Ҳаммаси", value: blocks !== null ? ta(blocks) : undefined, right: total !== null ? `${n0(total)} UZS` : undefined };
        } else {
          const name = /^Order placed for (.+)$/.exec(message)?.[1] ?? /—\s*(.+)$/.exec(message)?.[1] ?? null;
          if (name) item.sub.push({ text: name });
          if (blocks !== null) item.sub.push({ text: ta(blocks) });
          if (total !== null) item.sub.push({ text: `${n0(total)} UZS` });
        }
        items.push(item);
        break;
      }
      case "ORDER_EDITED":
      case "ORDER_RESCHEDULED": {
        const changes = Array.isArray(p.changes) ? p.changes.map(obj) : [];
        const unit = (f: string) => (["line", "lineAdded", "lineRemoved"].includes(f) ? " та" : ["discount", "delivery", "overship", "total"].includes(f) ? " UZS" : "");
        const rows: HistoryRow[] = changes.map((c) => {
          const f = String(c.field ?? "");
          const row: HistoryRow = { label: String(c.label ?? ""), before: String(c.before ?? ""), value: `${String(c.after ?? "")}${unit(f)}` };
          if (unit(f) === " та") {
            const d = (num(String(c.after).replace(/\s/g, "")) ?? 0) - (num(String(c.before).replace(/\s/g, "")) ?? 0);
            if (d !== 0) Object.assign(row, { delta: signed(d), deltaTone: d < 0 ? "destructive" : "success" });
          }
          return row;
        });
        items.push({
          ...base,
          group: "change",
          icon: e.type === "ORDER_RESCHEDULED" ? "date" : "edit",
          tone: "muted",
          title: e.type === "ORDER_RESCHEDULED" ? "Сана ўзгартирилди" : "Буюртма таҳрирланди",
          rows,
          sub: rows.length ? [] : message ? [{ text: message }] : [],
        });
        break;
      }
      case "STATUS_CHANGED": {
        const from = str(p.from);
        const to = str(p.to);
        const reason = str(p.reason);
        items.push({
          ...base,
          group: "change",
          icon: to === "CANCELED" ? "cancel" : to === "DELIVERED" ? "delivered" : "status",
          tone: to === "CANCELED" ? "destructive" : to === "DELIVERED" ? "success" : "muted",
          title: from && to ? statusChangeText(from, to) : message,
          sub: reason ? [{ text: `Сабаб: ${reason}` }] : [],
        });
        break;
      }
      case "PAYMENT_RECORDED": {
        const pid = str(p.paymentId);
        const pay = pid ? payById.get(pid) : undefined;
        const amount = num(p.amount) ?? (pay ? Number(pay.amount) : null);
        const method = methodOf(p, pay, message);
        const receipts = num(p.receipts) ?? pay?.receipts?.length ?? 0;
        const item: HistoryItem = {
          ...base,
          group: "payment",
          icon: "payRecorded",
          tone: "muted",
          title: amount !== null ? `Тўлов ёзилди: ${uzs(amount)}` : message,
        };
        if (method) item.sub.push({ text: method });
        if (receipts > 0) item.sub.push({ text: `чек ${n0(receipts)} та` });
        if (pay?.status === "PENDING_CONFIRMATION") item.sub.push({ text: "тасдиқ кутилмоқда" });
        items.push(item);
        recorded.push({ item, paymentId: pid, amount, actor: e.actor?.id ?? null, at: Date.parse(e.createdAt) });
        break;
      }
      case "PAYMENT_CONFIRMED":
      case "PAYMENT_REJECTED": {
        const pid = str(p.paymentId);
        if (e.type === "PAYMENT_CONFIRMED" && p.autoConfirmed === true) {
          const amount = num(p.amount);
          const t = Date.parse(e.createdAt);
          const twin = recorded.find(
            (r) =>
              (pid && r.paymentId === pid) ||
              (!r.paymentId && r.actor === (e.actor?.id ?? null) && r.amount === amount && Math.abs(r.at - t) <= 10_000),
          );
          if (twin) {
            twin.item.sub = twin.item.sub.filter((s) => s.text !== "тасдиқ кутилмоқда");
            twin.item.sub.push({ text: "тасдиқланди (автоматик)", tone: "success" });
            twin.item.tone = "success";
            break;
          }
        }
        const pay = pid ? payById.get(pid) : undefined;
        const amount = num(p.amount) ?? (pay ? Number(pay.amount) : null);
        const method = methodOf(p, pay, message);
        const ok = e.type === "PAYMENT_CONFIRMED";
        const item: HistoryItem = {
          ...base,
          group: "payment",
          icon: ok ? "payConfirmed" : "payRejected",
          tone: ok ? "success" : "destructive",
          title: amount !== null ? `${ok ? "Тўлов тасдиқланди" : "Тўлов рад этилди"}: ${uzs(amount)}` : message,
        };
        if (method) item.sub.push({ text: method });
        if (ok) {
          const by = str(p.recordedBy) ?? pay?.recordedBy?.name ?? null;
          if (by && p.autoConfirmed !== true) item.sub.push({ text: `ёзган: ${by}` });
        } else {
          const reason = str(p.reason) ?? (pay?.status === "REJECTED" ? pay.notes : null);
          if (reason) item.sub.push({ text: `сабаб: ${reason}` });
        }
        items.push(item);
        break;
      }
      case "REFUND_RECORDED": {
        const amount = num(p.amount);
        const method = methodOf(p, undefined, message);
        items.push({
          ...base,
          group: "payment",
          icon: "refund",
          tone: "warning",
          title: amount !== null ? `Мижозга қайтарилди: ${uzs(amount)}` : message,
          sub: method ? [{ text: method }] : [],
        });
        break;
      }
      default: {
        const label = EVENT_TYPE_LABELS[e.type]?.[0] ?? e.type;
        const icon: HistoryIcon = e.type.startsWith("DELIVERY_LOCATION") ? "location" : e.type === "DELIVERY_PROOF" ? "proof" : "other";
        const text = message && message !== label ? message : "";
        const first = (s: string) => s.split(/[\s:]/)[0]?.toLowerCase();
        const sameStart = text && first(text) === first(label);
        items.push({
          ...base,
          group: "change",
          icon,
          tone: "muted",
          title: sameStart ? text : label,
          sub: text && !sameStart ? [{ text }] : [],
        });
      }
    }
  }
  return items.reverse();
}

/** One-line reading of an item (aria labels, tests, plain-text export). */
export function historyText(i: HistoryItem): string {
  const parts = [i.title];
  if (i.rows.length) {
    parts.push(
      i.rows
        .map((r) => `${r.label} ${r.before ? `${r.before} → ` : ""}${r.value}${r.delta ? ` (${r.delta})` : ""}${r.note ? `, ${r.note}` : ""}`)
        .join(", "),
    );
  }
  if (i.foot) parts.push([i.foot.label, i.foot.value, i.foot.right].filter(Boolean).join(" "));
  for (const s of i.sub) parts.push(s.text);
  if (i.alert) parts.push(i.alert.text);
  return parts.join(" · ");
}

export function historyCounts(items: HistoryItem[], comments: number) {
  const c = { all: items.length + comments, load: 0, payment: 0, change: 0, comment: comments };
  for (const i of items) c[i.group] += 1;
  return c;
}
