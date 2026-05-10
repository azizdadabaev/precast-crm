import { describe, it, expect } from "vitest";
import { ruleForPath, ROUTE_PERMISSIONS } from "../src/lib/page-auth";
import { ACTIONS } from "../src/lib/permissions";

describe("ruleForPath", () => {
  it("matches an exact path", () => {
    expect(ruleForPath("/dashboard")).toEqual([
      "dashboard.view",
      "dashboard.viewBasic",
    ]);
  });

  it("matches a sub-path via prefix", () => {
    expect(ruleForPath("/orders/abc123")).toBe("order.view");
    expect(ruleForPath("/orders/abc123/print")).toBe("order.view");
  });

  it("matches /sandbox/anything via the /sandbox prefix", () => {
    expect(ruleForPath("/sandbox/tapered")).toBe("sandbox.access");
  });

  it("returns null for an unmapped path", () => {
    expect(ruleForPath("/some/unmapped/page")).toBeNull();
  });

  it("does not match across distinct path segments", () => {
    // /clientsearch should NOT match /clients
    expect(ruleForPath("/clientsearch")).toBeNull();
  });

  it("matches /clients/abc as a child of /clients", () => {
    expect(ruleForPath("/clients/abc")).toBe("client.view");
  });

  it("any-auth rule for /change-password and /profile", () => {
    expect(ruleForPath("/change-password")).toBe("any-auth");
    expect(ruleForPath("/profile")).toBe("any-auth");
  });

  it("every Action used in ROUTE_PERMISSIONS is a valid action", () => {
    const validSet = new Set<string>(ACTIONS);
    for (const [path, rule] of Object.entries(ROUTE_PERMISSIONS)) {
      if (rule === "any-auth") continue;
      const list = Array.isArray(rule) ? rule : [rule];
      for (const a of list) {
        expect(validSet.has(a), `${path}: unknown action ${a}`).toBe(true);
      }
    }
  });
});
