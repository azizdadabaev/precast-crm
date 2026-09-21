import { describe, it, expect, vi, beforeEach } from "vitest";

const orderFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { order: { findUnique: (...a: unknown[]) => orderFindUnique(...a) } },
}));

import { buildShareDataFromOrder } from "@/lib/order-share-card";
import { buildShareDataFromProject } from "@/lib/agent/quote-card";
import { QuoteCardPayloadSchema } from "@/lib/quote-card-payload";

/**
 * The same two rooms, expressed the three ways the three send buttons express them.
 *
 * This is the regression the owner hit five times: the order card and the quote card were drawn by
 * DIFFERENT renderers, so one customer got the full table and another got a plain summary. Both
 * now feed one React component, which means identical ShareData is identical pixels — and that is
 * what this pins.
 */
const CALCS = [
  {
    name: "Хона 1", innerWidth: "2", innerLength: "30", bearing: "0.15",
    pattern: "BGB", patternAuto: "GB", beamLength: "2.3", blocksPerRow: 10, blockRows: 52,
    totalBlocks: 520, beamCount: 53, monolithLength: "30.28", monolithArea: "69.64",
    m2Price: "140000", subtotal: "9849520",
  },
  {
    name: "Хона 2", innerWidth: "3.5", innerLength: "6", bearing: "0.15",
    pattern: "BGB", patternAuto: null, beamLength: "3.8", blocksPerRow: 18, blockRows: 10,
    totalBlocks: 180, beamCount: 11, monolithLength: "5.92", monolithArea: "22.5",
    m2Price: "140000", subtotal: "3313600",
  },
];

/** The calculator's payload for the same two rooms — what the phone POSTs to /api/quote-card. */
const CALCULATOR_PAYLOAD = {
  title: "Ҳисоб-китоб",
  clientName: "Номсиз мижоз",
  clientPhone: "998916100191",
  clientAddress: "Андижон вилояти · Марҳамат тумани",
  rows: CALCS.map((c) => ({
    name: c.name,
    innerWidth: Number(c.innerWidth),
    innerLength: Number(c.innerLength),
    bearing: Number(c.bearing),
    pattern: c.pattern as "BGB",
    patternAuto: c.patternAuto as "GB" | null,
    beamLength: Number(c.beamLength),
    blocksPerRow: c.blockRows > 0 ? c.blocksPerRow : null,
    totalBlocks: c.totalBlocks,
    beamCount: c.beamCount,
    monolithLength: Number(c.monolithLength),
    monolithArea: Number(c.monolithArea),
    m2Price: Number(c.m2Price),
    subtotal: Number(c.subtotal),
  })),
  totals: { blocks: 700, beams: 64, monolithLength: 36.2, monolithArea: 92.14, sum: 13163120 },
};

const ORDER = {
  orderNumber: "2026-09-0085",
  scheduledAt: new Date("2026-09-22T06:00:00Z"),
  paymentState: "AWAITING_PAYMENT",
  totalPrice: "13163120",
  confirmedPaid: "0",
  writeOffAmount: "0",
  roomsSubtotal: "13163120",
  discountPercent: "0",
  discountAmount: "0",
  deliveryCost: "0",
  otherCost: "0",
  client: { name: "Umidjon", phone: "998911190121", address: "Фарғона вилояти, Chimyon" },
  project: { calculations: CALCS },
};

const DRAFT = {
  draftNumber: 561,
  name: null,
  tentativeClientName: "Номсиз мижоз",
  tentativeClientPhone: "998916100191",
  tentativeClientAddress: "Андижон вилояти, Марҳамат тумани",
  client: null,
  calculations: CALCS,
};

beforeEach(() => {
  orderFindUnique.mockReset().mockResolvedValue(ORDER);
});

describe("the three send buttons draw one card", () => {
  it("a placed order and a saved draft produce the same table", async () => {
    const fromOrder = await buildShareDataFromOrder("o1");
    const fromDraft = buildShareDataFromProject(DRAFT as never);

    expect(fromOrder!.rows).toEqual(fromDraft.rows);
    expect(fromOrder!.totals).toEqual(fromDraft.totals);
  });

  it("the calculator's payload produces the same table as both", async () => {
    const fromOrder = await buildShareDataFromOrder("o1");
    const fromCalculator = QuoteCardPayloadSchema.parse(CALCULATOR_PAYLOAD);

    expect(fromCalculator.rows).toEqual(fromOrder!.rows);
    expect(fromCalculator.totals).toEqual(fromOrder!.totals);
  });

  /**
   * `blocksPerRow` is the one field that is NOT a straight copy: a room with no block course sends
   * null so the card prints a dash rather than a zero. All three paths have to apply that rule, or
   * one of them prints «0 ғишт/қатор» for a room that simply has no course.
   */
  it("all three write a dash, not a zero, for a room with no block course", async () => {
    orderFindUnique.mockResolvedValue({
      ...ORDER,
      project: { calculations: [{ ...CALCS[0], blockRows: 0, blocksPerRow: 7 }] },
    });
    const fromOrder = await buildShareDataFromOrder("o1");
    const fromDraft = buildShareDataFromProject({
      ...DRAFT,
      calculations: [{ ...CALCS[0], blockRows: 0, blocksPerRow: 7 }],
    } as never);

    expect(fromOrder!.rows[0].blocksPerRow).toBeNull();
    expect(fromDraft.rows[0].blocksPerRow).toBeNull();
  });

  /**
   * What SHOULD differ, and does. An order carries a payment pill and a delivery date; a draft is
   * not owed anything yet and has neither. Asserted so "they render the same" can never quietly
   * become "the order card lost its balance".
   */
  it("only the order carries the payment pill and the scheduled day", async () => {
    const fromOrder = await buildShareDataFromOrder("o1");
    const fromDraft = buildShareDataFromProject(DRAFT as never);

    expect(fromOrder!.payment).toBeDefined();
    expect(fromOrder!.payment!.remaining).toBe(13163120);
    expect(fromOrder!.scheduledLabel).toBe("Сешанба, 22 сентябр");
    expect(fromOrder!.title).toBe("Буюртма №2026-09-0085");

    expect(fromDraft.payment).toBeUndefined();
    expect(fromDraft.scheduledLabel).toBeUndefined();
  });

  /** A part-paid order must show what is still owed, not the whole price again. */
  it("the order's balance is total minus paid minus write-off", async () => {
    orderFindUnique.mockResolvedValue({
      ...ORDER, confirmedPaid: "6000000", writeOffAmount: "163120",
    });
    const d = await buildShareDataFromOrder("o1");
    expect(d!.payment!.paid).toBe(6000000);
    expect(d!.payment!.remaining).toBe(13163120 - 6000000 - 163120);
  });

  /** The discount is derived from its printed neighbours so the column adds up on the card. */
  it("the printed adjustments reach the printed total", async () => {
    orderFindUnique.mockResolvedValue({
      ...ORDER,
      roomsSubtotal: "13163120", discountAmount: "1316312", discountPercent: "10",
      deliveryCost: "150000", otherCost: "25000", totalPrice: "12021808",
    });
    const p = (await buildShareDataFromOrder("o1"))!.pricing!;
    expect(p.subtotal - p.discountAmount + p.deliveryCost + p.otherCost).toBe(p.total);
  });

  it("an order that does not exist renders nothing rather than a blank card", async () => {
    orderFindUnique.mockResolvedValue(null);
    expect(await buildShareDataFromOrder("nope")).toBeNull();
  });
});
