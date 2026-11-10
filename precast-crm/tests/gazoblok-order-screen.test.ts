import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/utils";
import {
  cancelBlock,
  historyLine,
  deliverBlockers,
  paymentRow,
  refundBody,
  regroupMoney,
  screenActions,
  totalTone,
} from "@/lib/gazoblok-order-screen";
import type { LineQty } from "@/lib/gazoblok-quantities";

const line = (ordered: number, loaded: number): LineQty => ({
  lineId: "A",
  productId: "pA",
  label: "600×300×200",
  ordered,
  loaded,
  left: Math.max(0, ordered - loaded),
  over: Math.max(0, loaded - ordered),
});

describe("screenActions", () => {
  const all = ["order.create", "order.edit", "inbox.access", "payment.confirm"];
  it("open order with every permission shows every action", () => {
    expect(screenActions({ status: "PLACED", shortClosedAt: null }, all)).toEqual({
      reorder: true, edit: true, pin: true, chat: true, refund: true,
    });
  });
  it("finished orders are final but can still be reordered and shared", () => {
    for (const o of [
      { status: "DELIVERED", shortClosedAt: null },
      { status: "CANCELED", shortClosedAt: null },
      { status: "IN_PRODUCTION", shortClosedAt: "2026-11-09T10:00:00Z" },
    ]) {
      const a = screenActions(o, all);
      expect(a.edit).toBe(false);
      expect(a.pin).toBe(false);
      expect(a.reorder).toBe(true);
      expect(a.chat).toBe(true);
    }
  });
  it("each action needs its own permission", () => {
    expect(screenActions({ status: "PLACED", shortClosedAt: null }, [])).toEqual({
      reorder: false, edit: false, pin: false, chat: false, refund: false,
    });
  });
});

describe("deliverBlockers lists every reason, not just the first", () => {
  it("nothing loaded, a truck on the road and money owed → three reasons", () => {
    const r = deliverBlockers({
      quantities: [line(200, 0)],
      shortClosedAt: null,
      openShipments: 1,
      remaining: 500_000,
    });
    expect(r).toHaveLength(3);
    expect(r[0]).toMatch(/юкланмаган/);
    expect(r[1]).toMatch(/жўнатмаларни/);
    expect(r[2]).toMatch(/тўланмаган/i);
  });
  it("all loaded, delivered and paid → none", () => {
    expect(deliverBlockers({ quantities: [line(200, 200)], shortClosedAt: null, openShipments: 0, remaining: 0 })).toEqual([]);
  });
  it("closed short with 168 of 200 loaded is not blocked by the 32 left", () => {
    expect(
      deliverBlockers({ quantities: [line(200, 168)], shortClosedAt: "2026-11-09", openShipments: 0, remaining: 0 }),
    ).toEqual([]);
  });
});

describe("cancelBlock", () => {
  it("refuses once anything is loaded, naming the count", () => {
    expect(cancelBlock(168)).toBe("168 та юкланган");
    expect(cancelBlock(1200)).toBe(`${formatNumber(1200, 0)} та юкланган`);
    expect(cancelBlock(0)).toBeNull();
  });
});

describe("totalTone", () => {
  it("is green only when fully paid", () => {
    expect(totalTone("FULLY_PAID")).toBe("text-success");
    expect(totalTone("PARTIALLY_PAID")).toBe("text-foreground");
    expect(totalTone("AWAITING_PAYMENT")).toBe("text-foreground");
  });
});

describe("paymentRow", () => {
  it("a negative confirmed row is a refund shown with a minus", () => {
    const r = paymentRow({ amount: "-500000.00", status: "CONFIRMED" }, "CANCELED");
    expect(r.refund).toBe(true);
    expect(r.amountText).toBe(`−${formatNumber(500000, 0)}`);
    expect(r.canApprove).toBe(false);
    expect(r.canReject).toBe(false);
  });
  it("a pending payment on a cancelled order can be rejected but never approved", () => {
    const r = paymentRow({ amount: "1000000", status: "PENDING_CONFIRMATION" }, "CANCELED");
    expect(r.refund).toBe(false);
    expect(r.canApprove).toBe(false);
    expect(r.canReject).toBe(true);
  });
  it("a pending payment on an open order can be approved", () => {
    const r = paymentRow({ amount: "1000000", status: "PENDING_CONFIRMATION" }, "PLACED");
    expect(r.amountText).toBe(formatNumber(1000000, 0));
    expect(r.canApprove).toBe(true);
  });
});

describe("refundBody", () => {
  it("sends the dialog's note as the required notes field", () => {
    expect(refundBody({ amount: 150000, method: "CASH", paidOn: "x", note: "Мижоз қайтарди" })).toEqual({
      action: "record_refund",
      amount: 150000,
      method: "CASH",
      notes: "Мижоз қайтарди",
    });
  });
});

describe("regroupMoney", () => {
  it("groups a readable sum and leaves an unreadable one as typed", () => {
    expect(regroupMoney("1500000")).toBe(formatNumber(1500000, 0));
    expect(regroupMoney("1 500 000")).toBe(formatNumber(1500000, 0));
    expect(regroupMoney("1,000")).toBe("1,000");
    expect(regroupMoney("")).toBe("");
  });
});

describe("historyLine", () => {
  it("drops the label when the message already starts with the same word", () => {
    expect(historyLine("Манзил белгиланди", "Манзил белгиланди: 41.3111, 69.2797")).toBe("Манзил белгиланди: 41.3111, 69.2797");
    expect(historyLine("Сана ўзгартирилди", "Сана: — → 20.11.2026")).toBe("Сана: — → 20.11.2026");
    expect(historyLine("Тўлов киритилди", "Тўлов ёзилди: 4 800 000 UZS")).toBe("Тўлов ёзилди: 4 800 000 UZS");
  });
  it("keeps the label before a message that does not name the event", () => {
    expect(historyLine("Буюртма таҳрирланди", "600×300×200: 200 → 250 та")).toBe("Буюртма таҳрирланди — 600×300×200: 200 → 250 та");
    expect(historyLine("Жўнатма етказилди", "")).toBe("Жўнатма етказилди");
  });
  it("names the payment method in Uzbek, not the enum", () => {
    expect(historyLine("Мижозга пул қайтарилди", "Мижозга қайтарилди: 150 000 UZS (CASH)")).toBe("Мижозга қайтарилди: 150 000 UZS (Нақд)");
    expect(historyLine("Тўлов киритилди", "Тўлов ёзилди: 1 UZS (BANK_TRANSFER)")).toBe("Тўлов ёзилди: 1 UZS (Банк ўтказмаси)");
  });
});
