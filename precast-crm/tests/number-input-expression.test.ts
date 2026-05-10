import { describe, it, expect } from "vitest";
import { tryParseExpression } from "../src/components/calculation/NumberInput";

describe("NumberInput · inline math expression parser", () => {
  describe("plain numbers", () => {
    it("parses an integer", () => {
      expect(tryParseExpression("5")).toBe(5);
    });
    it("parses a decimal", () => {
      expect(tryParseExpression("0.58")).toBe(0.58);
    });
    it("parses a leading dot", () => {
      expect(tryParseExpression(".58")).toBe(0.58);
    });
    it("accepts comma as a decimal separator", () => {
      expect(tryParseExpression("5,5")).toBe(5.5);
    });
    it("returns null for the empty string", () => {
      expect(tryParseExpression("")).toBeNull();
      expect(tryParseExpression("   ")).toBeNull();
    });
  });

  describe("operators", () => {
    it("multiplies — the operator example from the user", () => {
      expect(tryParseExpression("4*0.58")).toBeCloseTo(2.32, 6);
    });
    it("adds", () => {
      expect(tryParseExpression("1+1.5")).toBe(2.5);
    });
    it("subtracts", () => {
      expect(tryParseExpression("3-1.5")).toBe(1.5);
    });
    it("divides", () => {
      expect(tryParseExpression("9/2")).toBe(4.5);
    });
    it("respects precedence (mul before add)", () => {
      expect(tryParseExpression("2+3*4")).toBe(14);
    });
    it("respects parentheses", () => {
      expect(tryParseExpression("(2+3)*0.58")).toBe(2.9);
    });
    it("handles whitespace anywhere", () => {
      expect(tryParseExpression(" 4 * 0.58 ")).toBeCloseTo(2.32, 6);
      expect(tryParseExpression("(2 + 3) * 4")).toBe(20);
    });
    it("handles unary minus", () => {
      expect(tryParseExpression("-5")).toBe(-5);
      expect(tryParseExpression("3*-2")).toBe(-6);
      expect(tryParseExpression("-(2+3)")).toBe(-5);
    });
    it("handles redundant unary plus", () => {
      expect(tryParseExpression("+5")).toBe(5);
      expect(tryParseExpression("+(2+3)")).toBe(5);
    });
  });

  describe("rejects bad input safely (returns null, never throws)", () => {
    it("rejects letters", () => {
      expect(tryParseExpression("abc")).toBeNull();
      expect(tryParseExpression("4*x")).toBeNull();
    });
    it("rejects trailing operators", () => {
      expect(tryParseExpression("4*")).toBeNull();
      expect(tryParseExpression("4+")).toBeNull();
      expect(tryParseExpression("4/")).toBeNull();
    });
    it("rejects unmatched parentheses", () => {
      expect(tryParseExpression("(4+5")).toBeNull();
      expect(tryParseExpression("4+5)")).toBeNull();
    });
    it("rejects malformed numbers", () => {
      expect(tryParseExpression("1.2.3")).toBeNull();
    });
    it("rejects division by zero (Infinity)", () => {
      expect(tryParseExpression("1/0")).toBeNull();
    });
    it("rejects trailing junk", () => {
      expect(tryParseExpression("5xyz")).toBeNull();
    });
    it("does NOT eval JS — common XSS-ish payloads are rejected", () => {
      // The parser only knows numbers and four operators. There's no
      // identifier table, no function calls — even if some browser
      // engine quirk let `Function` slip in, the parser would reject
      // it before evaluation. This test documents that contract.
      expect(tryParseExpression("alert(1)")).toBeNull();
      expect(tryParseExpression("Math.PI")).toBeNull();
      expect(tryParseExpression("1;2")).toBeNull();
    });
  });
});
