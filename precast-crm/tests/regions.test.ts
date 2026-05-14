import { describe, it, expect } from "vitest";
import {
  VILOYATS,
  TUMANS,
  composeAddress,
  findTumanByName,
  findViloyatByName,
  getTumans,
  getViloyatForTuman,
  getViloyats,
  parseAddress,
  tumanLabel,
  viloyatLabel,
} from "../src/lib/regions";

describe("regions catalog", () => {
  it("has 14 viloyats (kenjebaev/regions)", () => {
    expect(VILOYATS).toHaveLength(14);
  });

  it("has 203 tumans (kenjebaev/regions)", () => {
    expect(TUMANS).toHaveLength(203);
  });

  it("every tuman has a viloyatId pointing at a real viloyat", () => {
    const viloyatIds = new Set(VILOYATS.map((v) => v.id));
    for (const t of TUMANS) {
      expect(viloyatIds.has(t.viloyatId), `tuman ${t.name}`).toBe(true);
    }
  });

  it("every entry carries a non-empty Cyrillic nameUz", () => {
    for (const v of VILOYATS) {
      expect(v.nameUz.length > 0, `viloyat ${v.name}`).toBe(true);
    }
    for (const t of TUMANS) {
      expect(t.nameUz.length > 0, `tuman ${t.name}`).toBe(true);
    }
  });

  it("hand-curated viloyat Cyrillic uses the proper Uzbek apostrophe", () => {
    // Smoke check that the curated values landed; pinning a few that
    // exercise different transliteration rules.
    expect(findViloyatByName("Toshkent shahri")?.nameUz).toBe("Тошкент шаҳри");
    expect(findViloyatByName("Qoraqalpog‘iston Respublikasi")?.nameUz).toBe(
      "Қорақалпоғистон Республикаси",
    );
    expect(findViloyatByName("Farg‘ona viloyati")?.nameUz).toBe(
      "Фарғона вилояти",
    );
  });

  it("tuman transliteration handles sh/ch, g'/o', yo/yu/ya, q/x/h", () => {
    // Pinning a handful of well-known tumans to guard against
    // regressions in the transliteration rules.
    expect(findTumanByName("Yunusobod tumani")?.nameUz).toBe(
      "Юнусобод тумани",
    );
    expect(findTumanByName("Beshariq tumani")?.nameUz).toBe(
      "Бешариқ тумани",
    );
    expect(findTumanByName("Ohangaron tumani")?.nameUz).toBe(
      "Оҳангарон тумани",
    );
    expect(findTumanByName("Oltinko‘l tumani")?.nameUz).toBe(
      "Олтинкўл тумани",
    );
    expect(findTumanByName("Yangiyo‘l tumani")?.nameUz).toBe(
      "Янгийўл тумани",
    );
  });
});

describe("getViloyats / getTumans", () => {
  it("getViloyats returns alphabetical Latin order", () => {
    const order = getViloyats().map((v) => v.name);
    expect(order).toEqual([...order].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("getTumans() with no arg returns every tuman", () => {
    expect(getTumans().length).toBe(TUMANS.length);
  });

  it("getTumans(viloyatId) filters by viloyat", () => {
    // Toshkent shahri (region_id=14 in the dataset) has tumans like
    // Yunusobod tumani. We assert at least one and viloyatId match
    // rather than pinning an exact count (datasets can grow).
    const toshkentShahri = findViloyatByName("Toshkent shahri");
    expect(toshkentShahri).not.toBeNull();
    const list = getTumans(toshkentShahri!.id);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((t) => t.viloyatId === toshkentShahri!.id)).toBe(true);
  });

  it("getViloyatForTuman returns the parent viloyat", () => {
    const yunusobod = findTumanByName("Yunusobod tumani");
    expect(yunusobod).not.toBeNull();
    const parent = getViloyatForTuman(yunusobod!.id);
    expect(parent?.name).toBe("Toshkent shahri");
  });

  it("getViloyatForTuman returns null for an unknown id", () => {
    expect(getViloyatForTuman(-1)).toBeNull();
  });
});

describe("parseAddress / composeAddress", () => {
  it("parses 'Viloyat, Tuman, street' (the canonical write shape)", () => {
    const out = parseAddress(
      "Toshkent shahri, Yunusobod tumani, Yunusobod 12-7",
    );
    expect(out).toEqual({
      viloyat: "Toshkent shahri",
      tuman: "Yunusobod tumani",
      streetDetail: "Yunusobod 12-7",
    });
  });

  it("parses 'Viloyat, street' (no tuman picked)", () => {
    const out = parseAddress("Toshkent shahri, Yunusobod 12-7");
    expect(out).toEqual({
      viloyat: "Toshkent shahri",
      tuman: "",
      streetDetail: "Yunusobod 12-7",
    });
  });

  it("parses 'Tuman, street' (bare tuman → auto-snap viloyat)", () => {
    const out = parseAddress("Yunusobod tumani, Yunusobod 12-7");
    expect(out).toEqual({
      viloyat: "Toshkent shahri",
      tuman: "Yunusobod tumani",
      streetDetail: "Yunusobod 12-7",
    });
  });

  it("falls back to legacy city catalog for old-format addresses", () => {
    // Yesterday's widget wrote "Toshkent, street" or "Samarqand, street".
    // The new parser maps the city to its viloyat.
    const out1 = parseAddress("Toshkent, Yunusobod 12-7");
    expect(out1.viloyat).toBe("Toshkent shahri");
    expect(out1.tuman).toBe("");
    expect(out1.streetDetail).toBe("Yunusobod 12-7");

    const out2 = parseAddress("Samarqand, Registon 5");
    expect(out2.viloyat).toBe("Samarqand viloyati");
    expect(out2.streetDetail).toBe("Registon 5");
  });

  it("matches Cyrillic prefixes too", () => {
    const out = parseAddress("Тошкент шаҳри, Юнусобод тумани, Юнусобод 12-7");
    expect(out.viloyat).toBe("Toshkent shahri");
    expect(out.tuman).toBe("Yunusobod tumani");
    expect(out.streetDetail).toBe("Юнусобод 12-7");
  });

  it("returns street-only when nothing matches", () => {
    const out = parseAddress("Unknownville, Some Street 1");
    expect(out.viloyat).toBe("");
    expect(out.tuman).toBe("");
    expect(out.streetDetail).toBe("Unknownville, Some Street 1");
  });

  it("returns all-empty for an empty input", () => {
    expect(parseAddress("")).toEqual({ viloyat: "", tuman: "", streetDetail: "" });
  });

  it("composeAddress builds the canonical write shape", () => {
    expect(composeAddress("Toshkent shahri", "Yunusobod tumani", "Yunusobod 12-7"))
      .toBe("Toshkent shahri, Yunusobod tumani, Yunusobod 12-7");
  });

  it("composeAddress skips empty parts cleanly", () => {
    expect(composeAddress("Toshkent shahri", "", "Yunusobod 12-7")).toBe(
      "Toshkent shahri, Yunusobod 12-7",
    );
    expect(composeAddress("Toshkent shahri", "", "")).toBe("Toshkent shahri");
    expect(composeAddress("", "", "Yunusobod 12-7")).toBe("Yunusobod 12-7");
    expect(composeAddress("", "", "")).toBe("");
  });

  it("is the inverse of parseAddress for canonical inputs", () => {
    for (const original of [
      "Toshkent shahri, Yunusobod tumani, Yunusobod 12-7",
      "Toshkent shahri, Yunusobod 12-7",
      "Yunusobod 12-7",
      "",
    ]) {
      const parsed = parseAddress(original);
      expect(
        composeAddress(parsed.viloyat, parsed.tuman, parsed.streetDetail),
      ).toBe(original);
    }
  });
});

describe("label helpers", () => {
  it("viloyatLabel renders Cyrillic · Latin", () => {
    expect(viloyatLabel("Samarqand viloyati")).toBe(
      "Самарқанд вилояти · Samarqand viloyati",
    );
  });

  it("viloyatLabel falls back to the input for unknown names", () => {
    expect(viloyatLabel("Atlantis")).toBe("Atlantis");
  });

  it("tumanLabel renders Cyrillic · Latin", () => {
    expect(tumanLabel("Yunusobod tumani")).toBe("Юнусобод тумани · Yunusobod tumani");
  });
});
