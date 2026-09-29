import { describe, it, expect } from "vitest";
import { ACTIONS, ACTION_LABELS, ROLE_TEMPLATES, PERMISSION_GROUPS } from "../src/lib/permissions";
import { ROUTE_PERMISSIONS } from "../src/lib/page-auth";

describe("crew pay permission", () => {
  it("exists, is labelled, grouped, owner-only, and guards /crew-pay", () => {
    expect(ACTIONS).toContain("crewpay.manage");
    expect(ACTION_LABELS["crewpay.manage" as keyof typeof ACTION_LABELS]).toMatch(/Бригада маоши/);
    expect(PERMISSION_GROUPS.some((g) => (g.actions as string[]).includes("crewpay.manage"))).toBe(true);
    expect(ROLE_TEMPLATES.OWNER).toContain("crewpay.manage");
    for (const [role, acts] of Object.entries(ROLE_TEMPLATES)) {
      if (role !== "OWNER") expect(acts).not.toContain("crewpay.manage");
    }
    expect(ROUTE_PERMISSIONS["/crew-pay"]).toBe("crewpay.manage");
  });
});
