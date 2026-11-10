/**
 * Gazoblok stock history route helpers — query parsing and cursor paging (spec §6). Pure.
 */
import type { GazoblokStockReason } from "@prisma/client";
import { MOVEMENT_REASON_LABELS } from "@/lib/gazoblok-stock-history";

export type MovementQuery = { productId?: string; reason?: GazoblokStockReason; cursor?: string; limit: number };

// Whitelisted against the enum — an arbitrary string would throw deep in Prisma.
const REASONS = Object.keys(MOVEMENT_REASON_LABELS) as GazoblokStockReason[];

export function parseMovementQuery(sp: URLSearchParams): MovementQuery {
  const rawLimit = Number(sp.get("limit"));
  const q: MovementQuery = {
    limit: sp.get("limit") && Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, Math.trunc(rawLimit))) : 50,
  };
  const productId = sp.get("productId");
  if (productId) q.productId = productId;
  const reason = REASONS.find((r) => r === sp.get("reason"));
  if (reason) q.reason = reason;
  const cursor = sp.get("cursor");
  if (cursor) q.cursor = cursor;
  return q;
}

/** Rows were fetched with take = limit + 1; the extra row only proves a next page exists. */
export function pageOf<T extends { id: string }>(rows: T[], limit: number): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
}
