import { describe, it, expect } from "vitest";
import {
  parseOrderNumber,
  formatOrderNumber,
  nextOrderNumber,
  orderNumberMonthPrefix,
} from "../src/lib/order-number";

describe("order-number helpers", () => {
  it("parses a valid order number", () => {
    expect(parseOrderNumber("2026-05-0042")).toEqual({ year: 2026, month: 5, seq: 42 });
  });
  it("rejects malformed input", () => {
    expect(parseOrderNumber("2026-5-42")).toBeNull();
    expect(parseOrderNumber("2026-13-0001")).toBeNull();
    expect(parseOrderNumber("garbage")).toBeNull();
  });
  it("formats with zero-padding", () => {
    expect(formatOrderNumber({ year: 2026, month: 5, seq: 1 })).toBe("2026-05-0001");
    expect(formatOrderNumber({ year: 2026, month: 12, seq: 9999 })).toBe("2026-12-9999");
  });

  it("starts at 0001 when no orders exist for the month", () => {
    expect(nextOrderNumber(2026, 5, null)).toBe("2026-05-0001");
  });
  it("increments from the highest existing seq in the same month", () => {
    expect(nextOrderNumber(2026, 5, "2026-05-0042")).toBe("2026-05-0043");
  });
  it("ignores highest from a different month and starts fresh", () => {
    expect(nextOrderNumber(2026, 6, "2026-05-9999")).toBe("2026-06-0001");
  });

  it("month prefix is the canonical YYYY-MM-", () => {
    expect(orderNumberMonthPrefix(2026, 5)).toBe("2026-05-");
  });
});
