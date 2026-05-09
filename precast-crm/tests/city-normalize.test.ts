import { describe, expect, it } from "vitest";
import {
  CANONICAL_CITIES,
  normalizeCity,
} from "../src/lib/city-normalize";

describe("normalizeCity", () => {
  it("maps Cyrillic 'Ташкент' variants to Toshkent", () => {
    expect(normalizeCity("г. Ташкент Юнусабад 12-7")).toBe("Toshkent");
    expect(normalizeCity("Тошкент шахри")).toBe("Toshkent");
  });

  it("maps Latin 'tashkent' variants to Toshkent", () => {
    expect(normalizeCity("Tashkent center")).toBe("Toshkent");
    expect(normalizeCity("toshkent · Mirzo-Ulug'bek")).toBe("Toshkent");
  });

  it("maps Samarqand variants in both alphabets", () => {
    expect(normalizeCity("Samarqand · Registan")).toBe("Samarqand");
    expect(normalizeCity("самарканд")).toBe("Samarqand");
    expect(normalizeCity("самарқанд")).toBe("Samarqand");
  });

  it("maps Buxoro / Bukhara / Бухара to Buxoro", () => {
    expect(normalizeCity("Buxoro")).toBe("Buxoro");
    expect(normalizeCity("Bukhara central")).toBe("Buxoro");
    expect(normalizeCity("Бухара")).toBe("Buxoro");
  });

  it("maps Andijon / Андижан / Андижон", () => {
    expect(normalizeCity("Andijon, Bog' k.")).toBe("Andijon");
    expect(normalizeCity("Андижан")).toBe("Andijon");
    expect(normalizeCity("Андижон")).toBe("Andijon");
  });

  it("maps Farg'ona / Fergana / Фергана", () => {
    expect(normalizeCity("Farg'ona")).toBe("Farg'ona");
    expect(normalizeCity("Fergana center")).toBe("Farg'ona");
    expect(normalizeCity("Фергана 5")).toBe("Farg'ona");
  });

  it("returns 'Other' for unknown addresses", () => {
    expect(normalizeCity("some unknown village")).toBe("Other");
    expect(normalizeCity("123 main street, somewhere")).toBe("Other");
  });

  it("returns 'Other' for null / undefined / empty input", () => {
    expect(normalizeCity(null)).toBe("Other");
    expect(normalizeCity(undefined)).toBe("Other");
    expect(normalizeCity("")).toBe("Other");
  });

  it("CANONICAL_CITIES exposes the 13 named city names", () => {
    expect(CANONICAL_CITIES).toContain("Toshkent");
    expect(CANONICAL_CITIES).toContain("Samarqand");
    expect(CANONICAL_CITIES).toContain("Urganch");
    expect(CANONICAL_CITIES.length).toBe(13);
    // 'Other' is the fallback bucket; not part of the canonical list.
    expect(CANONICAL_CITIES).not.toContain("Other");
  });

  it("first matching pattern wins (no double-match across cities)", () => {
    // Synthetic adversarial input: contains substring of two canonical
    // cities. Should pick the first one defined.
    expect(normalizeCity("Tashkent-Samarqand express")).toBe("Toshkent");
  });
});
