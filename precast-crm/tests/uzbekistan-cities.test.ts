import { describe, it, expect } from "vitest";
import {
  UZBEKISTAN_CITIES,
  cityLabel,
  composeAddress,
  getCitiesForProvince,
  getProvinceForCity,
  getProvinces,
  parseAddress,
  provinceHasMultipleCities,
  provinceLabel,
} from "../src/lib/uzbekistan-cities";

describe("uzbekistan-cities catalog", () => {
  it("has exactly 12 entries", () => {
    expect(UZBEKISTAN_CITIES).toHaveLength(12);
  });

  it("has unique cities", () => {
    const cities = UZBEKISTAN_CITIES.map((c) => c.city);
    expect(new Set(cities).size).toBe(12);
  });

  it("has unique provinces today (future-proof rule still honored)", () => {
    const provinces = UZBEKISTAN_CITIES.map((c) => c.province);
    expect(new Set(provinces).size).toBe(12);
  });
});

describe("getProvinces", () => {
  it("returns alphabetical Latin order", () => {
    const list = getProvinces().map((p) => p.province);
    const sorted = [...list].sort((a, b) => a.localeCompare(b, "en"));
    expect(list).toEqual(sorted);
  });

  it("includes the Toshkent shahri special case", () => {
    const list = getProvinces().map((p) => p.province);
    expect(list).toContain("Toshkent shahri");
  });

  it("attaches the Uzbek label to every entry", () => {
    const list = getProvinces();
    expect(list.every((p) => p.provinceUz && p.provinceUz.length > 0)).toBe(true);
  });
});

describe("getCitiesForProvince", () => {
  it("returns every city when called with null", () => {
    expect(getCitiesForProvince(null)).toHaveLength(12);
  });

  it("returns every city when called with empty string", () => {
    expect(getCitiesForProvince("")).toHaveLength(12);
  });

  it("filters to one city for each current province", () => {
    expect(getCitiesForProvince("Toshkent shahri").map((c) => c.city)).toEqual([
      "Toshkent",
    ]);
    expect(getCitiesForProvince("Qashqadaryo").map((c) => c.city)).toEqual([
      "Qarshi",
    ]);
  });

  it("returns alphabetical Latin order", () => {
    const list = getCitiesForProvince(null).map((c) => c.city);
    const sorted = [...list].sort((a, b) => a.localeCompare(b, "en"));
    expect(list).toEqual(sorted);
  });

  it("returns an empty array for an unknown province", () => {
    expect(getCitiesForProvince("Atlantis")).toEqual([]);
  });
});

describe("getProvinceForCity", () => {
  it("maps Toshkent → Toshkent shahri (the special case)", () => {
    expect(getProvinceForCity("Toshkent")).toBe("Toshkent shahri");
  });

  it("maps Qarshi → Qashqadaryo", () => {
    expect(getProvinceForCity("Qarshi")).toBe("Qashqadaryo");
  });

  it("returns null for an unknown city", () => {
    expect(getProvinceForCity("Atlantis")).toBe(null);
  });
});

describe("provinceHasMultipleCities", () => {
  it("returns false for every current province (single-city today)", () => {
    for (const p of getProvinces()) {
      expect(provinceHasMultipleCities(p.province)).toBe(false);
    }
  });

  it("returns false for an unknown province (no cities at all)", () => {
    expect(provinceHasMultipleCities("Atlantis")).toBe(false);
  });
});

describe("parseAddress", () => {
  it("splits on the first comma and matches the Latin prefix", () => {
    expect(parseAddress("Toshkent, Yunusobod 12-7")).toEqual({
      city: "Toshkent",
      streetDetail: "Yunusobod 12-7",
    });
  });

  it("matches the Cyrillic prefix too (legacy rows typed in either script)", () => {
    expect(parseAddress("Самарқанд, Регистон кўчаси 5")).toEqual({
      city: "Samarqand",
      streetDetail: "Регистон кўчаси 5",
    });
  });

  it("returns city only when the address has no street", () => {
    expect(parseAddress("Buxoro")).toEqual({ city: "Buxoro", streetDetail: "" });
    expect(parseAddress("Бухоро")).toEqual({ city: "Buxoro", streetDetail: "" });
  });

  it("trims whitespace around the comma split", () => {
    expect(parseAddress("Toshkent ,  Yunusobod 12")).toEqual({
      city: "Toshkent",
      streetDetail: "Yunusobod 12",
    });
  });

  it("falls back to street-only when the prefix isn't a known city", () => {
    const out = parseAddress("Unknownville, Main Street 1");
    expect(out.city).toBe("");
    expect(out.streetDetail).toBe("Unknownville, Main Street 1");
  });

  it("returns empty fields for an empty input", () => {
    expect(parseAddress("")).toEqual({ city: "", streetDetail: "" });
  });
});

describe("composeAddress", () => {
  it("produces 'City, street' in the happy path", () => {
    expect(composeAddress("Toshkent", "Yunusobod 12-7")).toBe(
      "Toshkent, Yunusobod 12-7",
    );
  });

  it("trims trailing comma when only the city is present", () => {
    expect(composeAddress("Buxoro", "")).toBe("Buxoro");
  });

  it("returns the street alone when city is empty", () => {
    expect(composeAddress("", "Yunusobod 12-7")).toBe("Yunusobod 12-7");
  });

  it("returns empty string when both are empty", () => {
    expect(composeAddress("", "")).toBe("");
  });

  it("is the inverse of parseAddress for normalized inputs", () => {
    for (const original of [
      "Toshkent, Yunusobod 12-7",
      "Samarqand, Registon 5",
      "Buxoro",
      "",
    ]) {
      const parsed = parseAddress(original);
      expect(composeAddress(parsed.city, parsed.streetDetail)).toBe(original);
    }
  });
});

describe("label helpers", () => {
  it("produces 'Cyrillic · Latin' for a known city", () => {
    expect(cityLabel("Samarqand")).toBe("Самарқанд · Samarqand");
  });

  it("falls back to the input for an unknown city", () => {
    expect(cityLabel("Atlantis")).toBe("Atlantis");
  });

  it("produces 'Cyrillic · Latin' for a known province", () => {
    expect(provinceLabel("Toshkent shahri")).toBe("Тошкент шаҳри · Toshkent shahri");
  });

  it("falls back to the input for an unknown province", () => {
    expect(provinceLabel("Atlantis")).toBe("Atlantis");
  });
});
