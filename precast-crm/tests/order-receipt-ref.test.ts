import { describe, it, expect } from "vitest";
import { parseOrderRef } from "@/lib/order-receipt-ref";

describe("parseOrderRef", () => {
  it("extracts a full YYYY-MM-NNNN order number from a caption", () => {
    expect(parseOrderRef("чек 2026-06-0010", 2026)).toBe("2026-06-0010");
    expect(parseOrderRef("№2026-06-0010", 2026)).toBe("2026-06-0010");
    expect(parseOrderRef("2026-06-0010 to'lov", 2026)).toBe("2026-06-0010");
  });
  it("accepts a short MM-NNNN and fills in the current year", () => {
    expect(parseOrderRef("06-0010", 2026)).toBe("2026-06-0010");
    expect(parseOrderRef("чек 06-0010", 2026)).toBe("2026-06-0010");
    expect(parseOrderRef("05-0004", 2027)).toBe("2027-05-0004");
  });
  it("prefers the full form when both could match (no double-count of YYYY-MM-NNNN)", () => {
    expect(parseOrderRef("2026-06-0010", 2030)).toBe("2026-06-0010"); // year NOT overwritten
  });
  it("returns null for junk, a bare number, or a bad month", () => {
    expect(parseOrderRef("hello", 2026)).toBeNull();
    expect(parseOrderRef("123", 2026)).toBeNull();
    expect(parseOrderRef("2026-13-0001", 2026)).toBeNull(); // month 13 invalid
    expect(parseOrderRef("13-0001", 2026)).toBeNull();       // short form, bad month
    expect(parseOrderRef("", 2026)).toBeNull();
  });
});
