import { describe, it, expect } from "vitest";
import {
  ACTIONS,
  ROLE_TEMPLATES,
  can,
  canAll,
  canAny,
  getDefaultPermissionsForRole,
  homeForUser,
  isUserCustomized,
  type Action,
  type PermissionSubject,
} from "../src/lib/permissions";

const activeUser = (perms: Action[]): PermissionSubject => ({
  permissions: perms,
  isActive: true,
});

describe("can", () => {
  it("returns false for null user", () => {
    expect(can(null, "order.view")).toBe(false);
  });

  it("returns false for undefined user", () => {
    expect(can(undefined, "order.view")).toBe(false);
  });

  it("returns false for inactive user even with the permission", () => {
    expect(
      can({ permissions: ["order.view"], isActive: false }, "order.view"),
    ).toBe(false);
  });

  it("returns true when user.permissions contains the action", () => {
    expect(can(activeUser(["order.view"]), "order.view")).toBe(true);
  });

  it("returns false when user.permissions does not contain the action", () => {
    expect(can(activeUser(["order.view"]), "order.cancel")).toBe(false);
  });

  it("returns false for empty permissions", () => {
    expect(can(activeUser([]), "order.view")).toBe(false);
  });
});

describe("canAll", () => {
  it("returns true when user has all listed actions", () => {
    expect(
      canAll(activeUser(["order.view", "order.create"]), [
        "order.view",
        "order.create",
      ]),
    ).toBe(true);
  });

  it("returns false when user is missing one of the actions", () => {
    expect(
      canAll(activeUser(["order.view"]), ["order.view", "order.cancel"]),
    ).toBe(false);
  });

  it("returns true for empty action list (vacuous truth)", () => {
    expect(canAll(activeUser([]), [])).toBe(true);
  });

  it("returns false for inactive user", () => {
    expect(
      canAll(
        { permissions: ["order.view", "order.create"], isActive: false },
        ["order.view"],
      ),
    ).toBe(false);
  });
});

describe("canAny", () => {
  it("returns true when user has at least one of the actions", () => {
    expect(
      canAny(activeUser(["order.view"]), ["order.view", "order.cancel"]),
    ).toBe(true);
  });

  it("returns false when user has none of the actions", () => {
    expect(
      canAny(activeUser(["client.view"]), ["order.view", "order.cancel"]),
    ).toBe(false);
  });

  it("returns false for empty action list", () => {
    expect(canAny(activeUser(["order.view"]), [])).toBe(false);
  });
});

describe("getDefaultPermissionsForRole", () => {
  it("returns the OWNER template", () => {
    const perms = getDefaultPermissionsForRole("OWNER");
    expect(perms).toContain("user.disable");
    expect(perms).toContain("user.editPermissions");
    expect(perms).toContain("dashboard.view");
  });

  it("ADMIN template excludes user.disable and user.editPermissions", () => {
    const perms = getDefaultPermissionsForRole("ADMIN");
    expect(perms).toContain("user.create");
    expect(perms).not.toContain("user.disable");
    expect(perms).not.toContain("user.editPermissions");
  });

  it("SALES template includes calculator.use but not order.cancel", () => {
    const perms = getDefaultPermissionsForRole("SALES");
    expect(perms).toContain("calculator.use");
    expect(perms).not.toContain("order.cancel");
  });

  it("returns a fresh array each call (mutation does not leak)", () => {
    const a = getDefaultPermissionsForRole("OWNER");
    a.push("__poison__" as Action);
    const b = getDefaultPermissionsForRole("OWNER");
    expect(b).not.toContain("__poison__");
  });

  it("returns empty array for CUSTOM template", () => {
    expect(getDefaultPermissionsForRole("CUSTOM")).toEqual([]);
  });

  it("returns empty array for unknown role", () => {
    expect(getDefaultPermissionsForRole("WAT_NO_SUCH_ROLE")).toEqual([]);
  });

  it("every action in every template is a valid Action", () => {
    const validSet = new Set<string>(ACTIONS);
    for (const [role, perms] of Object.entries(ROLE_TEMPLATES)) {
      for (const p of perms) {
        expect(validSet.has(p), `${role}: unknown action ${p}`).toBe(true);
      }
    }
  });
});

describe("isUserCustomized", () => {
  it("returns false when permissions match the template exactly", () => {
    const perms = getDefaultPermissionsForRole("SALES");
    expect(isUserCustomized({ role: "SALES", permissions: perms })).toBe(false);
  });

  it("returns true when permissions are missing one entry", () => {
    const perms = getDefaultPermissionsForRole("SALES").slice(0, -1);
    expect(isUserCustomized({ role: "SALES", permissions: perms })).toBe(true);
  });

  it("returns true when permissions have an extra entry beyond the template", () => {
    const perms = [
      ...getDefaultPermissionsForRole("SALES"),
      "report.export" as Action,
    ];
    expect(isUserCustomized({ role: "SALES", permissions: perms })).toBe(true);
  });

  it("returns false regardless of order", () => {
    const perms = getDefaultPermissionsForRole("SALES").slice().reverse();
    expect(isUserCustomized({ role: "SALES", permissions: perms })).toBe(false);
  });

  it("CUSTOM with any permissions is considered customized (template is empty)", () => {
    expect(
      isUserCustomized({ role: "CUSTOM", permissions: ["order.view"] }),
    ).toBe(true);
  });

  it("CUSTOM with empty permissions matches the template (not customized)", () => {
    expect(isUserCustomized({ role: "CUSTOM", permissions: [] })).toBe(false);
  });
});

describe("homeForUser", () => {
  it("sends users with dashboard.view to /dashboard", () => {
    expect(homeForUser(activeUser(["dashboard.view"]))).toBe("/dashboard");
  });

  it("sends users with only dashboard.viewBasic to /dashboard", () => {
    expect(homeForUser(activeUser(["dashboard.viewBasic"]))).toBe("/dashboard");
  });

  it("sends sales-style users (calculator.use, no dashboard) to /calculations", () => {
    expect(
      homeForUser(activeUser(["calculator.use", "order.create"])),
    ).toBe("/calculations");
  });

  it("sends inventory-only users to /inventory", () => {
    expect(homeForUser(activeUser(["inventory.view"]))).toBe("/inventory");
  });

  it("sends driver-style users to /dispatches", () => {
    expect(
      homeForUser(activeUser(["dispatch.view", "payment.record"])),
    ).toBe("/dispatches");
  });

  it("falls back to /profile when user has no listed-page permission", () => {
    expect(homeForUser(activeUser([]))).toBe("/profile");
  });

  it("falls back to /profile for inactive users (since can() returns false)", () => {
    expect(
      homeForUser({ permissions: ["dashboard.view"], isActive: false }),
    ).toBe("/profile");
  });
});
