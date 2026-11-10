/**
 * Reorder draft — a past order turned into a prefilled new-order form (spec §3).
 * Owner: "sometimes the same client will order for 2nd time, we should have a
 * feature as new order or reorder for the same client."
 * Copies ordered quantities at TODAY's catalog price; sizes archived or deleted
 * since are listed in `dropped`, never silently lost and never billed.
 * Delivery, discount and date are hints only — delivery is agreed each time.
 * Pure: no Prisma.
 */
import { lineQuantities } from "@/lib/gazoblok-quantities";

export type ReorderDraft = {
  source: { id: string; orderNumber: string; placedAt: string; status: string };
  client: { name: string; phone: string; address: string | null };
  lines: {
    productId: string;
    label: string;
    quantity: number;
    unitPrice: number;
    previousUnitPrice: number;
    previousLoaded: number;
  }[];
  dropped: { label: string; quantity: number }[];
  previous: { deliveryCost: number; discountPercent: number; scheduledAt: string | null };
};

type ReorderSource = {
  id: string;
  orderNumber: string;
  placedAt: Date;
  status: string;
  deliveryCost: number;
  discountPercent: number;
  scheduledAt: Date | null;
  client: { name: string; phone: string; address: string | null };
  lines: { id: string; productId: string | null; productLabel: string; quantity: number; unitPrice: number }[];
  shipments: { loadedLines: unknown }[];
};

type CatalogProduct = { id: string; label: string; pricePerBlock: number; active: boolean };

export function reorderDraft(src: ReorderSource, catalog: CatalogProduct[]): ReorderDraft {
  const products = new Map(catalog.map((p) => [p.id, p]));
  const qty = lineQuantities(src.lines, src.shipments);
  const lines: ReorderDraft["lines"] = [];
  const dropped: ReorderDraft["dropped"] = [];

  src.lines.forEach((l, i) => {
    const p = l.productId ? products.get(l.productId) : undefined;
    if (!p || !p.active) {
      dropped.push({ label: p?.label ?? l.productLabel, quantity: l.quantity });
      return;
    }
    lines.push({
      productId: p.id,
      label: p.label,
      quantity: l.quantity,
      unitPrice: Number(p.pricePerBlock),
      previousUnitPrice: Number(l.unitPrice),
      previousLoaded: qty[i].loaded,
    });
  });

  return {
    source: { id: src.id, orderNumber: src.orderNumber, placedAt: src.placedAt.toISOString(), status: src.status },
    client: { name: src.client.name, phone: src.client.phone, address: src.client.address },
    lines,
    dropped,
    previous: {
      deliveryCost: Number(src.deliveryCost),
      discountPercent: Number(src.discountPercent),
      scheduledAt: src.scheduledAt ? src.scheduledAt.toISOString() : null,
    },
  };
}
