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
  it("has exactly 14 entries (matches kenjebaev/regions admin divisions)", () => {
    expect(UZBEKISTAN_CITIES).toHaveLength(14);
  });

  it("has unique cities", () => {
    const cities = UZBEKISTAN_CITIES.map((c) => c.city);
    expect(new Set(cities).size).toBe(14);
  });

  it("has unique provinces today (future-proof rule still honored)", () => {
    const provinces = UZBEKISTAN_CITIES.map((c) => c.province);
    expect(new Set(provinces).size).toBe(14);
  });

  it("uses canonical 'viloyati' / 'Respublikasi' / 'shahri' suffixes", () => {
    // Regression guard for the kenjebaev-alignment fix: each province
    // string carries the administrative suffix appropriate to its rank.
    for (const c of UZBEKISTAN_CITIES) {
      const valid =
        c.province.endsWith(" viloyati") ||
        c.province.endsWith(" Respublikasi") ||
        c.province.endsWith(" shahri");
      expect(valid, `Province "${c.province}" missing admin suffix`).toBe(true);
    }
  });
});

describe("getProvinces", () => {
  it("returns alphabetical Latin order", () => {
    const list = getProvinces().map((p) => p.province);
    const sorted = [...list].sort((a, b) => a.localeCompare(b, "en"));
    expect(list).toEqual(sorted);
  });

  it("includes Toshkent shahri AND Toshkent viloyati as separate entries", () => {
    const list = getProvinces().map((p) => p.province);
    expect(list).toContain("Toshkent shahri");
    expect(list).toContain("Toshkent viloyati");
  });

  it("attaches the Uzbek label to every entry", () => {
    const list = getProvinces();
    expect(list.every((p) => p.provinceUz && p.provinceUz.length > 0)).toBe(true);
  });
});

describe("getCitiesForProvince", () => {
  it("returns every city when called with null", () => {
    expect(getCitiesForProvince(null)).toHaveLength(14);
  });

  it("returns every city when called with empty string", () => {
    expect(getCitiesForProvince("")).toHaveLength(14);
  });

  it("filters to one city for each current province", () => {
    expect(getCitiesForProvince("Toshkent shahri").map((c) => c.city)).toEqual([
      "Toshkent",
    ]);
    expect(getCitiesForProvince("Toshkent viloyati").map((c) => c.city)).toEqual([
      "Nurafshon",
    ]);
    expect(getCitiesForProvince("Qashqadaryo viloyati").map((c) => c.city)).toEqual([
      "Qarshi",
    ]);
    expect(getCitiesForProvince("Sirdaryo viloyati").map((c) => c.city)).toEqual([
      "Guliston",
    ]);
    expect(getCitiesForProvince("Surxondaryo viloyati").map((c) => c.city)).toEqual([
      "Termiz",
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
  it("maps Toshkent → Toshkent shahri (the capital city special case)", () => {
    expect(getProvinceForCity("Toshkent")).toBe("Toshkent shahri");
  });

  it("maps Nurafshon → Toshkent viloyati (the regional center, distinct)", () => {
    expect(getProvinceForCity("Nurafshon")).toBe("Toshkent viloyati");
  });

  it("maps Qarshi → Qashqadaryo viloyati", () => {
    expect(getProvinceForCity("Qarshi")).toBe("Qashqadaryo viloyati");
  });

  it("maps Nukus → Qoraqalpog'iston Respublikasi (autonomous republic)", () => {
    expect(getProvinceForCity("Nukus")).toBe("Qoraqalpog'iston Respublikasi");
  });

  it("maps Guliston → Sirdaryo viloyati", () => {
    expect(getProvinceForCity("Guliston")).toBe("Sirdaryo viloyati");
  });

  it("maps Termiz → Surxondaryo viloyati (keeping local Latin spelling)", () => {
    expect(getProvinceForCity("Termiz")).toBe("Surxondaryo viloyati");
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

  it("matches new entries Guliston and Nurafshon as bare-city addresses", () => {
    expect(parseAddress("Guliston")).toEqual({ city: "Guliston", streetDetail: "" });
    expect(parseAddress("Нурафшон")).toEqual({ city: "Nurafshon", streetDetail: "" });
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
      "Guliston, Markaz 1",
      "Nurafshon",
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

  it("produces 'Cyrillic · Latin' with admin suffix for a known province", () => {
    expect(provinceLabel("Samarqand viloyati")).toBe(
      "Самарқанд вилояти · Samarqand viloyati",
    );
    expect(provinceLabel("Toshkent shahri")).toBe(
      "Тошкент шаҳри · Toshkent shahri",
    );
    expect(provinceLabel("Qoraqalpog'iston Respublikasi")).toBe(
      "Қорақалпоғистон Республикаси · Qoraqalpog'iston Respublikasi",
    );
  });

  it("falls back to the input for an unknown province", () => {
    expect(provinceLabel("Atlantis")).toBe("Atlantis");
  });
});
