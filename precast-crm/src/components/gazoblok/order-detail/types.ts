import type { LineQty } from "@/lib/gazoblok-quantities";

export type OrderStatus = "PLACED" | "IN_PRODUCTION" | "DELIVERED" | "CANCELED";
export type PaymentState = "AWAITING_PAYMENT" | "PARTIALLY_PAID" | "FULLY_PAID";
export type PaymentStatus = "PENDING_CONFIRMATION" | "CONFIRMED" | "REJECTED";
export type ShipmentStatus = "PENDING" | "LOADED" | "DELIVERED";

export type Shipment = {
  id: string;
  number: number;
  status: ShipmentStatus;
  loadedLines: Record<string, number> | null;
  loadedPhotoUrls: string[];
  loadedAt: string | null;
  deliveredAt: string | null;
  notes: string | null;
};

export type Payment = {
  id: string;
  amount: string;
  method: string;
  status: PaymentStatus;
  recordedAt: string | null;
  confirmedAt: string | null;
  recordedById: string | null;
  confirmedById: string | null;
  notes: string | null;
  receipts: Array<{ id: string; imageUrl: string }>;
  recordedBy: { id: string; name: string } | null;
};

export type OrderEvent = {
  id: string;
  type: string;
  message: string | null;
  payload: unknown;
  createdAt: string;
  actor: { id: string; name: string } | null;
};

/** GET /api/gazoblok/orders/[id] as the detail page reads it. */
export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentState: PaymentState;
  confirmedPaid: string;
  totalPrice: string;
  totalBlocks: number;
  totalVolumeM3: string;
  linesSubtotal: string;
  discountPercent: string;
  discountAmount: string;
  deliveryCost: string;
  overshipAmount: string;
  notes: string | null;
  scheduledAt: string | null;
  sourceOrder: { id: string; orderNumber: string } | null;
  reorders: Array<{ id: string; orderNumber: string }>;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryLocationUrl: string | null;
  deliveryLocationLabel: string | null;
  deliveryProofUrl: string | null;
  deliveryProofUploadedAt: string | null;
  placedAt: string | null;
  deliveredAt: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  shortClosedAt: string | null;
  shortCloseReason: string | null;
  quantities: LineQty[];
  unpaidOverload: number;
  refundDue: number;
  createdBy: { id: string; name: string } | null;
  wallEstimate: Record<string, unknown> | null;
  client: { id: string; name: string; phone: string; address: string | null };
  lines: Array<{
    id: string;
    productLabel: string;
    unitPrice: string;
    quantity: number;
    lineTotal: string;
    product: { id: string; label: string; lengthM: string; heightM: string; thicknessM: string } | null;
  }>;
  shipments: Shipment[];
  payments: Payment[];
  events: OrderEvent[];
}
