import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/pricing-config", () => ({
  loadPricingConfig: async () => ({
    m2_price_tiers: [{ max_beam_length: 4.3, price: 140000 }],
    extra_beam_price_tiers: [{ max_beam_length: 4.3, price: 60000 }],
    block_unit_price: 6000,
  }),
  loadPricingMeta: async () => ({ updatedAt: null }),
}));

import { getCurrentUser } from "@/lib/auth";
import { GET } from "@/app/api/mobile/bootstrap/route";
import { CAPACITY_THRESHOLDS } from "@/lib/capacity";

const user = { id: "u1", email: "", name: "Азиз", role: "SALES" as const, permissions: ["order.view"], isActive: true, mustChangePassword: false };
const orig = process.env.MOBILE_MIN_APP_VERSION;
beforeEach(() => vi.mocked(getCurrentUser).mockResolvedValue(user));
afterEach(() => { process.env.MOBILE_MIN_APP_VERSION = orig; });

describe("GET /api/mobile/bootstrap", () => {
  it("returns me, pricing, thresholds, regions version and min app version", async () => {
    process.env.MOBILE_MIN_APP_VERSION = "1.2.0";
    const res = await GET(new NextRequest(new URL("http://localhost/api/mobile/bootstrap")), { params: {} });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.me.id).toBe("u1");
    expect(data.me.permissions).toEqual(["order.view"]);
    expect(data.pricing.blockUnitPrice).toBe(6000);
    expect(data.pricing.m2PriceTiers[0]).toEqual({ max_beam_length: 4.3, price: 140000 });
    expect(data.capacityThresholds).toEqual(CAPACITY_THRESHOLDS);
    expect(data.regionsVersion).toMatch(/^\d+-\d+$/);
    expect(data.minSupportedAppVersion).toBe("1.2.0");
    expect(typeof data.serverTime).toBe("string");
  });
  it("defaults minSupportedAppVersion to 0", async () => {
    delete process.env.MOBILE_MIN_APP_VERSION;
    const res = await GET(new NextRequest(new URL("http://localhost/api/mobile/bootstrap")), { params: {} });
    expect((await res.json()).data.minSupportedAppVersion).toBe("0");
  });
});
