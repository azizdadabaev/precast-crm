import { describe, it, expect } from "vitest";
import { GAZOBLOK_PERMISSION, gazoblokPageRule } from "@/lib/gazoblok-permissions";
import { ACTIONS } from "@/lib/permissions";

describe("gazoblok permissions — same keys as beam-and-block (owner 2026-11-10)", () => {
  it("maps every gazoblok action to the spec §4.7 key", () => {
    expect(GAZOBLOK_PERMISSION).toEqual({
      viewOrders: "order.view",
      placeOrder: "order.create",
      editOrder: "order.edit",
      correctDeliveredTruck: "order.editShipped",
      cancelOrder: "order.cancel",
      recordPayment: "payment.record",
      confirmPayment: "payment.confirm",
      viewStock: "inventory.view",
      manageStock: "inventory.manage",
      editPrices: "pricing.edit",
    });
  });

  it("uses only keys that exist", () => {
    for (const key of Object.values(GAZOBLOK_PERMISSION)) expect(ACTIONS).toContain(key);
  });

  it("guards each gazoblok page", () => {
    expect(gazoblokPageRule("/gazoblok/orders")).toBe("order.view");
    expect(gazoblokPageRule("/gazoblok/orders/abc")).toBe("order.view");
    expect(gazoblokPageRule("/gazoblok/new")).toBe("order.create");
    expect(gazoblokPageRule("/gazoblok/stock")).toBe("inventory.view");
    expect(gazoblokPageRule("/gazoblok/production")).toBe("inventory.view");
    expect(gazoblokPageRule("/gazoblok/catalog")).toBe("pricing.edit");
  });
});

describe("gazoblok dashboard page rule (Stage 2 §3)", () => {
  it("admits dashboard.view or dashboard.viewBasic, like /dashboard", async () => {
    const { ruleForPath } = await import("@/lib/page-auth");
    expect(ruleForPath("/gazoblok/dashboard")).toEqual(["dashboard.view", "dashboard.viewBasic"]);
    expect(ruleForPath("/gazoblok/orders/x")).toBe("order.view");
  });
});
