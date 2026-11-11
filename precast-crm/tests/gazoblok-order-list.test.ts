import { describe, it, expect } from "vitest";
import {
  phoneSearchFragments,
  orderListWhere,
  orderListExtras,
  reorderSourceProblem,
  orderCounts,
} from "@/lib/gazoblok-order-list";
import { parseOrderListQuery } from "@/lib/gazoblok-order-filters";

const phoneClauses = (where: ReturnType<typeof orderListWhere>) =>
  (where.OR ?? []).flatMap((c) => {
    const phone = (c.client as { phone?: { contains: string } } | undefined)?.phone;
    return phone ? [phone.contains] : [];
  });

describe("phoneSearchFragments", () => {
  it("a 5-digit partial is searched as typed", () => {
    expect(phoneSearchFragments("111 22")).toEqual(["11122"]);
  });

  it("a partial typed as displayed keeps its raw digits", () => {
    expect(phoneSearchFragments("90 123 45")).toEqual(["9012345"]);
  });

  it("a local 9-digit number matches as typed and as the full 998 number", () => {
    expect(phoneSearchFragments("90 111 22 33")).toEqual(["901112233", "998901112233"]);
  });

  it("a full number typed with + and spaces gives one fragment", () => {
    expect(phoneSearchFragments("+998 90 111 22 33")).toEqual(["998901112233"]);
  });

  it("fewer than 4 digits or any letter → no phone search", () => {
    expect(phoneSearchFragments("123")).toEqual([]);
    expect(phoneSearchFragments("B-2026-11")).toEqual([]);
    expect(phoneSearchFragments("Тест 1234")).toEqual([]);
  });
});

describe("orderListWhere", () => {
  it("a 5-digit partial finds the order through the client phone", () => {
    const where = orderListWhere(parseOrderListQuery(new URLSearchParams("q=111 22")), null);
    expect(phoneClauses(where)).toEqual(["11122"]);
    expect(where.OR).toContainEqual({ orderNumber: { contains: "111 22", mode: "insensitive" } });
    expect(where.OR).toContainEqual({ client: { name: { contains: "111 22", mode: "insensitive" } } });
  });

  it("a 9-digit partial is not lost to the 998 prefix", () => {
    const where = orderListWhere(parseOrderListQuery(new URLSearchParams("q=901112233")), null);
    expect(phoneClauses(where)).toEqual(["901112233", "998901112233"]);
  });

  it("keeps the other filters from buildOrderWhere", () => {
    const where = orderListWhere(
      parseOrderListQuery(new URLSearchParams("q=Тест&status=PLACED&pay=FULLY_PAID&seller=u1")),
      ["o1"],
    );
    expect(phoneClauses(where)).toEqual([]);
    expect(where).toMatchObject({ status: "PLACED", paymentState: "FULLY_PAID", createdById: "u1", id: { in: ["o1"] } });
  });

  it("no q → no OR", () => {
    expect(orderListWhere(parseOrderListQuery(new URLSearchParams("")), null).OR).toBeUndefined();
  });
});

describe("orderListExtras", () => {
  it("sums loaded blocks and reports unpaid over-load and refund due", () => {
    const extras = orderListExtras({
      status: "PLACED",
      totalBlocks: 160,
      totalPrice: 4_260_000,
      confirmedPaid: 3_900_000,
      overshipAmount: 360_000,
      shipments: [{ loadedLines: { A: 100 } }, { loadedLines: { A: 68, B: 5 } }, { loadedLines: null }],
    });
    expect(extras).toEqual({ loadedBlocks: 173, deliveredWithoutTrucks: false, unpaidOverload: 360_000, refundDue: 0 });
  });

  it("a cancelled paid order owes its whole payment back and no over-load debt", () => {
    expect(
      orderListExtras({ status: "CANCELED", totalBlocks: 50, totalPrice: 1_300_000, confirmedPaid: 500_000, overshipAmount: 300_000, shipments: [] }),
    ).toEqual({ loadedBlocks: 0, deliveredWithoutTrucks: false, unpaidOverload: 0, refundDue: 500_000 });
  });
});

describe("reorderSourceProblem", () => {
  it("missing source → 422", () => {
    expect(reorderSourceProblem(null, "998901112233")).toEqual({
      status: 422,
      message: "Асл буюртма топилмади · Source order not found",
    });
  });

  it("another client's order → 422", () => {
    const p = reorderSourceProblem({ client: { phone: "998907777777" } }, "998901112233");
    expect(p?.status).toBe(422);
    expect(p?.message).toMatch(/бошқа мижоз/);
  });

  it("same client → no problem", () => {
    expect(reorderSourceProblem({ client: { phone: "998901112233" } }, "998901112233")).toBeNull();
  });
});

describe("orderCounts", () => {
  const row = (o: Partial<Parameters<typeof orderCounts>[0][number]>) => ({
    status: "PLACED",
    totalPrice: 1_000_000,
    confirmedPaid: 0,
    overshipAmount: 0,
    pendingCount: 0,
    createdById: null,
    ...o,
  });

  it("counts statuses, flags and sellers (named, busiest first)", () => {
    const counts = orderCounts(
      [
        row({ createdById: "u1" }),
        row({ createdById: "u2", status: "DELIVERED", overshipAmount: 360_000, totalPrice: 4_260_000, confirmedPaid: 3_900_000 }),
        row({ createdById: "u2", status: "CANCELED", confirmedPaid: 500_000 }),
        row({ pendingCount: 2 }),
      ],
      new Map([["u1", "Азиз"], ["u2", "Дилшод"]]),
    );
    expect(counts).toEqual({
      all: 4,
      byStatus: { PLACED: 2, IN_PRODUCTION: 0, DELIVERED: 1, CANCELED: 1 },
      flags: { debt: 1, refund: 1, unconfirmed: 1 },
      sellers: [
        { id: "u2", name: "Дилшод", count: 2 },
        { id: "u1", name: "Азиз", count: 1 },
      ],
    });
  });

  it("empty → zeros", () => {
    expect(orderCounts([], new Map())).toEqual({
      all: 0,
      byStatus: { PLACED: 0, IN_PRODUCTION: 0, DELIVERED: 0, CANCELED: 0 },
      flags: { debt: 0, refund: 0, unconfirmed: 0 },
      sellers: [],
    });
  });
});
