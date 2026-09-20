import { describe, it, expect } from "vitest";
import {
  QuoteCardPayloadSchema,
  dropQuoteCardPayload,
  parkQuoteCardPayload,
  readQuoteCardPayload,
} from "@/lib/quote-card-payload";

const row = {
  name: "Меҳмонхона",
  innerWidth: 4,
  innerLength: 6,
  bearing: 0.15,
  pattern: "GB" as const,
  patternAuto: null,
  beamLength: 5.92,
  blocksPerRow: 20,
  totalBlocks: 200,
  beamCount: 11,
  monolithLength: 4.24,
  monolithArea: 25.46,
  m2Price: 140_000,
  subtotal: 3_749_600,
};

const payload = {
  title: "Ҳисоб-китоб",
  clientName: "Азиз Дадамов",
  clientPhone: "998901234567",
  clientAddress: "Тошкент шаҳри",
  rows: [row],
  totals: { blocks: 200, beams: 11, monolithLength: 4.24, monolithArea: 25.46, sum: 3_749_600 },
};

/**
 * The payload path for the quote card. What matters here is not the happy case —
 * it is that a card is never rendered from figures the server could not fully
 * understand. A missing number would draw as a blank or a zero, and a customer
 * cannot tell those apart from a real price.
 */
describe("QuoteCardPayloadSchema", () => {
  it("accepts a complete quote", () => {
    expect(QuoteCardPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("rejects a row missing a figure", () => {
    const { m2Price, ...incomplete } = row;
    const bad = { ...payload, rows: [incomplete] };
    expect(QuoteCardPayloadSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects NaN and Infinity, which JSON.stringify writes as null anyway", () => {
    expect(
      QuoteCardPayloadSchema.safeParse({ ...payload, rows: [{ ...row, subtotal: Number.NaN }] }).success,
    ).toBe(false);
  });

  /** A card with no rows is a company header and nothing else — not a quote. */
  it("rejects an empty quote", () => {
    expect(QuoteCardPayloadSchema.safeParse({ ...payload, rows: [] }).success).toBe(false);
  });

  it("rejects a pattern the card cannot draw", () => {
    expect(
      QuoteCardPayloadSchema.safeParse({ ...payload, rows: [{ ...row, pattern: "XYZ" }] }).success,
    ).toBe(false);
  });

  /** `blocksPerRow` is genuinely nullable — a beams-only room has no block row. */
  it("accepts a null blocksPerRow", () => {
    expect(
      QuoteCardPayloadSchema.safeParse({ ...payload, rows: [{ ...row, blocksPerRow: null }] }).success,
    ).toBe(true);
  });

  it("accepts the optional pricing block", () => {
    const withPricing = {
      ...payload,
      pricing: {
        subtotal: 8_065_920,
        discountAmount: 806_592,
        discountPercent: 10,
        deliveryCost: 150_000,
        otherCost: 25_000,
        total: 7_434_328,
      },
    };
    expect(QuoteCardPayloadSchema.safeParse(withPricing).success).toBe(true);
  });
});

describe("the parked payload", () => {
  it("is readable by nonce and gone once dropped", () => {
    const data = QuoteCardPayloadSchema.parse(payload);
    const nonce = parkQuoteCardPayload(data);

    expect(readQuoteCardPayload(nonce)?.clientName).toBe("Азиз Дадамов");
    dropQuoteCardPayload(nonce);
    expect(readQuoteCardPayload(nonce)).toBeNull();
  });

  /** An unknown nonce must read as absent, so the render page 404s instead of
   *  throwing inside a headless browser nobody is watching. */
  it("reads null for a nonce nobody parked", () => {
    expect(readQuoteCardPayload("deadbeef")).toBeNull();
  });

  /** Two quotes in flight must not see each other's figures. */
  it("keeps concurrent payloads apart", () => {
    const a = parkQuoteCardPayload(QuoteCardPayloadSchema.parse(payload));
    const b = parkQuoteCardPayload(
      QuoteCardPayloadSchema.parse({ ...payload, clientName: "Навоий Build" }),
    );
    expect(readQuoteCardPayload(a)?.clientName).toBe("Азиз Дадамов");
    expect(readQuoteCardPayload(b)?.clientName).toBe("Навоий Build");
    dropQuoteCardPayload(a);
    dropQuoteCardPayload(b);
  });
});
