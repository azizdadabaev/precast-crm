import { describe, it, expect } from "vitest";
import { encodePhotoCallback, parsePhotoCallback } from "@/lib/agent/operator-photo-callback";

describe("operator-photo callback codec", () => {
  it("round-trips receipt and truck kinds", () => {
    expect(parsePhotoCallback(encodePhotoCallback("abc123", "RECEIPT"))).toEqual({
      token: "abc123",
      kind: "RECEIPT",
    });
    expect(parsePhotoCallback(encodePhotoCallback("abc123", "LOADED"))).toEqual({
      token: "abc123",
      kind: "LOADED",
    });
  });

  it("stays within Telegram's 64-byte callback_data limit", () => {
    const data = encodePhotoCallback("0123456789ab", "LOADED");
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(64);
  });

  it("ignores approval and malformed callbacks", () => {
    expect(parsePhotoCallback("approve:clx123")).toBeNull(); // approval button
    expect(parsePhotoCallback("reject:clx123")).toBeNull();
    expect(parsePhotoCallback("op:abc")).toBeNull(); // missing kind
    expect(parsePhotoCallback("op:abc:x")).toBeNull(); // bad kind code
    expect(parsePhotoCallback("op::r")).toBeNull(); // empty token
    expect(parsePhotoCallback(null)).toBeNull();
    expect(parsePhotoCallback("")).toBeNull();
  });

  it("rejects a token containing the separator at encode time", () => {
    expect(() => encodePhotoCallback("a:b", "RECEIPT")).toThrow();
  });
});
