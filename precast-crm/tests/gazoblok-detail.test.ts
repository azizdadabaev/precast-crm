import { describe, expect, it } from "vitest";
import {
  dotDate,
  dotDateTime,
  isAutoConfirmed,
  loadPill,
  loadSummary,
  nextAction,
  paymentPill,
  pickTruckForLoad,
  weekdayUz,
  type DetailOrder,
} from "@/lib/gazoblok-detail";

const N = (s: string) => s.replace(/[  ]/g, " ");
const ALL = ["order.edit", "order.editShipped", "order.cancel", "order.create", "payment.record", "payment.confirm"];

const q = (lineId: string, ordered: number, loaded: number) => ({
  lineId, productId: null, label: lineId, ordered, loaded, left: Math.max(0, ordered - loaded), over: Math.max(0, loaded - ordered),
});

function order(over: Partial<DetailOrder> = {}): DetailOrder {
  return {
    status: "IN_PRODUCTION",
    shortClosedAt: null,
    totalPrice: "37280000",
    confirmedPaid: "10000000",
    refundDue: 0,
    quantities: [q("A", 2000, 900), q("B", 40, 40)],
    shipments: [
      { id: "s1", number: 1, status: "DELIVERED", loadedLines: { A: 500, B: 40 } },
      { id: "s2", number: 2, status: "LOADED", loadedLines: { A: 400 } },
    ],
    payments: [{ status: "CONFIRMED", amount: "10000000" }],
    ...over,
  };
}

describe("dates read in Uzbek digits, never Russian month names", () => {
  it("dd.mm.yyyy and dd.mm.yyyy HH:MM, weekday in Uzbek", () => {
    const d = new Date(2026, 10, 10, 18, 56);
    expect(dotDate(d)).toBe("10.11.2026");
    expect(dotDateTime(d)).toBe("10.11.2026 18:56");
    expect(weekdayUz(d)).toBe("сешанба");
    expect(dotDate("nonsense")).toBe("—");
  });
});

describe("loadSummary — ordered / loaded / delivered / on the road / left / over", () => {
  it("per size and in total, delivered from DELIVERED trucks only", () => {
    const s = loadSummary(order().quantities, order().shipments);
    expect(s.rows.map((r) => [r.lineId, r.ordered, r.loaded, r.delivered, r.onRoad, r.left, r.over])).toEqual([
      ["A", 2000, 900, 500, 400, 1100, 0],
      ["B", 40, 40, 40, 0, 0, 0],
    ]);
    expect(s.total).toMatchObject({ ordered: 2040, loaded: 940, delivered: 540, onRoad: 400, left: 1100, over: 0 });
    expect(s.trucks).toBe(2);
  });

  it("over-load: bar = delivered (inside the order) + over in red", () => {
    const s = loadSummary([q("A", 300, 380)], [
      { id: "s1", number: 1, status: "DELIVERED", loadedLines: { A: 220 } },
      { id: "s2", number: 2, status: "DELIVERED", loadedLines: { A: 160 } },
    ]);
    expect(s.total).toMatchObject({ delivered: 380, onRoad: 0, left: 0, over: 80 });
    const b = s.total.bar;
    expect(b.delivered + b.onRoad + b.left + b.over).toBeCloseTo(100);
    expect(b.over).toBeCloseTo((80 / 380) * 100);
    expect(b.delivered).toBeCloseTo((300 / 380) * 100);
  });

  it("empty order bar is all left", () => {
    const s = loadSummary([q("A", 10, 0)], []);
    expect(s.total.bar).toEqual({ delivered: 0, onRoad: 0, left: 100, over: 0 });
    expect(s.trucks).toBe(0);
  });
});

describe("nextAction — ONE primary button, first match wins", () => {
  it("1. cancelled → no primary", () => {
    const a = nextAction(order({ status: "CANCELED" }), ALL);
    expect(a.primary).toBeNull();
    expect(a.blockers).toEqual([]);
  });

  it("2. refund owed and the user can confirm → refund", () => {
    const a = nextAction(order({ status: "DELIVERED", refundDue: 720000 }), ALL);
    expect(a.primary).toMatchObject({ kind: "refund", amount: 720000 });
    expect(N(a.primary!.label)).toBe("Пулни қайтариш · 720 000 UZS");
  });

  it("3. open with blocks left → load", () => {
    const a = nextAction(order(), ALL);
    expect(a.primary).toMatchObject({ kind: "load" });
    expect(N(a.primary!.label)).toBe("Жўнатма юклаш · 1 100 та қолди");
    expect(a.blockers.map(N)).toEqual(["1 100 та юкланмаган", "1 та жўнатма йўлда — етказилмаган", "27 280 000 UZS тўланмаган"]);
  });

  it("4. all loaded, a truck on the road → deliver that truck", () => {
    const a = nextAction(order({ quantities: [q("A", 900, 900), q("B", 40, 40)] }), ALL);
    expect(a.primary).toMatchObject({ kind: "deliverTruck", shipmentId: "s2" });
    expect(a.primary!.label).toBe("Жўнатма 2 етказилди");
  });

  it("5. money owed → add payment with the payable amount", () => {
    const a = nextAction(
      order({ quantities: [q("A", 900, 900)], shipments: [{ id: "s1", number: 1, status: "DELIVERED", loadedLines: { A: 900 } }] }),
      ALL,
    );
    expect(a.primary).toMatchObject({ kind: "pay", amount: 27280000 });
    expect(N(a.primary!.label)).toBe("Тўлов қўшиш · 27 280 000 UZS");
  });

  it("6. only a pending payment covers the rest → confirm it", () => {
    const a = nextAction(
      order({
        quantities: [q("A", 900, 900)],
        shipments: [{ id: "s1", number: 1, status: "DELIVERED", loadedLines: { A: 900 } }],
        payments: [{ status: "CONFIRMED", amount: "10000000" }, { id: "p2", status: "PENDING_CONFIRMATION", amount: "27280000" }],
      }),
      ALL,
    );
    expect(a.primary).toMatchObject({ kind: "confirmPayment", paymentId: "p2" });
  });

  it("7. everything done → close as delivered; 8. delivered → reorder", () => {
    const done = order({
      confirmedPaid: "37280000",
      quantities: [q("A", 900, 900)],
      shipments: [{ id: "s1", number: 1, status: "DELIVERED", loadedLines: { A: 900 } }],
    });
    expect(nextAction(done, ALL).primary).toMatchObject({ kind: "markDelivered", label: "Етказилди деб ёпиш" });
    expect(nextAction(done, ALL).blockers).toEqual([]);
    expect(nextAction({ ...done, status: "DELIVERED" }, ALL).primary).toMatchObject({ kind: "reorder", label: "Қайта буюртма" });
  });

  it("closed short with the money settled → close as delivered, nothing left to load", () => {
    const a = nextAction(
      order({
        shortClosedAt: "2026-11-09T10:00:00Z",
        confirmedPaid: "37280000",
        quantities: [q("A", 2000, 900)],
        shipments: [{ id: "s1", number: 1, status: "DELIVERED", loadedLines: { A: 900 } }],
      }),
      ALL,
    );
    expect(a.primary?.kind).toBe("markDelivered");
  });

  it("without permissions the rule skips to what the user can do", () => {
    const a = nextAction(order(), ["payment.record"]);
    expect(a.primary).toMatchObject({ kind: "pay" });
    expect(nextAction(order(), []).primary).toBeNull();
  });

  it("secondary actions: production, close short, cancel as a sentence once loaded", () => {
    const placed = nextAction(order({ status: "PLACED" }), ALL).secondary;
    expect(placed).toMatchObject({ production: true, closeShort: true, cancel: "blocked", markDelivered: "later" });
    const fresh = nextAction(order({ status: "PLACED", quantities: [q("A", 10, 0)], shipments: [] }), ALL).secondary;
    expect(fresh).toMatchObject({ production: true, closeShort: false, cancel: "allowed" });
    const noCancel = nextAction(order({ status: "PLACED", quantities: [q("A", 10, 0)], shipments: [] }), ["order.edit"]).secondary;
    expect(noCancel.cancel).toBe("hidden");
  });

  it("an empty truck counts as a blocker in words", () => {
    const a = nextAction(
      order({
        confirmedPaid: "37280000",
        quantities: [q("A", 900, 900)],
        shipments: [
          { id: "s1", number: 1, status: "DELIVERED", loadedLines: { A: 900 } },
          { id: "s3", number: 3, status: "PENDING", loadedLines: null },
        ],
      }),
      ALL,
    );
    expect(a.blockers).toEqual(["1 та жўнатма бўш — юкланг ёки ўчиринг"]);
  });
});

describe("pills", () => {
  it("load pill: nothing / partly / all / over / closed short", () => {
    expect(loadPill(order({ quantities: [q("A", 10, 0)] }))).toMatchObject({ text: "Юкланмаган", tone: "muted" });
    expect(N(loadPill(order())!.text)).toBe("Юкланди 940 / 2 040");
    expect(loadPill(order())!.tone).toBe("primary");
    expect(loadPill(order({ quantities: [q("A", 10, 10)] }))).toMatchObject({ text: "Ҳаммаси юкланди", tone: "success" });
    expect(loadPill(order({ quantities: [q("A", 300, 380)] }))).toMatchObject({ text: "Ортиқча юкланди +80", tone: "destructive" });
    expect(loadPill(order({ shortClosedAt: "x" }))).toMatchObject({ text: "Юкланганича ёпилган", tone: "warning" });
    expect(loadPill(order({ status: "CANCELED" }))).toBeNull();
  });

  it("payment pill: refund owed first, then state", () => {
    expect(paymentPill({ status: "DELIVERED", refundDue: 5, paymentState: "FULLY_PAID" })).toMatchObject({ text: "Қайтариш керак", tone: "warning" });
    expect(paymentPill({ status: "PLACED", refundDue: 0, paymentState: "PARTIALLY_PAID" })).toMatchObject({ text: "Қисман тўланган", tone: "primary" });
    expect(paymentPill({ status: "PLACED", refundDue: 0, paymentState: "FULLY_PAID" })).toMatchObject({ text: "Тўлиқ тўланган", tone: "success" });
    expect(paymentPill({ status: "PLACED", refundDue: 0, paymentState: "AWAITING_PAYMENT" })).toMatchObject({ text: "Тўлов кутилмоқда", tone: "muted" });
    expect(paymentPill({ status: "CANCELED", refundDue: 0, paymentState: "AWAITING_PAYMENT" })).toBeNull();
  });
});

describe("one-step loading", () => {
  it("reuses the lowest empty truck, else asks for a new one", () => {
    expect(pickTruckForLoad([{ id: "s3", number: 3, status: "PENDING" }, { id: "s2", number: 2, status: "PENDING" }, { id: "s1", number: 1, status: "LOADED" }])).toBe("s2");
    expect(pickTruckForLoad([{ id: "s1", number: 1, status: "LOADED" }])).toBeNull();
  });
});

describe("isAutoConfirmed", () => {
  it("same person confirmed within seconds of recording", () => {
    expect(isAutoConfirmed({ status: "CONFIRMED", recordedById: "u", confirmedById: "u", recordedAt: "2026-11-10T08:56:00Z", confirmedAt: "2026-11-10T08:56:01Z" })).toBe(true);
    expect(isAutoConfirmed({ status: "CONFIRMED", recordedById: "u", confirmedById: "v", recordedAt: "2026-11-10T08:56:00Z", confirmedAt: "2026-11-10T08:56:01Z" })).toBe(false);
    expect(isAutoConfirmed({ status: "PENDING_CONFIRMATION", recordedById: "u", confirmedById: null, recordedAt: "x", confirmedAt: null })).toBe(false);
  });
});
