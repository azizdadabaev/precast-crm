/**
 * New-order form helpers: turning a reorder draft into form state (spec §3) and
 * reading optional typed numbers. Pure, browser-safe.
 * Delivery, discount and date are never copied — delivery is agreed each time
 * (owner decision 5); the old values only come back as greyed hints.
 */
import type { ReorderDraft } from "@/lib/gazoblok-reorder";
import { formatPhone } from "@/lib/phone";

export type ReorderPrefill = {
  client: { name: string; phone: string; address: string };
  lines: { productId: string; productLabel: string; unitPrice: number; quantity: number }[];
  /** Per product: what the last truck(s) took, and the old price when today's differs. */
  notes: Record<string, { previousLoaded: number; previousUnitPrice: number | null }>;
  dropped: ReorderDraft["dropped"];
  hints: { deliveryCost: number; discountPercent: number };
};

export function reorderPrefill(d: ReorderDraft): ReorderPrefill {
  const notes: ReorderPrefill["notes"] = {};
  for (const l of d.lines) {
    notes[l.productId] = {
      previousLoaded: l.previousLoaded,
      previousUnitPrice: l.previousUnitPrice !== l.unitPrice ? l.previousUnitPrice : null,
    };
  }
  return {
    client: { name: d.client.name, phone: formatPhone(d.client.phone), address: d.client.address ?? "" },
    lines: d.lines.map((l) => ({ productId: l.productId, productLabel: l.label, unitPrice: l.unitPrice, quantity: l.quantity })),
    notes,
    dropped: d.dropped,
    hints: { deliveryCost: d.previous.deliveryCost, discountPercent: d.previous.discountPercent },
  };
}

/** An optional typed number: blank → undefined (not sent), unreadable → null (blocks placing). */
export function optionalNumber(s: string, parse: (s: string) => number | null): number | undefined | null {
  return s.trim() === "" ? undefined : parse(s);
}
