import { describe, it, expect, beforeEach } from "vitest";
import {
  stashPhoto,
  getSessionByFrom,
  hasPendingSession,
  setSessionOrder,
  takeSessionByToken,
  clearSession,
  __resetSessionsForTest,
} from "@/lib/agent/operator-photo-session";

const T0 = 1_000_000;
const photo = (n: number) => ({ fileId: `f${n}`, fileUniqueId: `u${n}` });
const order = { id: "ord1", orderNumber: "2026-06-0020", status: "LOADED", system: "FLOOR" as const };

beforeEach(() => __resetSessionsForTest());

describe("operator-photo session store", () => {
  it("creates a new session on the first photo and accumulates the rest (album)", () => {
    const first = stashPhoto("op1", "chat1", photo(1), null, T0);
    expect(first.isNew).toBe(true);
    expect(first.session.photos).toHaveLength(1);

    const second = stashPhoto("op1", "chat1", photo(2), null, T0 + 100);
    expect(second.isNew).toBe(false);
    expect(second.session.token).toBe(first.session.token);
    expect(second.session.photos).toHaveLength(2);
  });

  it("attaches the order from a captioned photo, and keeps it when later album photos have none", () => {
    const first = stashPhoto("op1", "chat1", photo(1), order, T0);
    expect(first.session.order).toEqual(order);
    const second = stashPhoto("op1", "chat1", photo(2), null, T0 + 100);
    expect(second.session.order).toEqual(order); // not overwritten with null
  });

  it("resolves the order later via setSessionOrder (typed-reply path)", () => {
    stashPhoto("op1", "chat1", photo(1), null, T0);
    expect(getSessionByFrom("op1", T0)?.order).toBeNull();
    const updated = setSessionOrder("op1", order, T0 + 50);
    expect(updated?.order).toEqual(order);
    expect(setSessionOrder("nobody", order, T0)).toBeNull();
  });

  it("takeSessionByToken returns once then is gone (double-tap safe)", () => {
    const { session } = stashPhoto("op1", "chat1", photo(1), order, T0);
    const taken = takeSessionByToken(session.token, T0);
    expect(taken?.photos).toHaveLength(1);
    expect(takeSessionByToken(session.token, T0)).toBeNull();
    expect(hasPendingSession("op1", T0)).toBe(false);
  });

  it("expires sessions after the TTL", () => {
    const { session } = stashPhoto("op1", "chat1", photo(1), order, T0);
    const past = T0 + 16 * 60 * 1000; // > 15 min
    expect(hasPendingSession("op1", past)).toBe(false);
    expect(getSessionByFrom("op1", past)).toBeNull();
    expect(takeSessionByToken(session.token, past)).toBeNull();
  });

  it("isolates sessions per sender and clears on demand", () => {
    stashPhoto("op1", "chat1", photo(1), order, T0);
    stashPhoto("op2", "chat2", photo(9), null, T0);
    expect(hasPendingSession("op1", T0)).toBe(true);
    expect(hasPendingSession("op2", T0)).toBe(true);
    clearSession("op1");
    expect(hasPendingSession("op1", T0)).toBe(false);
    expect(hasPendingSession("op2", T0)).toBe(true);
  });
});
