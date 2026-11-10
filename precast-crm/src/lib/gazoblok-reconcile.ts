/**
 * One-time reconciliation for the switch to per-truck stock (renovation Stage 1).
 * Before the switch, stock moved only when an order was DELIVERED, so blocks on
 * trucks of still-open orders were never written off. This plans the missing
 * write-offs per shipment and product; the script prints it (dry-run) and only
 * posts it on --apply. Cancelled orders with loads are listed, and moved only when
 * the owner names them — whether those blocks really left the yard is his call.
 */
export type ReconcileOrder = {
  id: string;
  orderNumber: string;
  status: string;
  lines: { id: string; productId: string | null; productLabel: string }[];
  shipments: { id: string; number: number; status: string; loadedLines: unknown }[];
  movements: { shipmentId: string | null; productId: string; change: number }[];
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
    if (o.status === "DELIVERED") continue;

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
