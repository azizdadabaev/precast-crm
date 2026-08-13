import { describe, it, expect } from "vitest";
import {
  generateToken,
  extractToken,
  isWellFormedToken,
  expiryFrom,
  TOKEN_ALPHABET,
  TOKEN_LENGTH,
  TOKEN_TTL_DAYS,
} from "./handoff-token";

describe("generateToken", () => {
  it("is always TOKEN_LENGTH chars from the alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const t = generateToken();
      expect(t).toHaveLength(TOKEN_LENGTH);
      for (const c of t) expect(TOKEN_ALPHABET).toContain(c);
    }
  });

  it("never emits the confusable letters I, L, O or U", () => {
    const joined = Array.from({ length: 300 }, generateToken).join("");
    for (const bad of ["I", "L", "O", "U"]) expect(joined).not.toContain(bad);
  });

  it("does not obviously repeat (sanity check on randomness)", () => {
    const seen = new Set(Array.from({ length: 500 }, generateToken));
    // 32^6 space — 500 draws colliding more than a handful of times would be alarming.
    expect(seen.size).toBeGreaterThan(495);
  });
});

describe("extractToken", () => {
  it("finds a bare token", () => {
    expect(extractToken("A7K2M9")).toBe("A7K2M9");
  });

  it("finds a token surrounded by text, as the customer will actually send it", () => {
    expect(extractToken("Salom A7K2M9")).toBe("A7K2M9");
    expect(extractToken("A7K2M9 manzil kerak")).toBe("A7K2M9");
    expect(extractToken("Assalomu alaykum, A7K2M9. Rahmat!")).toBe("A7K2M9");
  });

  it("uppercases, because phone keyboards autocapitalize unpredictably", () => {
    expect(extractToken("a7k2m9")).toBe("A7K2M9");
    expect(extractToken("A7k2M9")).toBe("A7K2M9");
  });

  it("returns null for empty or missing input", () => {
    expect(extractToken("")).toBeNull();
    expect(extractToken(null)).toBeNull();
    expect(extractToken(undefined)).toBeNull();
  });

  it("ignores runs that are not exactly six chars", () => {
    expect(extractToken("A7K2M")).toBeNull();       // five
    expect(extractToken("A7K2M9Z")).toBeNull();     // seven — no word boundary
  });

  it("ignores words containing an excluded letter", () => {
    // SALOM has O, KELDIM has I and L — neither can be a token.
    expect(extractToken("SALOM")).toBeNull();
    expect(extractToken("KELDIM")).toBeNull();
  });

  it("does not match across a word boundary", () => {
    expect(extractToken("AAA BBB")).toBeNull();
  });

  it("a coincidental six-char word is only a CANDIDATE — the caller still has to find a live row", () => {
    // "RAHMAT" is six chars and uses only legal characters, so it matches the
    // shape. That is acceptable: it will simply not resolve to a PENDING row.
    expect(extractToken("RAHMAT")).toBe("RAHMAT");
  });
});

describe("isWellFormedToken", () => {
  it("accepts a generated token", () => {
    expect(isWellFormedToken(generateToken())).toBe(true);
  });

  it("rejects wrong length, excluded letters, and empty input", () => {
    expect(isWellFormedToken("A7K2M")).toBe(false);
    expect(isWellFormedToken("A7K2M9Z")).toBe(false);
    expect(isWellFormedToken("A7K2MI")).toBe(false); // I excluded
    expect(isWellFormedToken("")).toBe(false);
    expect(isWellFormedToken(null)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isWellFormedToken("a7k2m9")).toBe(true);
  });
});

describe("expiryFrom", () => {
  it("is TOKEN_TTL_DAYS after the given instant", () => {
    const now = new Date("2026-08-13T10:00:00.000Z");
    const exp = expiryFrom(now);
    expect(exp.getTime() - now.getTime()).toBe(TOKEN_TTL_DAYS * 86_400_000);
  });

  it("does not mutate the input", () => {
    const now = new Date("2026-08-13T10:00:00.000Z");
    const before = now.getTime();
    expiryFrom(now);
    expect(now.getTime()).toBe(before);
  });
});
