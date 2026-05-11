import { describe, it, expect } from "vitest";
import {
  formatDraftNumber,
  nextDraftNumber,
  parseDraftNumber,
} from "../src/lib/draft-number";

describe("formatDraftNumber", () => {
  it("zero-pads to 4 digits", () => {
    expect(formatDraftNumber(1)).toBe("0001D");
    expect(formatDraftNumber(42)).toBe("0042D");
    expect(formatDraftNumber(9999)).toBe("9999D");
  });

  it("does not truncate past 4 digits", () => {
    expect(formatDraftNumber(10000)).toBe("10000D");
    expect(formatDraftNumber(123456)).toBe("123456D");
  });

  it("rejects zero and negatives and non-integers", () => {
    expect(() => formatDraftNumber(0)).toThrow(RangeError);
    expect(() => formatDraftNumber(-1)).toThrow(RangeError);
    expect(() => formatDraftNumber(1.5)).toThrow(RangeError);
  });
});

describe("parseDraftNumber", () => {
  it("parses valid strings", () => {
    expect(parseDraftNumber("0001D")).toEqual({ seq: 1 });
    expect(parseDraftNumber("9999D")).toEqual({ seq: 9999 });
    expect(parseDraftNumber("12345D")).toEqual({ seq: 12345 });
  });

  it("returns null for garbage", () => {
    expect(parseDraftNumber("0001")).toBeNull(); // missing D
    expect(parseDraftNumber("D0001")).toBeNull(); // wrong order
    expect(parseDraftNumber("abc")).toBeNull();
    expect(parseDraftNumber("")).toBeNull();
  });
});

describe("nextDraftNumber", () => {
  it("starts at 1 when no drafts exist", () => {
    expect(nextDraftNumber(null)).toBe(1);
  });

  it("increments from the current max", () => {
    expect(nextDraftNumber(7)).toBe(8);
    expect(nextDraftNumber(9999)).toBe(10000);
  });
});
