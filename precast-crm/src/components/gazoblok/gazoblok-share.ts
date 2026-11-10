/**
 * What the gazoblok share card prints, and its send-to-chat caption. Pure.
 * The card shows what the client is billed for: ordered quantities on an open order
 * (an over-load stays its own line, as on the order screen); loaded quantities once
 * the order was closed short — there the over-load is already inside the rows, so
 * rows − discount + delivery + over-load always equals the stored total.
 */
import { formatNumber } from "@/lib/utils";
import { blockWeightKg, orderWeightKg, GAZOBLOK_DENSITY_KG_PER_M3 } from "@/lib/gazoblok-weight";
import { loadedByLine } from "@/lib/gazoblok-quantities";
import { round2 } from "@/services/calculation-engine";

/** The fields of the order detail GET the card reads (Decimals arrive as strings). */
export type ShareOrder = {
  orderNumber: string;
  client: { name: string };
  shortClosedAt: string | null;
  linesSubtotal: string;
  discountAmount: string;
  deliveryCost: string;
  overshipAmount: string;
  totalPrice: string;
  totalBlocks: number;
  totalVolumeM3: string;
  lines: {
    id: string;
    productLabel: string;
    unitPrice: string;
    quantity: number;
    product: { lengthM: string; heightM: string; thicknessM: string } | null;
  }[];
  shipments: { loadedLines: Record<string, number> | null }[];
};

export type ShareSummary = {
  rows: { key: string; label: string; quantity: number; unitPrice: number; sum: number }[];
  subtotal: number;
  discount: number;
  delivery: number;
  overship: number;
  total: number;
  weightKg: number;
  volumeM3: number;
};

export function shareSummary(o: ShareOrder): ShareSummary {
  const closed = o.shortClosedAt !== null;
  const loaded = loadedByLine(o.shipments);
  // A line whose product was deleted has no dimensions: give it the order's average block.
  const avgBlockM3 = o.totalBlocks > 0 ? Number(o.totalVolumeM3) / o.totalBlocks : 0;
  const blockM3 = (l: ShareOrder["lines"][number]) =>
    l.product ? Number(l.product.lengthM) * Number(l.product.heightM) * Number(l.product.thicknessM) : avgBlockM3;

  const rows = o.lines.map((l) => {
    const quantity = closed ? loaded.get(l.id) ?? 0 : l.quantity;
    const unitPrice = Number(l.unitPrice);
    return { key: l.id, label: l.productLabel, quantity, unitPrice, sum: round2(unitPrice * quantity) };
  });
  const weightKg = orderWeightKg(o.lines.map((l, i) => ({
    lineId: l.id,
    label: l.productLabel,
    quantity: rows[i].quantity,
    perBlockKg: l.product
      ? blockWeightKg(Number(l.product.lengthM), Number(l.product.heightM), Number(l.product.thicknessM))
      : avgBlockM3 * GAZOBLOK_DENSITY_KG_PER_M3,
  })));
  const volumeM3 = o.lines.reduce((s, l, i) => s + blockM3(l) * rows[i].quantity, 0);

  return {
    rows,
    subtotal: round2(rows.reduce((s, r) => s + r.sum, 0)),
    discount: Number(o.discountAmount),
    delivery: Number(o.deliveryCost),
    overship: closed ? 0 : Number(o.overshipAmount),
    total: Number(o.totalPrice),
    weightKg,
    volumeM3,
  };
}

/** Send-to-chat caption, as beam-and-block's: number · name / total / weight. */
export function shareCaption(o: ShareOrder): string {
  const s = shareSummary(o);
  return [
    `№${o.orderNumber}${o.client.name ? ` · ${o.client.name}` : ""}`,
    `Жами: ${formatNumber(s.total, 0)} so'm`,
    `Оғирлик: ${formatNumber(Math.round(s.weightKg), 0)} кг`,
  ].join("\n");
}
