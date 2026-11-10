/**
 * Gazoblok Uzbek texts — API messages, status names and order-history rows.
 * Old event rows were written in English («Order placed for …», «Payment of 1000000 …»);
 * known types are rebuilt from their payload so history reads in Uzbek. Pure.
 */
import { formatNumber } from "@/lib/utils";

type Status = "PLACED" | "IN_PRODUCTION" | "DELIVERED" | "CANCELED";

export const STATUS_LABELS: Record<Status, [string, string]> = {
  PLACED: ["Қабул қилинган", "Placed"],
  IN_PRODUCTION: ["Ишлаб чиқилмоқда", "In production"],
  DELIVERED: ["Етказилган", "Delivered"],
  CANCELED: ["Бекор қилинган", "Canceled"],
};

const SEP = " · ";

const TWO_DP = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Money on screen, one rule everywhere (owner 2026-11-10): sums are whole UZS; an older
 *  row's tiyin show, as two digits, only when they are non-zero («36 298 738,80», «0,80»). */
export function uzsText(v: number): string {
  const cents = Math.round(v * 100);
  return cents % 100 === 0 ? formatNumber(cents / 100 + 0, 0) : TWO_DP.format(cents / 100);
}

/** API messages are "Узбекча · English"; UZ-only mode shows the part before the first separator. */
export function uzPart(message: string, lang: "uz" | "bilingual"): string {
  if (lang === "bilingual") return message;
  const i = message.indexOf(SEP);
  return i === -1 ? message : message.slice(0, i);
}

function statusName(s: string): string {
  return s in STATUS_LABELS ? STATUS_LABELS[s as Status][0] : s;
}

export function placedText(clientName: string, reorderOf: string | null): string {
  return reorderOf ? `Қайта буюртма (${reorderOf} асосида) — ${clientName}` : `Буюртма қабул қилинди — ${clientName}`;
}

export function statusChangeText(from: string, to: string): string {
  return `Ҳолат: ${statusName(from)} → ${statusName(to)}`;
}

function field(payload: unknown, key: string): unknown {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>)[key] : undefined;
}

export function eventText(e: { type: string; message: string | null; payload: unknown }): string {
  const message = e.message ?? "";
  if (e.type === "STATUS_CHANGED") {
    const from = field(e.payload, "from");
    const to = field(e.payload, "to");
    if (typeof from === "string" && typeof to === "string") return statusChangeText(from, to);
  }
  if (e.type === "ORDER_PLACED") {
    const name = /^Order placed for (.+)$/.exec(message)?.[1];
    const reorderOf = field(e.payload, "reorderOf");
    if (name) return placedText(name, typeof reorderOf === "string" ? reorderOf : null);
  }
  if ((e.type === "PAYMENT_RECORDED" || e.type === "PAYMENT_CONFIRMED") && message.startsWith("Payment")) {
    const raw = field(e.payload, "amount");
    const amount = raw == null || raw === "" ? NaN : Number(raw);
    if (Number.isFinite(amount)) {
      const verb = e.type === "PAYMENT_RECORDED" ? "Тўлов ёзилди" : "Тўлов тасдиқланди";
      return `${verb}: ${formatNumber(amount, 2)} UZS`;
    }
  }
  return message;
}

/**
 * Money typed by an operator, in UZS: "1 000 000" (space, NBSP or narrow NBSP between
 * 3-digit groups), "1000000", "1 000,50". At most 2 decimals, so "1,000" / "12,500" are
 * refused rather than read as 1 or 12,5 UZS — a thousands comma must never shrink a sum.
 * Negatives and empty → null.
 */
export function parseMoney(s: string): number | null {
  const t = s.trim();
  if (!/^(\d{1,3}([   ]\d{3})+|\d+)([.,]\d{1,2})?$/.test(t)) return null;
  return Number(t.replace(/[   ]/g, "").replace(",", "."));
}
