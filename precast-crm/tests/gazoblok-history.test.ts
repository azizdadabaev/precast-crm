import { describe, expect, it } from "vitest";
import { buildHistory, historyCounts, historyText } from "@/lib/gazoblok-history";

const N = (s: string) => s.replace(/[  ]/g, " ");
const lines = [
  { id: "A", label: "600×300×200", quantity: 2000 },
  { id: "B", label: "600×300×300", quantity: 40 },
];
const actor = { id: "u1", name: "Admin" };
let seq = 0;
const ev = (type: string, payload: unknown, message: string | null = null, at = `2026-11-10T08:${String(10 + seq++).padStart(2, "0")}:00.000Z`) => ({
  id: `e${seq}`,
  type,
  message,
  payload,
  createdAt: at,
  actor,
});
const base = { lines, payments: [], sellerName: "Дилшод" };

describe("buildHistory — new payloads", () => {
  it("a load shows each size with its count, the truck total and the running loaded / left", () => {
    const [item] = buildHistory({
      ...base,
      events: [
        ev("SHIPMENT_LOADED", {
          shipmentId: "s2", number: 2, loadedLines: { A: 400 },
          lines: [{ lineId: "A", label: "600×300×200", qty: 400 }],
          truckTotal: 400, orderedTotal: 2040, loadedTotal: 940, leftTotal: 1100, overTotal: 0, photos: 2,
        }),
      ],
    });
    expect(item.group).toBe("load");
    expect(item.title).toBe("Жўнатма 2 юкланди");
    expect(item.rows.map((r) => [r.label, N(r.value)])).toEqual([["600×300×200", "400 та"]]);
    expect(N(item.foot!.value!)).toBe("400 та");
    expect(N(item.foot!.right!)).toBe("юкланди 940 / 2 040 · қолди 1 100");
    expect(item.photos).toBe(2);
  });

  it("an over-load names the extra blocks, money and the seller", () => {
    const [item] = buildHistory({
      ...base,
      events: [
        ev("SHIPMENT_LOADED", {
          shipmentId: "s2", number: 2, loadedLines: { A: 160 }, overloadConfirmed: true, overBlocks: 80, overshipDelta: 1440000,
          lines: [{ lineId: "A", label: "600×300×200", qty: 160 }],
          truckTotal: 160, orderedTotal: 300, loadedTotal: 380, leftTotal: 0, overTotal: 80, photos: 0,
        }),
      ],
    });
    expect(item.tone).toBe("destructive");
    expect(N(item.alert!.text)).toBe("Буюртмадан ортиқ +80 та · +1 440 000 UZS — қарз, сотувчи Дилшод");
  });

  it("a correction shows before → after with the change and the truck total", () => {
    const [item] = buildHistory({
      ...base,
      events: [
        ev("SHIPMENT_CORRECTED", {
          shipmentId: "s1", number: 1, loadedLines: { A: 60 }, before: { A: 70 },
          lines: [{ lineId: "A", label: "600×300×200", qty: 60, before: 70 }],
          truckTotal: 60, truckTotalBefore: 70, orderedTotal: 100, loadedTotal: 60, leftTotal: 40, overTotal: 0, photos: 0,
        }),
      ],
    });
    expect(item.title).toBe("Жўнатма 1 тузатилди");
    expect(item.rows[0]).toMatchObject({ label: "600×300×200", before: "70", delta: "−10", deltaTone: "destructive" });
    expect(N(item.rows[0].value)).toBe("60 та");
    expect(item.foot).toMatchObject({ label: "Жўнатмада" });
    expect(N(item.foot!.right!)).toBe("юкланди 60 / 100 · қолди 40");
  });

  it("a delivery lists the truck's sizes", () => {
    const [item] = buildHistory({
      ...base,
      events: [ev("SHIPMENT_DELIVERED", { shipmentId: "s1", number: 1, lines: [{ lineId: "A", label: "600×300×200", qty: 500 }, { lineId: "B", label: "600×300×300", qty: 40 }], deliveredTotal: 540 })],
    });
    expect(item.title).toBe("Жўнатма 1 етказилди");
    expect(item.tone).toBe("success");
    expect(item.rows.map((r) => N(r.value))).toEqual(["500 та", "40 та"]);
    expect(N(item.foot!.value!)).toBe("540 та");
  });

  it("close short: loaded / ordered and not taken per size, old → new total, refund and reason", () => {
    const [item] = buildHistory({
      ...base,
      events: [
        ev("ORDER_SHORT_CLOSED", {
          reason: "Қурилиш тўхтади",
          before: { totalPrice: 1800000 }, after: { totalPrice: 1080000 },
          quantities: [{ label: "600×300×200", ordered: 100, loaded: 60 }],
          notTakenTotal: 40, refundDue: 720000,
        }),
      ],
    });
    expect(item.group).toBe("load");
    expect(item.title).toBe("Юкланганича ёпилди");
    expect(N(item.rows[0].value)).toBe("60 / 100 та");
    expect(N(item.rows[0].note!)).toBe("40 олинмади");
    expect(item.rows[1]).toMatchObject({ label: "Жами" });
    expect(N(item.rows[1].before!)).toBe("1 800 000");
    expect(N(item.rows[1].value)).toBe("1 080 000 UZS");
    expect(item.sub.map((s) => N(s.text))).toEqual(["Қайтариш керак 720 000 UZS", "Сабаб: Қурилиш тўхтади"]);
  });

  it("placement lists sizes, blocks and money", () => {
    const [item] = buildHistory({
      ...base,
      events: [ev("ORDER_PLACED", { totalPrice: 36308000, totalBlocks: 2004, lines: [{ label: "600×300×200", qty: 2000, unitPrice: 18000 }, { label: "600×300×300", qty: 4, unitPrice: 27000 }] }, "Буюртма қабул қилинди — Шерзод")],
    });
    expect(item.group).toBe("change");
    expect(item.title).toBe("Буюртма қабул қилинди");
    expect(item.rows.map((r) => N(r.value))).toEqual(["2 000 та", "4 та"]);
    expect(N(item.foot!.value!)).toBe("2 004 та");
    expect(N(item.foot!.right!)).toBe("36 308 000 UZS");
  });

  it("an edit shows each change before → after, with the size delta", () => {
    const [item] = buildHistory({
      ...base,
      events: [
        ev("ORDER_EDITED", {
          changes: [
            { field: "line", label: "600×300×300", before: "4", after: "40" },
            { field: "total", label: "Жами", before: "36 308 000", after: "37 280 000" },
          ],
        }, "600×300×300: 4 → 40 та; Жами: 36 308 000 → 37 280 000 UZS"),
      ],
    });
    expect(item.title).toBe("Буюртма таҳрирланди");
    expect(item.rows[0]).toMatchObject({ label: "600×300×300", before: "4", value: "40 та", delta: "+36", deltaTone: "success" });
    expect(item.rows[1]).toMatchObject({ label: "Жами", before: "36 308 000", value: "37 280 000 UZS" });
  });

  it("status change with a cancel reason", () => {
    const [item] = buildHistory({ ...base, events: [ev("STATUS_CHANGED", { from: "PLACED", to: "CANCELED", reason: "Бошқа жойдан олди" })] });
    expect(item.title).toBe("Ҳолат: Қабул қилинган → Бекор қилинган");
    expect(item.tone).toBe("destructive");
    expect(item.sub.map((s) => s.text)).toEqual(["Сабаб: Бошқа жойдан олди"]);
  });
});

describe("buildHistory — payments", () => {
  it("an auto-confirmed payment is ONE line; both records stay", () => {
    const items = buildHistory({
      ...base,
      events: [
        ev("PAYMENT_RECORDED", { paymentId: "p1", amount: 10000000, method: "CLICK", receipts: 1 }, null, "2026-11-10T08:56:00.000Z"),
        ev("PAYMENT_CONFIRMED", { paymentId: "p1", amount: 10000000, method: "CLICK", autoConfirmed: true }, null, "2026-11-10T08:56:00.000Z"),
      ],
    });
    expect(items).toHaveLength(1);
    expect(N(items[0].title)).toBe("Тўлов ёзилди: 10 000 000 UZS");
    expect(items[0].sub).toEqual([{ text: "Click" }, { text: "чек 1 та" }, { text: "тасдиқланди (автоматик)", tone: "success" }]);
    expect(N(historyText(items[0]))).toBe("Тўлов ёзилди: 10 000 000 UZS · Click · чек 1 та · тасдиқланди (автоматик)");
  });

  it("old placement rows without a payment id still merge (same actor, amount, second)", () => {
    const items = buildHistory({
      ...base,
      events: [
        ev("PAYMENT_RECORDED", { amount: 5000000, method: "CASH", atPlacement: true }, "Тўлов ёзилди: 5 000 000 UZS (Нақд)", "2026-11-10T08:56:00.000Z"),
        ev("PAYMENT_CONFIRMED", { paymentId: "p9", amount: 5000000, autoConfirmed: true }, "x", "2026-11-10T08:56:01.000Z"),
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0].sub.map((s) => s.text)).toEqual(["Нақд", "тасдиқланди (автоматик)"]);
  });

  it("a payment still waiting says so; manual confirm and reject name amount, method, reason", () => {
    const payments = [
      { id: "p1", amount: "180000", method: "CASH", status: "REJECTED", notes: "Пул кассага тушмаган", recordedBy: { name: "Op" }, receipts: [] },
      { id: "p2", amount: "50000", method: "PAYME", status: "PENDING_CONFIRMATION", notes: null, recordedBy: { name: "Op" }, receipts: [{}] },
      { id: "p3", amount: "70000", method: "BANK_TRANSFER", status: "CONFIRMED", notes: null, recordedBy: { name: "Op" }, receipts: [] },
    ];
    const items = buildHistory({
      ...base,
      payments,
      events: [
        ev("PAYMENT_RECORDED", { paymentId: "p2", amount: 50000 }, "Тўлов ёзилди: 50 000 UZS (PAYME)"),
        ev("PAYMENT_REJECTED", { paymentId: "p1" }, "Тўлов рад этилди"),
        ev("PAYMENT_CONFIRMED", { paymentId: "p3" }, "Тўлов тасдиқланди"),
      ],
    });
    const [conf, rej, rec] = items;
    expect(N(rec.title)).toBe("Тўлов ёзилди: 50 000 UZS");
    expect(rec.sub.map((s) => s.text)).toEqual(["Payme", "чек 1 та", "тасдиқ кутилмоқда"]);
    expect(N(rej.title)).toBe("Тўлов рад этилди: 180 000 UZS");
    expect(rej.tone).toBe("destructive");
    expect(rej.sub.map((s) => s.text)).toEqual(["Нақд", "сабаб: Пул кассага тушмаган"]);
    expect(N(conf.title)).toBe("Тўлов тасдиқланди: 70 000 UZS");
    expect(conf.sub.map((s) => s.text)).toEqual(["Банк ўтказмаси", "ёзган: Op"]);
  });

  it("a refund reads in Uzbek with its method", () => {
    const [item] = buildHistory({ ...base, events: [ev("REFUND_RECORDED", { paymentId: "r1", amount: 720000, method: "CASH" }, "Мижозга қайтарилди: 720 000 UZS (CASH)")] });
    expect(N(item.title)).toBe("Мижозга қайтарилди: 720 000 UZS");
    expect(item.sub.map((s) => s.text)).toEqual(["Нақд"]);
    expect(item.tone).toBe("warning");
  });
});

describe("buildHistory — OLD rows gain sizes without a migration", () => {
  it("old load / correction / delivery rows map line ids to labels and replay the running totals", () => {
    const items = buildHistory({
      ...base,
      lines: [{ id: "A", label: "600×300×200", quantity: 100 }, { id: "B", label: "600×300×100", quantity: 20 }],
      events: [
        ev("SHIPMENT_LOADED", { shipmentId: "s1", number: 1, loadedLines: { A: 70, B: 20 } }, "Жўнатма 1 юкланди"),
        ev("SHIPMENT_CORRECTED", { shipmentId: "s1", number: 1, loadedLines: { A: 60, B: 20 }, before: { A: 70, B: 20 } }, "Жўнатма 1 тузатилди"),
        ev("SHIPMENT_LOADED", { shipmentId: "s2", number: 2, loadedLines: { gone: 5 } }, "Жўнатма 2 юкланди"),
        ev("SHIPMENT_DELIVERED", { shipmentId: "s1", number: 1 }, "Жўнатма 1 етказилди"),
      ].reverse(), // the API sends newest first
    });
    const [deliv, load2, corr, load1] = items;
    expect(load1.rows.map((r) => [r.label, N(r.value)])).toEqual([["600×300×200", "70 та"], ["600×300×100", "20 та"]]);
    expect(N(load1.foot!.right!)).toBe("юкланди 90 / 120 · қолди 30");
    expect(corr.rows).toHaveLength(1);
    expect(corr.rows[0]).toMatchObject({ label: "600×300×200", before: "70", delta: "−10" });
    expect(N(corr.foot!.right!)).toBe("юкланди 80 / 120 · қолди 40");
    expect(load2.rows[0].label).toBe("ўчирилган ўлчам");
    expect(deliv.rows.map((r) => N(r.value))).toEqual(["60 та", "20 та"]);
    expect(N(deliv.foot!.value!)).toBe("80 та");
  });

  it("old legacy English placement + payment rows still read in Uzbek", () => {
    const items = buildHistory({
      ...base,
      events: [
        ev("ORDER_PLACED", { totalPrice: 1000, totalBlocks: 10 }, "Order placed for Алишер"),
        ev("PAYMENT_RECORDED", { amount: 1000000 }, "Payment of 1000000 recorded at placement (CASH)."),
      ],
    });
    expect(N(items[0].title)).toBe("Тўлов ёзилди: 1 000 000 UZS");
    expect(items[0].sub.map((s) => s.text)).toEqual(["Нақд"]);
    expect(items[1].title).toBe("Буюртма қабул қилинди");
    expect(N(items[1].sub.map((s) => s.text).join(" · "))).toBe("Алишер · 10 та · 1 000 UZS");
  });
});

describe("historyCounts", () => {
  it("counts every group plus comments", () => {
    const items = buildHistory({
      ...base,
      events: [
        ev("SHIPMENT_DELIVERED", { number: 1, lines: [], deliveredTotal: 0 }),
        ev("PAYMENT_REFUND_UNKNOWN", {}, "x"),
        ev("STATUS_CHANGED", { from: "PLACED", to: "IN_PRODUCTION" }),
        ev("PAYMENT_RECORDED", { amount: 1, method: "CASH" }),
      ],
    });
    expect(historyCounts(items, 2)).toEqual({ all: 6, load: 1, payment: 1, change: 2, comment: 2 });
  });
});
