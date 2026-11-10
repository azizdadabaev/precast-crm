/**
 * Decision logic of the gazoblok «Янги буюртма» screen (redesign 2026-11-10). Pure and
 * browser-safe: quantities typed per size, the discount switch, the payment preview, the
 * «what is missing» list, date quick picks and the phone lookup match. The server stays
 * the authority — every money figure here is a preview it recomputes.
 */
import { parseMoney } from "@/lib/gazoblok-text";
import { parseDecimal } from "@/lib/gazoblok-quantities";
import { normalizePhone } from "@/lib/phone";
import { paymentStateFor } from "@/lib/payment-state";

/** Typed quantity per productId, kept as text so «1 554» survives editing. */
export type QtyMap = Record<string, string>;

export type CatalogSize = { id: string; label: string; pricePerBlock: number };

export type FormLine = { productId: string; productLabel: string; unitPrice: number; quantity: number };

/** Whole blocks: «1554», «1 554» (space/NBSP groups of 3). Blank = 0, anything else = null. */
export function parseQty(s: string): number | null {
  const t = s.trim();
  if (t === "") return 0;
  if (!/^(\d{1,3}([   ]\d{3})+|\d+)$/.test(t)) return null;
  return Number(t.replace(/[   ]/g, ""));
}

/** 1554 → «1 554» with a plain space, which parseQty reads back. */
export function groupDigits(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** A sum typed back into a money field («Тўлиқ»): «28 006 400», «1 000,5» → «1 000,50». */
export function moneyText(n: number): string {
  const cents = Math.round(n * 100);
  const whole = groupDigits(Math.trunc(cents / 100));
  const frac = cents % 100;
  return frac === 0 ? whole : `${whole},${String(frac).padStart(2, "0")}`;
}

/** Idempotency-Key for placing: kept only while the form body is byte-identical (a network
 *  retry is answered with the first result); any change to the form gets a new key. */
export function placementKey(
  prev: { body: string; key: string } | null,
  body: string,
  newKey: () => string,
): { body: string; key: string } {
  return prev && prev.body === body ? prev : { body, key: newKey() };
}

/** − / + on a size: an unreadable value counts as 0; 0 shows as an empty box. */
export function stepQty(raw: string, delta: number): string {
  const n = Math.max(0, (parseQty(raw) ?? 0) + delta);
  return n === 0 ? "" : groupDigits(n);
}

export function formLines(catalog: CatalogSize[], qty: QtyMap): FormLine[] {
  const lines: FormLine[] = [];
  for (const p of catalog) {
    const q = parseQty(qty[p.id] ?? "");
    if (q && q > 0) lines.push({ productId: p.id, productLabel: p.label, unitPrice: p.pricePerBlock, quantity: q });
  }
  return lines;
}

export function badQtyIds(catalog: CatalogSize[], qty: QtyMap): string[] {
  return catalog.filter((p) => parseQty(qty[p.id] ?? "") === null).map((p) => p.id);
}

/** The wall calculator's result is added onto what is already typed (never replaces it). */
export function addPerSize(
  qty: QtyMap,
  perSize: { productId: string; blocksNeeded: number }[],
  activeIds: Set<string>,
): QtyMap {
  const next = { ...qty };
  for (const s of perSize) {
    if (s.blocksNeeded <= 0 || !activeIds.has(s.productId)) continue;
    next[s.productId] = groupDigits((parseQty(next[s.productId] ?? "") ?? 0) + s.blocksNeeded);
  }
  return next;
}

/** Reorder prefill → one box per size. */
export function qtyFromLines(lines: { productId: string; quantity: number }[]): QtyMap {
  const sums = new Map<string, number>();
  for (const l of lines) sums.set(l.productId, (sums.get(l.productId) ?? 0) + l.quantity);
  return Object.fromEntries(Array.from(sums, ([id, n]) => [id, groupDigits(n)]));
}

export type DiscountMode = "percent" | "amount";

/** One discount field with a [% | UZS] switch: exactly one of the two is sent.
 *  Blank → {} (nothing sent); unreadable or a percent outside 0–100 → null (blocks placing). */
export function discountInput(
  mode: DiscountMode,
  raw: string,
): { discountPercent?: number; discountAmount?: number } | null {
  if (raw.trim() === "") return {};
  if (mode === "amount") {
    const v = parseMoney(raw);
    return v === null ? null : { discountAmount: v };
  }
  const v = parseDecimal(raw);
  return v === null || v < 0 || v > 100 ? null : { discountPercent: v };
}

export type PreviewState = "AWAITING_PAYMENT" | "PARTIALLY_PAID" | "FULLY_PAID" | "OVERPAID";

/**
 * What the order will look like once placed. A payment by someone holding payment.confirm
 * lands CONFIRMED and moves the order's state; anyone else's waits for a confirmer, so the
 * order stays awaiting. Debt is what remains after this payment.
 */
export function paymentPreview(input: { paid: number; total: number; canConfirm: boolean }): {
  state: PreviewState;
  payment: "none" | "confirmed" | "pending";
  debt: number;
} {
  const { paid, total, canConfirm } = input;
  const debt = Math.max(0, total - Math.max(0, paid));
  if (paid <= 0) return { state: "AWAITING_PAYMENT", payment: "none", debt };
  const payment = canConfirm ? "confirmed" : "pending";
  if (paid > total) return { state: "OVERPAID", payment, debt };
  return { state: canConfirm ? paymentStateFor(paid, 0, total) : "AWAITING_PAYMENT", payment, debt };
}

export type ProblemKey =
  | "phone" | "name" | "nameDecision" | "lines"
  | "qty" | "date" | "delivery" | "discount" | "paid" | "paidOverTotal" | "method";

export type Problem = { key: ProblemKey; kind: "missing" | "error"; uz: string; en: string };

export type ProblemInput = {
  phone: string;
  name: string;
  nameDecisionNeeded: boolean;
  lineCount: number;
  badQty: boolean;
  dateBad: boolean;
  deliveryBad: boolean;
  discountBad: boolean;
  paidBad: boolean;
  paid: number;
  total: number;
  methodChosen: boolean;
};

/** Everything that stops placing, in screen order (client → blocks → delivery → payment),
 *  so «Буюртма бериш» can jump to the first one. Same rules as the old canPlace. */
export function orderProblems(i: ProblemInput): Problem[] {
  const out: Problem[] = [];
  const miss = (key: ProblemKey, uz: string, en: string) => out.push({ key, kind: "missing", uz, en });
  const err = (key: ProblemKey, uz: string, en: string) => out.push({ key, kind: "error", uz, en });
  if (!i.phone.trim()) miss("phone", "Телефон рақами", "Phone number");
  if (!i.name.trim()) miss("name", "Мижоз исми", "Client name");
  if (i.nameDecisionNeeded) miss("nameDecision", "Мижоз номи: қолдириш ёки янгилаш", "Client name: keep or update");
  if (i.lineCount === 0 && !i.badQty) miss("lines", "Камида битта ўлчам сони", "A quantity for at least one size");
  if (i.badQty) err("qty", "Блок сони: сонни текширинг", "Block quantity: check the number");
  if (i.dateBad) err("date", "Сана: кк.оо.йййй кўринишида ёзинг", "Date: use dd.mm.yyyy");
  if (i.deliveryBad) err("delivery", "Етказиш нархи: сонни текширинг", "Delivery cost: check the number");
  if (i.discountBad) err("discount", "Чегирма: сонни текширинг", "Discount: check the number");
  if (i.paidBad) {
    err("paid", "Олдиндан тўлов: сонни текширинг", "Advance: check the number");
    return out;
  }
  if (i.paid > 0 && i.paid > i.total) err("paidOverTotal", "Тўлов жамидан кўп", "Payment exceeds the total");
  if (i.paid > 0 && !i.methodChosen) err("method", "Тўлов усули танланмаган", "No payment method chosen");
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymdOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Бугун / Эртага / Индин in the operator's local calendar. */
export function dateQuickPicks(now: Date): { key: "today" | "tomorrow" | "after"; ymd: string; short: string }[] {
  return (["today", "tomorrow", "after"] as const).map((key, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    return { key, ymd: ymdOf(d), short: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}` };
  });
}

/** «2026-11-11» → «11.11.2026» (the app's date order, never the browser's mm/dd). */
export function formatYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}.${m}.${y}`;
}

/** «11.11.2026» (day and month may be one digit) → «2026-11-11»; impossible dates → null. */
export function parseDmy(s: string): string | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return ymdOf(dt);
}

const WEEKDAYS_UZ = ["якшанба", "душанба", "сешанба", "чоршанба", "пайшанба", "жума", "шанба"];

export function weekdayUz(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return WEEKDAYS_UZ[new Date(y, m - 1, d).getDay()];
}

/** Same value the old date input sent: the day at UTC midnight. */
export function scheduledAtIso(ymd: string): string {
  return new Date(ymd).toISOString();
}

/** Phone is the client's identity: only the same normalized number is a match. */
export function exactPhoneMatch<T extends { phone: string }>(typed: string, rows: T[]): T | null {
  const norm = normalizePhone(typed);
  if (!norm) return null;
  return rows.find((r) => normalizePhone(r.phone) === norm) ?? null;
}

export function phoneLooksComplete(typed: string): boolean {
  return typed.replace(/\D+/g, "").length >= 9;
}

/** Stock is information only at placement (it moves when a truck is loaded). */
export function stockTone(quantity: number | null | undefined, lowThreshold: number): "none" | "low" | "ok" {
  const q = quantity ?? 0;
  if (q <= 0) return "none";
  return q < lowThreshold ? "low" : "ok";
}
