import type { IsoDate } from "./engine";

/** 5928500 → "5 928 500"; negatives use a real minus sign. Whole so'm only. */
export function fmtSom(n: number): string {
  const s = String(Math.abs(Math.trunc(n))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return n < 0 ? `−${s}` : s;
}

/** "2026-09-04" → "04.09" */
export function fmtDay(iso: IsoDate): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

/** Monday-first short weekday names. */
export const WEEKDAY_UZ = ["Душ", "Сеш", "Чор", "Пай", "Жум", "Шан", "Якш"];

/** 0.0123 → "1,2%" (decimal comma). */
export function fmtPct(x: number): string {
  return `${(x * 100).toFixed(1).replace(".", ",")}%`;
}
