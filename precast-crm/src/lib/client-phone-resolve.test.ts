import { describe, it, expect } from "vitest";
import { resolvePhoneChange } from "./client-phone-resolve";

// Shared fixtures. The owner's rule: NAMES repeat legitimately (several real
// people called "Umidjon"); the PHONE is the unique identity.
const CURRENT = "998907859660";
const OTHER = "998901112233";

const base = {
  currentPhone: CURRENT,
  currentClientName: "Умиджон",
  currentClientOrderCount: 1,
  otherClientWithPhone: null,
  confirmed: false,
};

describe("resolvePhoneChange — no-op cases", () => {
  it("does nothing when the number is byte-identical", () => {
    expect(resolvePhoneChange({ ...base, newPhone: CURRENT })).toEqual({ action: "none" });
  });

  it("does nothing when formatting differs but the number normalizes the same", () => {
    for (const typed of [
      "+998 90 785 96 60",
      "998907859660",
      "+998907859660",
      "90 785 96 60",
      "90-785-96-60",
      "(90) 785 96 60",
      "8 90 785 96 60",
    ]) {
      expect(resolvePhoneChange({ ...base, newPhone: typed })).toEqual({ action: "none" });
    }
  });

  it("stays a no-op even when the current client has many orders", () => {
    expect(
      resolvePhoneChange({
        ...base,
        currentClientOrderCount: 7,
        newPhone: "+998 90 785 96 60",
      }),
    ).toEqual({ action: "none" });
  });
});

describe("resolvePhoneChange — invalid input", () => {
  it("rejects empty / whitespace / non-digit garbage", () => {
    for (const bad of ["", "   ", "abc", "---", "+", "()"]) {
      expect(resolvePhoneChange({ ...base, newPhone: bad })).toEqual({ action: "invalid" });
    }
  });

  it("rejects null and undefined", () => {
    expect(resolvePhoneChange({ ...base, newPhone: null })).toEqual({ action: "invalid" });
    expect(resolvePhoneChange({ ...base, newPhone: undefined })).toEqual({ action: "invalid" });
  });
});

describe("resolvePhoneChange — free number (nobody owns it)", () => {
  it("updates the client's phone outright when they have a single order", () => {
    expect(
      resolvePhoneChange({ ...base, currentClientOrderCount: 1, newPhone: "+998 90 111 22 33" }),
    ).toEqual({ action: "update-phone", phone: OTHER });
  });

  it("updates outright when the client somehow has zero counted orders", () => {
    expect(
      resolvePhoneChange({ ...base, currentClientOrderCount: 0, newPhone: OTHER }),
    ).toEqual({ action: "update-phone", phone: OTHER });
  });

  it("asks for confirmation when the client has more than one order", () => {
    expect(
      resolvePhoneChange({ ...base, currentClientOrderCount: 3, newPhone: OTHER }),
    ).toEqual({
      action: "confirm-required",
      code: "SHARED_CLIENT_PHONE",
      phone: OTHER,
      clientName: "Умиджон",
      orderCount: 3,
    });
  });

  it("applies the change once the multi-order warning is confirmed", () => {
    expect(
      resolvePhoneChange({
        ...base,
        currentClientOrderCount: 3,
        confirmed: true,
        newPhone: OTHER,
      }),
    ).toEqual({ action: "update-phone", phone: OTHER });
  });

  it("normalizes the phone it hands back for writing", () => {
    expect(resolvePhoneChange({ ...base, newPhone: "90 111 22 33" })).toEqual({
      action: "update-phone",
      phone: OTHER,
    });
  });
});

describe("resolvePhoneChange — number already owned by another client", () => {
  const other = { id: "clientB", name: "Умиджон", orderCount: 4 };

  it("asks for confirmation before touching anything", () => {
    expect(
      resolvePhoneChange({ ...base, otherClientWithPhone: other, newPhone: "+998 90 111 22 33" }),
    ).toEqual({
      action: "confirm-required",
      code: "PHONE_BELONGS_TO_OTHER",
      phone: OTHER,
      targetClientId: "clientB",
      targetClientName: "Умиджон",
      targetClientOrderCount: 4,
    });
  });

  it("re-points the order at the owning client once confirmed — never rewrites a phone", () => {
    expect(
      resolvePhoneChange({
        ...base,
        otherClientWithPhone: other,
        confirmed: true,
        newPhone: "+998 90 111 22 33",
      }),
    ).toEqual({ action: "repoint", clientId: "clientB", phone: OTHER });
  });

  it("prefers re-pointing over a phone rewrite even when the current client is multi-order", () => {
    expect(
      resolvePhoneChange({
        ...base,
        currentClientOrderCount: 9,
        otherClientWithPhone: other,
        confirmed: true,
        newPhone: OTHER,
      }),
    ).toEqual({ action: "repoint", clientId: "clientB", phone: OTHER });
  });

  it("still reports PHONE_BELONGS_TO_OTHER (not SHARED) when both conditions hold", () => {
    const d = resolvePhoneChange({
      ...base,
      currentClientOrderCount: 9,
      otherClientWithPhone: other,
      newPhone: OTHER,
    });
    expect(d.action).toBe("confirm-required");
    if (d.action === "confirm-required") expect(d.code).toBe("PHONE_BELONGS_TO_OTHER");
  });

  it("is a no-op when the 'other' client's phone equals the current one (same number)", () => {
    // Defensive: the caller must never pass a same-id match, but an unchanged
    // number must short-circuit before the ownership branch regardless.
    expect(
      resolvePhoneChange({ ...base, otherClientWithPhone: other, newPhone: CURRENT }),
    ).toEqual({ action: "none" });
  });
});

describe("resolvePhoneChange — a client with no phone on file", () => {
  it("treats an empty current phone as a real change", () => {
    expect(
      resolvePhoneChange({ ...base, currentPhone: "", newPhone: OTHER }),
    ).toEqual({ action: "update-phone", phone: OTHER });
  });
});
