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

  it("returns null for junk / empty", () => {
    expect(parseGazoblokOrderRef("hello", 2026)).toBeNull();
    expect(parseGazoblokOrderRef(null, 2026)).toBeNull();
    expect(parseGazoblokOrderRef("B-99-0010", 2026)).toBeNull(); // invalid month
  });
});
