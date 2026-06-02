import { describe, it, expect, afterEach } from "vitest";
import { verifyInboxPassword } from "../src/lib/inbox-auth";

const original = process.env.INBOX_PASSWORD;
afterEach(() => { process.env.INBOX_PASSWORD = original; });

describe("verifyInboxPassword", () => {
  it("accepts the exact configured password", () => {
    process.env.INBOX_PASSWORD = "open-sesame";
    expect(verifyInboxPassword("open-sesame")).toBe(true);
  });
  it("rejects a wrong password", () => {
    process.env.INBOX_PASSWORD = "open-sesame";
    expect(verifyInboxPassword("nope")).toBe(false);
  });
  it("fails closed when no password is configured", () => {
    delete process.env.INBOX_PASSWORD;
    expect(verifyInboxPassword("anything")).toBe(false);
    process.env.INBOX_PASSWORD = "";
    expect(verifyInboxPassword("")).toBe(false);
  });
});
