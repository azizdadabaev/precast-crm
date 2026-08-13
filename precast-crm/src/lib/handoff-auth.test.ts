import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { verifyDeviceToken, deviceTokenConfigured } from "./handoff-auth";

const REAL_TOKEN = "h4nd0ff-device-secret-9f3c1a7b2e5d8c604a1f";

const req = (authHeader?: string) => {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("Authorization", authHeader);
  return new NextRequest(new URL("http://localhost/api/handoff"), {
    method: "POST",
    headers,
  });
};

beforeEach(() => {
  process.env.HANDOFF_DEVICE_TOKEN = REAL_TOKEN;
});
afterEach(() => {
  delete process.env.HANDOFF_DEVICE_TOKEN;
});

describe("verifyDeviceToken", () => {
  it("accepts the exact configured token", () => {
    expect(verifyDeviceToken(req(`Bearer ${REAL_TOKEN}`))).toBe(true);
  });

  it("rejects a wrong token of the same length", () => {
    const wrong = "X" + REAL_TOKEN.slice(1);
    expect(wrong).toHaveLength(REAL_TOKEN.length);
    expect(verifyDeviceToken(req(`Bearer ${wrong}`))).toBe(false);
  });

  it("rejects a token of a different length without throwing", () => {
    // timingSafeEqual throws a RangeError on unequal buffer lengths — the
    // SHA-256 digests are what keep this a plain `false`.
    expect(() => verifyDeviceToken(req("Bearer short"))).not.toThrow();
    expect(verifyDeviceToken(req("Bearer short"))).toBe(false);
    expect(verifyDeviceToken(req(`Bearer ${REAL_TOKEN}${REAL_TOKEN}`))).toBe(false);
  });

  it("rejects a missing Authorization header", () => {
    expect(verifyDeviceToken(req())).toBe(false);
  });

  it("rejects non-Bearer schemes and a bare token", () => {
    expect(verifyDeviceToken(req(`Basic ${REAL_TOKEN}`))).toBe(false);
    expect(verifyDeviceToken(req(`bearer ${REAL_TOKEN}`))).toBe(false);
    expect(verifyDeviceToken(req(REAL_TOKEN))).toBe(false);
  });

  it("rejects an empty Bearer value", () => {
    expect(verifyDeviceToken(req("Bearer "))).toBe(false);
    expect(verifyDeviceToken(req("Bearer    "))).toBe(false);
  });

  it("fails closed when HANDOFF_DEVICE_TOKEN is unset", () => {
    delete process.env.HANDOFF_DEVICE_TOKEN;
    expect(verifyDeviceToken(req(`Bearer ${REAL_TOKEN}`))).toBe(false);
    // An attacker guessing the empty string must not get in either.
    expect(verifyDeviceToken(req("Bearer "))).toBe(false);
  });

  it("fails closed when HANDOFF_DEVICE_TOKEN is blank or whitespace", () => {
    process.env.HANDOFF_DEVICE_TOKEN = "";
    expect(verifyDeviceToken(req(`Bearer ${REAL_TOKEN}`))).toBe(false);
    process.env.HANDOFF_DEVICE_TOKEN = "   ";
    expect(verifyDeviceToken(req("Bearer    "))).toBe(false);
  });

  it("ignores surrounding whitespace in the header value", () => {
    expect(verifyDeviceToken(req(`Bearer   ${REAL_TOKEN}  `))).toBe(true);
  });
});

describe("deviceTokenConfigured", () => {
  it("is true only for a non-blank env var", () => {
    expect(deviceTokenConfigured()).toBe(true);
    process.env.HANDOFF_DEVICE_TOKEN = "   ";
    expect(deviceTokenConfigured()).toBe(false);
    delete process.env.HANDOFF_DEVICE_TOKEN;
    expect(deviceTokenConfigured()).toBe(false);
  });
});
