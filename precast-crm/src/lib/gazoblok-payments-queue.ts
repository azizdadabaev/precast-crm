// Pure helpers for GET /api/gazoblok/payments (the gazoblok section of /payments).

import { countsFrom } from "@/lib/payment-counts";

export const QUEUE_STATUSES = ["PENDING_CONFIRMATION", "CONFIRMED", "REJECTED"] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const QUEUE_DEFAULT: QueueStatus = "PENDING_CONFIRMATION";

/** Missing → the pending tab; an unknown value → null, which the route answers with 400. */
export function parseQueueStatus(v: string | null): QueueStatus | null {
  if (v === null) return QUEUE_DEFAULT;
  return (QUEUE_STATUSES as readonly string[]).includes(v) ? (v as QueueStatus) : null;
}

/** Zero-filled tab counts from a groupBy(status) — same shape as the beam queue. */
export function queueCounts(
  groups: { status: string; _count: { _all: number } }[],
): { pending: number; confirmed: number; rejected: number } {
  return countsFrom(groups);
}

/** Row timestamp per spec §6: «дд.мм.йййй сс:дд» (viewer's local time). */
export function queueStamp(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(date.getDate())}.${p(date.getMonth() + 1)}.${date.getFullYear()} ${p(date.getHours())}:${p(date.getMinutes())}`;
}
