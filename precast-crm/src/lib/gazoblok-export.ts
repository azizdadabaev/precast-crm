/**
 * Gazoblok sheet of the owner's Excel backup (GET /api/orders/export).
 * Pure: the route queries and Numbers the Decimals; this flattens one order
 * into one row. Headers are English like the beam sheets beside it.
 */
import { round2 } from "@/services/calculation-engine";
import { lineQuantities, unpaidOverload } from "@/lib/gazoblok-quantities";

export type GazoblokExportInput = {
  id: string;
  orderNumber: string;
  status: string;
  paymentState: string;
  client: { name: string; phone: string; address: string | null } | null;
  createdBy: { name: string } | null;
  placedAt: Date;
  scheduledAt: Date | null;
  deliveredAt: Date | null;
  canceledAt: Date | null;
  cancelReason: string | null;
  shortClosedAt: Date | null;
  shortCloseReason: string | null;
  totalVolumeM3: number;
  linesSubtotal: number;
  discountPercent: number;
  discountAmount: number;
  deliveryCost: number;
  overshipAmount: number;
  totalPrice: number;
  confirmedPaid: number;
  notes: string | null;
  lines: { id: string; productId: string | null; productLabel: string; quantity: number }[];
  shipments: { status: string; loadedLines: unknown }[];
  payments: { amount: number; status: string }[];
};

export const GAZOBLOK_EXPORT_COLUMNS: { header: string; key: string; width: number }[] = [
  { header: "Order #", key: "orderNumber", width: 16 },
  { header: "Status", key: "status", width: 14 },
  { header: "Payment state", key: "paymentState", width: 18 },
  { header: "Client name", key: "clientName", width: 28 },
  { header: "Client phone", key: "clientPhone", width: 16 },
  { header: "Client address", key: "clientAddress", width: 36 },
  { header: "Seller", key: "seller", width: 22 },
  { header: "Placed at", key: "placedAt", width: 18 },
  { header: "Scheduled at", key: "scheduledAt", width: 18 },
  { header: "Delivered at", key: "deliveredAt", width: 18 },
  { header: "Canceled at", key: "canceledAt", width: 18 },
  { header: "Cancel reason", key: "cancelReason", width: 28 },
  { header: "Short closed at", key: "shortClosedAt", width: 18 },
  { header: "Short close reason", key: "shortCloseReason", width: 28 },
  { header: "Lines", key: "lines", width: 40 },
  { header: "Blocks ordered", key: "blocksOrdered", width: 14 },
  { header: "Blocks loaded", key: "blocksLoaded", width: 14 },
  { header: "Blocks over", key: "blocksOver", width: 12 },
  { header: "Volume m³", key: "volumeM3", width: 12 },
  { header: "Lines subtotal", key: "linesSubtotal", width: 16 },
  { header: "Discount %", key: "discountPercent", width: 12 },
  { header: "Discount amount", key: "discountAmount", width: 16 },
  { header: "Delivery cost", key: "deliveryCost", width: 14 },
  { header: "Over-load amount", key: "overshipAmount", width: 16 },
  { header: "Total price", key: "totalPrice", width: 16 },
  { header: "Confirmed paid", key: "confirmedPaid", width: 16 },
  { header: "Pending paid", key: "pendingPaid", width: 16 },
  { header: "Remaining", key: "remaining", width: 16 },
  { header: "Unpaid over-load", key: "unpaidOverload", width: 16 },
  { header: "Trucks", key: "trucks", width: 10 },
  { header: "Notes", key: "notes", width: 40 },
  { header: "Order ID", key: "id", width: 28 },
];

export function gazoblokExportRow(o: GazoblokExportInput): Record<string, string | number | Date | null> {
  const qty = lineQuantities(o.lines, o.shipments);
  const pending = round2(
    o.payments.filter((p) => p.status === "PENDING_CONFIRMATION").reduce((s, p) => s + p.amount, 0),
  );
  const trucksDone = o.shipments.filter((s) => s.status === "LOADED" || s.status === "DELIVERED").length;
  return {
    orderNumber: o.orderNumber,
    status: o.status,
    paymentState: o.paymentState,
    clientName: o.client?.name ?? "",
    clientPhone: o.client?.phone ?? "",
    clientAddress: o.client?.address ?? "",
    seller: o.createdBy?.name ?? "",
    placedAt: o.placedAt,
    scheduledAt: o.scheduledAt,
    deliveredAt: o.deliveredAt,
    canceledAt: o.canceledAt,
    cancelReason: o.cancelReason ?? "",
    shortClosedAt: o.shortClosedAt,
    shortCloseReason: o.shortCloseReason ?? "",
    lines: qty.map((q) => `${q.label}: ${q.ordered}/${q.loaded}`).join("; "),
    blocksOrdered: qty.reduce((s, q) => s + q.ordered, 0),
    blocksLoaded: qty.reduce((s, q) => s + q.loaded, 0),
    blocksOver: qty.reduce((s, q) => s + q.over, 0),
    volumeM3: o.totalVolumeM3,
    linesSubtotal: o.linesSubtotal,
    discountPercent: o.discountPercent,
    discountAmount: o.discountAmount,
    deliveryCost: o.deliveryCost,
    overshipAmount: o.overshipAmount,
    totalPrice: o.totalPrice,
    confirmedPaid: o.confirmedPaid,
    pendingPaid: pending,
    remaining: round2(Math.max(0, o.totalPrice - o.confirmedPaid - pending)),
    unpaidOverload: unpaidOverload(o),
    trucks: `${trucksDone}/${o.shipments.length}`,
    notes: o.notes ?? "",
    id: o.id,
  };
}
