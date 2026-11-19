import { describe, it, expect } from "vitest";
import {
  expandShortGazoblokNumber,
  shortGazoblokNumber,
  shortGazoblokSearchPrefix,
} from "@/lib/gazoblok-number";

describe("shortGazoblokNumber", () => {
  it("shows G + year digit + month + two-digit sequence", () => {
    expect(shortGazoblokNumber("B-2026-11-0004")).toBe("G61104");
    expect(shortGazoblokNumber("B-2026-07-0005")).toBe("G60705");
    expect(shortGazoblokNumber("B-2027-01-0099")).toBe("G70199");
  });

  it("grows past 99 orders in a month", () => {
    expect(shortGazoblokNumber("B-2026-11-0100")).toBe("G611100");
    expect(shortGazoblokNumber("B-2026-11-1234")).toBe("G6111234");
  });

  it("leaves anything that is not a gazoblok number as it is", () => {
    expect(shortGazoblokNumber("2026-11-0004")).toBe("2026-11-0004");
    expect(shortGazoblokNumber("")).toBe("");
  });
});

describe("expandShortGazoblokNumber", () => {
  it("turns the short form back into the stored number", () => {
    expect(expandShortGazoblokNumber("G61104", 2026)).toBe("B-2026-11-0004");
    expect(expandShortGazoblokNumber("G611100", 2026)).toBe("B-2026-11-0100");
  });

  it("accepts lower case and Cyrillic Г", () => {
    expect(expandShortGazoblokNumber("g61104", 2026)).toBe("B-2026-11-0004");
    expect(expandShortGazoblokNumber("Г61104", 2026)).toBe("B-2026-11-0004");
  });

  it("reads the year digit as the latest such year up to the current one", () => {
    expect(expandShortGazoblokNumber("G61104", 2027)).toBe("B-2026-11-0004");
    expect(expandShortGazoblokNumber("G70104", 2027)).toBe("B-2027-01-0004");
    expect(expandShortGazoblokNumber("G61104", 2036)).toBe("B-2036-11-0004");
  });

  it("round-trips with shortGazoblokNumber", () => {
    for (const n of ["B-2026-11-0004", "B-2026-01-0100", "B-2025-12-0042"]) {
      expect(expandShortGazoblokNumber(shortGazoblokNumber(n), 2026)).toBe(n);
    }
  });

  it("returns null for an incomplete or invalid short number", () => {
    expect(expandShortGazoblokNumber("G6110", 2026)).toBeNull(); // one sequence digit
    expect(expandShortGazoblokNumber("G61304", 2026)).toBeNull(); // month 13
    expect(expandShortGazoblokNumber("B-2026-11-0004", 2026)).toBeNull();
    expect(expandShortGazoblokNumber("Голиб", 2026)).toBeNull();
  });
});

describe("shortGazoblokSearchPrefix", () => {
  it("gives the exact stored number for a complete short number", () => {
    expect(shortGazoblokSearchPrefix("G61104", 2026)).toBe("B-2026-11-0004");
    expect(shortGazoblokSearchPrefix(" г61104 ", 2026)).toBe("B-2026-11-0004");
  });

  it("gives the month or the year while the number is still being typed", () => {
    expect(shortGazoblokSearchPrefix("G6", 2026)).toBe("B-2026-");
    expect(shortGazoblokSearchPrefix("G61", 2026)).toBe("B-2026-");
    expect(shortGazoblokSearchPrefix("G611", 2026)).toBe("B-2026-11-");
    expect(shortGazoblokSearchPrefix("G6110", 2026)).toBe("B-2026-11-");
  });

  it("returns null for text that is not a short number", () => {
    expect(shortGazoblokSearchPrefix("G", 2026)).toBeNull();
    expect(shortGazoblokSearchPrefix("G613", 2026)).toBeNull();
    expect(shortGazoblokSearchPrefix("Голиб", 2026)).toBeNull();
    expect(shortGazoblokSearchPrefix("B-2026", 2026)).toBeNull();
  });
});
