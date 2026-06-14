import { describe, it, expect } from "vitest";
import { foldForSearch, matchesSearch } from "@/lib/search-fold";

describe("foldForSearch", () => {
  it("folds Cyrillic and Latin spellings of a name to the same form", () => {
    expect(foldForSearch("Алишер")).toBe("alisher");
    expect(foldForSearch("Alisher")).toBe("alisher");
  });

  it("transliterates digraphs and Uzbek letters", () => {
    expect(foldForSearch("Тошкент")).toBe(foldForSearch("Toshkent"));
    expect(foldForSearch("Жасур")).toBe("jasur");
    expect(foldForSearch("Хуршид")).toBe("xurshid");
  });

  it("drops apostrophes, diacritics, spaces and punctuation", () => {
    expect(foldForSearch("O'rinov, Davron")).toBe("orinovdavron");
    expect(foldForSearch("g‘ulom")).toBe("gulom");
  });

  it("keeps digits (so usernames / numbers stay searchable)", () => {
    expect(foldForSearch("user_2233")).toBe("user2233");
  });

  it("returns empty for null/empty", () => {
    expect(foldForSearch(null)).toBe("");
    expect(foldForSearch("   ")).toBe("");
  });
});

describe("matchesSearch", () => {
  it("matches across alphabets in both directions", () => {
    expect(matchesSearch("Alisher Davronov", "алишер")).toBe(true);
    expect(matchesSearch("Алишер Давронов", "alisher")).toBe(true);
  });

  it("matches a substring of any joined field", () => {
    expect(matchesSearch("Davron aka @davron_uz salom narx", "davron")).toBe(true);
    expect(matchesSearch("Davron aka", "aka")).toBe(true);
  });

  it("an empty query matches everything", () => {
    expect(matchesSearch("anything", "")).toBe(true);
    expect(matchesSearch("anything", "   ")).toBe(true);
  });

  it("does not match an unrelated query", () => {
    expect(matchesSearch("Alisher", "bekzod")).toBe(false);
  });
});
