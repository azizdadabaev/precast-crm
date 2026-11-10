// I1 (b–d): one money rule on screen — whole UZS; an older row's tiyin only when non-zero —
// and a sub-1 UZS remainder never reads «0 UZS».
import { describe, it, expect } from "vitest";
import { uzsText } from "@/lib/gazoblok-text";
import { nextAction, type DetailOrder } from "@/lib/gazoblok-detail";
import { buildHistory } from "@/lib/gazoblok-history";
import { paymentRow, regroupMoney } from "@/lib/gazoblok-order-screen";
import { parseMoney } from "@/lib/gazoblok-text";

const N = (s: string) => s.replace(/[  ]/g, " ");
const ALL = ["order.edit", "order.editShipped", "order.cancel", "order.create", "payment.record", "payment.confirm"];

function order(over: Partial<DetailOrder> = {}): DetailOrder {
  return {
    status: "IN_PRODUCTION",
    shortClosedAt: null,
    totalPrice: "36298738.8",
    confirmedPaid: "36298738",
    refundDue: 0,
    quantities: [{ lineId: "A", productId: null, label: "A", ordered: 10, loaded: 10, left: 0, over: 0 }],
    shipments: [{ id: "s1", number: 1, status: "DELIVERED", loadedLines: { A: 10 } }],
    payments: [{ status: "CONFIRMED", amount: "36298738" }],
    ...over,
  };
}

describe("uzsText", () => {
  it("whole sums without tiyin, fractional rows with exactly two digits", () => {
    expect(N(uzsText(36_300_000))).toBe("36 300 000");
    expect(N(uzsText(36_298_738.8))).toBe("36 298 738,80");
    expect(N(uzsText(0.4))).toBe("0,40");
    expect(N(uzsText(0.004))).toBe("0");
    expect(N(uzsText(-0))).toBe("0");
  });
});

describe("primary button never says «0 UZS» for a sub-1 remainder", () => {
  it("pay the rest shows the exact 0,80 and carries the exact amount", () => {
    const a = nextAction(order(), ALL);
    expect(a.primary).toMatchObject({ kind: "pay" });
    expect(a.primary!.amount).toBeCloseTo(0.8, 6);
    expect(N(a.primary!.label)).toBe("Тўлов қўшиш · 0,80 UZS");
  });

  it("a 0,50 refund reads 0,50", () => {
    const a = nextAction(order({ status: "DELIVERED", refundDue: 0.5 }), ALL);
    expect(N(a.primary!.label)).toBe("Пулни қайтариш · 0,50 UZS");
  });
});

describe("history and payment rows follow the same rule", () => {
  it("close short refund and totals", () => {
    const [item] = buildHistory({
      lines: [],
      payments: [],
      sellerName: null,
      events: [{
        id: "e1", type: "ORDER_SHORT_CLOSED", message: null, createdAt: "2026-11-10T08:00:00.000Z", actor: null,
        payload: { before: { totalPrice: 1800000.5 }, after: { totalPrice: 1080000.3 }, quantities: [], refundDue: 0.5 },
      }],
    });
    expect(N(item.rows.at(-1)!.value)).toBe("1 080 000,30 UZS");
    expect(N(item.rows.at(-1)!.before!)).toBe("1 800 000,50");
    expect(item.sub.map((s) => N(s.text))).toContain("Қайтариш керак 0,50 UZS");
  });

  it("a fractional payment row keeps its tiyin", () => {
    expect(N(paymentRow({ amount: "0.8", status: "CONFIRMED" }, "IN_PRODUCTION").amountText)).toBe("0,80");
    expect(N(paymentRow({ amount: "-1000.5", status: "CONFIRMED" }, "IN_PRODUCTION").amountText)).toBe("−1 000,50");
  });
});

describe("pay field regroup keeps the tiyin (pay the rest stays exact)", () => {
  it("«1000,4» → «1 000,40», read back as 1000.4", () => {
    const t = regroupMoney("1000,4");
    expect(N(t)).toBe("1 000,40");
    expect(parseMoney(t)).toBe(1000.4);
    expect(N(regroupMoney("1500000"))).toBe("1 500 000");
  });
});
