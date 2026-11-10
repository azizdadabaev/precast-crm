/**
 * Gazoblok uses the SAME permission keys as beam-and-block (owner, 2026-11-10:
 * "same permission levels will apply"). Like beam-and-block, order.view sees
 * every order (order.viewAll is not used anywhere in the CRM).
 */
import type { Action } from "@/lib/permissions";

export const GAZOBLOK_PERMISSION = {
  viewOrders: "order.view",
  placeOrder: "order.create",
  editOrder: "order.edit",
  correctDeliveredTruck: "order.editShipped",
  cancelOrder: "order.cancel",
  recordPayment: "payment.record",
  confirmPayment: "payment.confirm",
  viewStock: "inventory.view",
  manageStock: "inventory.manage",
  editPrices: "pricing.edit",
} as const satisfies Record<string, Action>;

const PAGES: [prefix: string, rule: Action][] = [
  ["/gazoblok/orders", GAZOBLOK_PERMISSION.viewOrders],
  ["/gazoblok/new", GAZOBLOK_PERMISSION.placeOrder],
  ["/gazoblok/stock", GAZOBLOK_PERMISSION.viewStock],
  ["/gazoblok/production", GAZOBLOK_PERMISSION.viewStock],
  ["/gazoblok/catalog", GAZOBLOK_PERMISSION.editPrices],
];

/** Permission a gazoblok page needs (longest prefix wins), or null when not a gazoblok page. */
export function gazoblokPageRule(pathname: string): Action | null {
  const hit = PAGES.filter(([p]) => pathname === p || pathname.startsWith(p + "/")).sort((a, b) => b[0].length - a[0].length)[0];
  return hit ? hit[1] : null;
}

/** page-auth entries for the gazoblok pages (spread into the CRM's page map). */
export const GAZOBLOK_PAGE_RULES: Record<string, Action> = Object.fromEntries(PAGES);
