import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
const loadPricingConfig = vi.fn();
vi.mock("@/lib/pricing-config", () => ({ loadPricingConfig: (...a: unknown[]) => loadPricingConfig(...a) }));

import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_PRICE_CONFIG } from "@/services/calculation-engine";
import { computeOrderTotals } from "@/lib/order-totals";
import { POST } from "@/app/api/calculate/batch/route";
import { CalculateBatchSchema } from "@/app/api/calculate/batch/schema";

const user = { id: "u1", email: "", name: "", role: "SALES" as const, permissions: ["calculator.use"], isActive: true, mustChangePassword: false };
beforeEach(() => { vi.mocked(getCurrentUser).mockResolvedValue(user); loadPricingConfig.mockResolvedValue(DEFAULT_PRICE_CONFIG); });

const post = (body: unknown) => new NextRequest(new URL("http://localhost/api/calculate/batch"), {
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
});

describe("CalculateBatchSchema", () => {
  it("requires at least one room and defaults the money fields", () => {
    const p = CalculateBatchSchema.parse({ rooms: [{ innerWidth: 4.2, innerLength: 6.1 }] });
    expect(p.discountPercent).toBe(0);
    expect(p.deliveryCost).toBe(0);
    expect(CalculateBatchSchema.safeParse({ rooms: [] }).success).toBe(false);
  });
});

describe("POST /api/calculate/batch", () => {
  it("matches computeOrderTotals exactly under live pricing", async () => {
    const rooms = [{ innerWidth: 4.2, innerLength: 6.1 }, { innerWidth: 3.6, innerLength: 5 }];
    const res = await POST(post({ rooms, discountPercent: 5, deliveryCost: 200000 }), { params: {} });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const expected = computeOrderTotals(rooms, { discountPercent: 5, discountAmount: 0, deliveryCost: 200000, otherCost: 0 }, DEFAULT_PRICE_CONFIG);
    expect(data.totalPrice).toBe(expected.totalPrice);
    expect(data.roomsSubtotal).toBe(expected.roomsSubtotal);
    expect(data.rooms[0].beam_count).toBe(expected.computed[0].result.beam_count);
    expect(data.discountMode).toBe("PERCENT");
  });
  it("uses the DB pricing, not the hard-coded defaults", async () => {
    loadPricingConfig.mockResolvedValue({
      ...DEFAULT_PRICE_CONFIG,
      m2_price_tiers: DEFAULT_PRICE_CONFIG.m2_price_tiers.map((t) => ({ ...t, price: t.price * 2 })),
    });
    const res = await POST(post({ rooms: [{ innerWidth: 4.2, innerLength: 6.1 }] }), { params: {} });
    const { data } = await res.json();
    // beam_length for this room is 4.2 + 2*0.15 = 4.5, which falls in tier
    // index 1 (max_beam_length 5.30), not tier 0 (max_beam_length 4.30).
    expect(data.rooms[0].m2_price).toBe(DEFAULT_PRICE_CONFIG.m2_price_tiers[1].price * 2);
  });
  it("returns 403 without calculator.use", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...user, permissions: [] });
    const res = await POST(post({ rooms: [{ innerWidth: 4.2, innerLength: 6.1 }] }), { params: {} });
    expect(res.status).toBe(403);
  });
});
