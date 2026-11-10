import { describe, it, expect } from "vitest";
import { forViewer } from "@/lib/gazoblok-dashboard-data";
import type { GazoblokDashboard } from "@/lib/gazoblok-dashboard";

const fixture: GazoblokDashboard = {
  generatedAt: "2026-11-10T07:00:00.000Z",
  money: {
    months: [{ key: "2026-11", label: "Ноя", year: 2026, booked: 5_000_000, orders: 1, blocks: 300, volumeM3: 9.72, collected: 2_500_000 }],
    receivables: { total: 2_000_000, orders: 1 },
    unconfirmed: { total: 1_500_000, count: 1 },
    overload: { total: 500_000, extraBlocks: 32, orders: 1, operators: [] },
  },
  stock: [{ productId: "pA", label: "600×300×200", onHand: 1240, reserved: 432, free: 808, state: "ok" }],
  trucks: [],
  plan: [],
  unscheduledOpen: 0,
};

describe("forViewer — money only for dashboard.view (spec §3 ruling 2)", () => {
  it("viewBasic gets no money", () => {
    const d = forViewer(fixture, { isActive: true, permissions: ["dashboard.viewBasic"] });
    expect(d.money).toBeNull();
    expect(d.stock).toEqual(fixture.stock);
  });

  it("dashboard.view gets the money", () => {
    expect(forViewer(fixture, { isActive: true, permissions: ["dashboard.view"] }).money).toEqual(fixture.money);
  });

  it("an inactive user gets no money", () => {
    expect(forViewer(fixture, { isActive: false, permissions: ["dashboard.view"] }).money).toBeNull();
  });
});
