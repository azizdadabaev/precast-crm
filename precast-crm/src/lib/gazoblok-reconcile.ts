/**
 * One-time reconciliation for the switch to per-truck stock (renovation Stage 1).
 * Before the switch, stock moved only when an order was DELIVERED, so blocks on
 * trucks of still-open orders were never written off. This plans the missing
 * write-offs per shipment and product; the script prints it (dry-run) and only
 * posts it on --apply. Cancelled orders with loads are listed, and moved only when
 * the owner names them — whether those blocks really left the yard is his call.
 */
/** Advisory-lock key shared by every --apply run (reconcile and undo replay). */
export const RECONCILE_LOCK = "gazoblok_reconcile_stock";

/** Serialize reconcile runs: two at once could both pass the "not yet posted"
 *  check and post the same movements twice. Held until the transaction ends. */
export async function lockReconcile(tx: {
  $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
}): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${RECONCILE_LOCK}))`;
}

export type ReconcileOrder = {
  id: string;
  orderNumber: string;
  status: string;
  lines: { id: string; productId: string | null; productLabel: string }[];
  shipments: { id: string; number: number; status: string; loadedLines: unknown }[];
  movements: { shipmentId: string | null; productId: string; change: number; reason: string }[];
  placedEventActorId: string | null;
  createdById: string | null;
};

export type ReconcileMove = {
  orderId: string;
  orderNumber: string;
  shipmentId: string;
  productId: string;
  label: string;
  change: number;
};

export type ReconcilePlan = {
  moves: ReconcileMove[];
  canceledWithLoads: { orderNumber: string; blocks: number }[];
  createdByBackfill: { orderId: string; userId: string }[];
};

const loads = (raw: unknown): Record<string, number> =>
  raw && typeof raw === "object"
    ? Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, Number(v) || 0]))
    : {};

export function planStockReconcile(orders: ReconcileOrder[], includeCanceled: Set<string>): ReconcilePlan {
  const plan: ReconcilePlan = { moves: [], canceledWithLoads: [], createdByBackfill: [] };
  for (const o of orders) {
    if (!o.createdById && o.placedEventActorId) plan.createdByBackfill.push({ orderId: o.id, userId: o.placedEventActorId });
    // Decided by the ledger, not the status: the old code wrote a delivered order off with
    // one SALE row. An order delivered after the switch (before --apply) has none and still
    // needs its per-truck write-offs.
    if (o.movements.some((m) => m.reason === "SALE")) continue;

    const moves: ReconcileMove[] = [];
    for (const sh of o.shipments) {
      if (sh.status !== "LOADED" && sh.status !== "DELIVERED") continue;
      const perProduct = new Map<string, { label: string; blocks: number }>();
      for (const [lineId, n] of Object.entries(loads(sh.loadedLines))) {
        const line = o.lines.find((l) => l.id === lineId);
        if (!line?.productId || n <= 0) continue;
        const cur = perProduct.get(line.productId) ?? { label: line.productLabel, blocks: 0 };
        cur.blocks += n;
        perProduct.set(line.productId, cur);
      }
      for (const [productId, { label, blocks }] of perProduct) {
        const posted = o.movements
          .filter((m) => m.shipmentId === sh.id && m.productId === productId)
          .reduce((s, m) => s + m.change, 0);
        const change = -blocks - posted; // posted is ≤ 0 for write-offs already made
        if (change !== 0) moves.push({ orderId: o.id, orderNumber: o.orderNumber, shipmentId: sh.id, productId, label, change });
      }
    }
    if (moves.length === 0) continue;
    if (o.status === "CANCELED" && !includeCanceled.has(o.orderNumber)) {
      plan.canceledWithLoads.push({ orderNumber: o.orderNumber, blocks: -moves.reduce((s, m) => s + m.change, 0) });
      continue;
    }
    plan.moves.push(...moves);
  }
  return plan;
}

/** Note on every movement the reconcile posts; the undo replay matches against it. */
export const RECONCILE_NOTE = "Renovation reconcile: loaded before per-truck stock";
/** Note on every movement an undo replay posts; a second replay of the same moves is refused. */
export const UNDO_NOTE = "reconcile undo";

type MoveKey = { orderId: string; shipmentId: string; productId: string };
export type UndoMove = MoveKey & { change: number };

/** The inverse movements (signs flipped, everything else kept) — what the undo file holds. */
export function invertMoves<T extends { change: number }>(moves: T[]): T[] {
  return moves.map((m) => ({ ...m, change: -m.change }));
}

const keyOf = (m: MoveKey) => `${m.orderId}|${m.shipmentId}|${m.productId}`;

function asUndoMove(x: unknown): UndoMove | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  const { orderId, shipmentId, productId, change } = r;
  if (typeof orderId !== "string" || typeof shipmentId !== "string" || typeof productId !== "string") return null;
  if (typeof change !== "number" || !Number.isInteger(change) || change === 0) return null;
  return { orderId, shipmentId, productId, change };
}

/**
 * Checks an undo file against the posted movements before anything is written.
 * Every line must cancel exactly one movement the reconcile posted (same order,
 * truck, size, opposite amount — each posted row matched once), and none of its
 * trucks/sizes may carry an earlier undo. Anything else → problems, nothing moves.
 */
export function planUndo(
  file: unknown,
  posted: (MoveKey & { change: number; note: string | null })[],
): { moves: UndoMove[] } | { problems: string[] } {
  if (!Array.isArray(file) || file.length === 0) return { problems: ["Undo file must be a non-empty list of moves"] };
  const problems: string[] = [];
  const moves: UndoMove[] = [];
  file.forEach((x, i) => {
    const m = asUndoMove(x);
    if (m) moves.push(m);
    else problems.push(`Line ${i + 1}: needs orderId, shipmentId, productId (text) and a whole non-zero change`);
  });
  if (problems.length) return { problems };

  const undone = new Set(posted.filter((p) => p.note === UNDO_NOTE).map(keyOf));
  const unused = posted.filter((p) => p.note === RECONCILE_NOTE).map((p) => ({ ...p, used: false }));
  moves.forEach((m, i) => {
    if (undone.has(keyOf(m))) {
      problems.push(`Line ${i + 1}: already undone (${keyOf(m)})`);
      return;
    }
    const match = unused.find((p) => !p.used && keyOf(p) === keyOf(m) && p.change === -m.change);
    if (match) match.used = true;
    else problems.push(`Line ${i + 1}: no reconcile movement of ${-m.change} for ${keyOf(m)}`);
  });
  return problems.length ? { problems } : { moves };
}
