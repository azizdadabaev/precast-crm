import { describe, it, expect } from "vitest";
import { isValidWebhookSecret } from "../src/lib/telegram/webhook-secret";

describe("isValidWebhookSecret", () => {
  it("accepts a matching, non-empty header", () => {
    expect(isValidWebhookSecret("abc123", "abc123")).toBe(true);
  });
  it("rejects a mismatch", () => {
    expect(isValidWebhookSecret("wrong", "abc123")).toBe(false);
  });
  it("rejects when the header is missing", () => {
    expect(isValidWebhookSecret(null, "abc123")).toBe(false);
  });
  it("rejects when the expected secret is unset (fail closed)", () => {
    expect(isValidWebhookSecret("abc123", undefined)).toBe(false);
    expect(isValidWebhookSecret("", "")).toBe(false);
  });
});
