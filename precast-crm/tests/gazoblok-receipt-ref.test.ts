import { describe, it, expect } from "vitest";
import { parseGazoblokOrderRef } from "@/lib/gazoblok-receipt-ref";

describe("parseGazoblokOrderRef", () => {
  it("autofills the year for the short B-MM-NNNN form", () => {
    expect(parseGazoblokOrderRef("B-06-0010", 2026)).toBe("B-2026-06-0010");
  });

  it("accepts the full B-YYYY-MM-NNNN form", () => {
    expect(parseGazoblokOrderRef("B-2026-06-0010", 2026)).toBe("B-2026-06-0010");
  });

  it("normalizes a Cyrillic Б prefix to Latin B", () => {
    expect(parseGazoblokOrderRef("Б-06-0010", 2026)).toBe("B-2026-06-0010");
  });

  it("returns null for a floor (no-prefix) number so the floor parser handles it", () => {
    expect(parseGazoblokOrderRef("06-0010", 2026)).toBeNull();
    expect(parseGazoblokOrderRef("2026-06-0010", 2026)).toBeNull();
  });

  it("accepts the short form shown on screen (G61104), Latin or Cyrillic", () => {
    expect(parseGazoblokOrderRef("G61104", 2026)).toBe("B-2026-11-0004");
    expect(parseGazoblokOrderRef("чек г61104 тўлов", 2026)).toBe("B-2026-11-0004");
    expect(parseGazoblokOrderRef("Г611100", 2026)).toBe("B-2026-11-0100");
  });

  it("does not read a short number out of the middle of other text", () => {
    expect(parseGazoblokOrderRef("IMG61104", 2026)).toBeNull();
    expect(parseGazoblokOrderRef("G611041234567", 2026)).toBeNull();
    expect(parseGazoblokOrderRef("G61304", 2026)).toBeNull(); // month 13
  });

  it("returns null for junk / empty", () => {
    expect(parseGazoblokOrderRef("hello", 2026)).toBeNull();
    expect(parseGazoblokOrderRef(null, 2026)).toBeNull();
    expect(parseGazoblokOrderRef("B-99-0010", 2026)).toBeNull(); // invalid month
  });
});
