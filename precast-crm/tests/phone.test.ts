import { describe, it, expect } from "vitest";
import {
  digitsOnly,
  normalizePhone,
  formatPhone,
  formatPhoneCompact,
  phoneMatches,
  phoneMatchForms,
} from "../src/lib/phone";

describe("digitsOnly", () => {
  it("strips spaces, dashes, parens, plus signs", () => {
    expect(digitsOnly("+998 (90) 111-22-33")).toBe("998901112233");
  });
  it("returns empty for null/empty", () => {
    expect(digitsOnly(null)).toBe("");
    expect(digitsOnly("")).toBe("");
    expect(digitsOnly("---")).toBe("");
  });
});

describe("normalizePhone", () => {
  it("keeps 12-digit 998… as-is", () => {
    expect(normalizePhone("+998901112233")).toBe("998901112233");
    expect(normalizePhone("998901112233")).toBe("998901112233");
  });
  it("prefixes 998 to a 9-digit number", () => {
    expect(normalizePhone("901112233")).toBe("998901112233");
  });
  it("swaps Soviet trunk prefix 8 for 998", () => {
    expect(normalizePhone("8901112233")).toBe("998901112233");
    expect(normalizePhone("89001112233")).toBe("9989001112233".slice(0)); // 13 digits, just trim leading 8
  });
  it("returns empty for empty input", () => {
    expect(normalizePhone(null)).toBe("");
  });
});

describe("formatPhone", () => {
  it("formats canonical UZ number for display", () => {
    expect(formatPhone("998901112233")).toBe("+998 90 111 22 33");
  });
  it("returns digits unchanged when not UZ-shaped", () => {
    expect(formatPhone("12345")).toBe("12345");
  });
});

describe("formatPhoneCompact", () => {
  it("returns the +998-prefixed digits with no spaces", () => {
    expect(formatPhoneCompact("998901112233")).toBe("+998901112233");
  });
  it("strips formatting noise from the input first", () => {
    expect(formatPhoneCompact("+998 (90) 111-22-33")).toBe("+998901112233");
  });
  it("returns empty for null/empty", () => {
    expect(formatPhoneCompact(null)).toBe("");
    expect(formatPhoneCompact("")).toBe("");
  });
  it("returns digits unchanged when not UZ-shaped", () => {
    expect(formatPhoneCompact("12345")).toBe("12345");
  });
});

describe("phoneMatches", () => {
  it("matches by trailing digits", () => {
    expect(phoneMatches("998901112233", "2233")).toBe(true);
    expect(phoneMatches("998901112233", "11 22 33")).toBe(true);
    expect(phoneMatches("998901112233", "0000")).toBe(false);
  });
  it("ignores formatting in the query", () => {
    expect(phoneMatches("998901112233", "11 22 33")).toBe(true);
    expect(phoneMatches("998901112233", "(22) 33")).toBe(true);
  });
});

describe("phoneMatchForms", () => {
  it("returns full + last9 + last7 + last4", () => {
    const forms = phoneMatchForms("998901112233");
    expect(forms).toContain("998901112233");
    expect(forms).toContain("901112233");
    expect(forms).toContain("1112233");
    expect(forms).toContain("2233");
  });
});
