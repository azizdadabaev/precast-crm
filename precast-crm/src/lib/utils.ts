import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(value: number | string, currency = "UZS"): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatNumber(value: number | string, digits = 2): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(n);
}

export function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

// ── Grid rounding helpers (used by the calculator's snap-up/down buttons) ──
//
// Operators prefer round numbers (multiples of 5 cm or 10 cm) on cut lists,
// even though the factory cuts beams to order. Both helpers ALWAYS step the
// value strictly past the requested grid line so that a user clicking "up"
// twice on a value that already sits on a grid line advances by two grid
// units, not one. The epsilon defends against floating-point drift from
// values like 0.1 + 0.2 = 0.30000000000000004.
const GRID_EPS = 1e-9;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function roundUpToGrid(value: number, grid: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(grid) || grid <= 0) return value;
  return round3(Math.ceil((value + GRID_EPS) / grid) * grid);
}

export function roundDownToGrid(value: number, grid: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(grid) || grid <= 0) return value;
  return round3(Math.floor((value - GRID_EPS) / grid) * grid);
}
