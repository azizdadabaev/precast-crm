/**
 * Numbers on the layout board and sheet: decimal comma, plain-space thousands,
 * fixed decimals so sizes read "4,90 × 4,06" like the quote sheet.
 */
export function fmtFixed(value: number, digits = 2): string {
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    .format(value)
    .replace(/[\s  ]/g, " ");
}

/** Whole numbers with plain-space thousands: 1554 → "1 554". */
export function fmtInt(value: number): string {
  return fmtFixed(Math.round(value), 0);
}
