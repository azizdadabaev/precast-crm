/** A catalog size as the form uses it (Decimal strings already turned into numbers). */
export type FormProduct = {
  id: string;
  label: string;
  lengthM: number;
  heightM: number;
  thicknessM: number;
  pricePerBlock: number;
  volumeM3: number;
  stock: number | null;
  lowStockThreshold: number;
};

/** Reorder hints per size: what the last truck(s) took, and the old price when it changed. */
export type LineNotes = Record<string, { previousLoaded: number; previousUnitPrice: number | null }>;

export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CLICK" | "PAYME" | "OTHER";

/** The POST /api/gazoblok/orders answer the success screen reads. */
export type PlacedOrder = {
  id: string;
  orderNumber: string;
  placedAt: string;
  scheduledAt: string | null;
  totalPrice: string;
  totalBlocks: number;
  totalVolumeM3: string;
  paymentState: "AWAITING_PAYMENT" | "PARTIALLY_PAID" | "FULLY_PAID";
  confirmedPaid: string;
  client: { name: string; phone: string; address: string | null };
};
