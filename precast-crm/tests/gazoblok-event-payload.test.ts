import { describe, expect, it } from "vitest";
import {
  closeShortExtras,
  closeShortMessage,
  deliverExtras,
  deliverMessage,
  loadExtras,
  loadMessage,
  paymentDecisionMessage,
  paymentRecordedMessage,
  placedLines,
} from "@/lib/gazoblok-event-payload";

const N = (s: string) => s.replace(/[  ]/g, " ");

const lines = [
  { id: "A", productLabel: "600×300×200", quantity: 2000 },
  { id: "B", productLabel: "600×300×300", quantity: 40 },
];

describe("loadExtras — what a truck load writes into the history", () => {
  it("first load: sizes with counts, truck total and the running loaded / left", () => {
    const x = loadExtras({
      lines,
      otherShipments: [{ loadedLines: { A: 500, B: 40 } }],
      prevLoaded: null,
      nextLoaded: { A: 400, B: 0 },
      isCorrection: false,
      photos: 2,
    });
    expect(x).toEqual({
      lines: [{ lineId: "A", label: "600×300×200", qty: 400 }],
      truckTotal: 400,
      orderedTotal: 2040,
      loadedTotal: 940,
      leftTotal: 1100,
      overTotal: 0,
      photos: 2,
    });
    expect(N(loadMessage(2, x, false))).toBe(
      "Жўнатма 2 юкланди: 600×300×200 — 400 та (ҳаммаси 400 та). Юкланди 940 / 2 040, қолди 1 100 та.",
    );
  });

  it("over-load: names the extra blocks and money", () => {
    const x = loadExtras({
      lines: [{ id: "A", productLabel: "600×300×200", quantity: 300 }],
      otherShipments: [{ loadedLines: { A: 220 } }],
      prevLoaded: null,
      nextLoaded: { A: 160 },
      isCorrection: false,
      photos: 0,
    });
    expect(x.overTotal).toBe(80);
    expect(x.leftTotal).toBe(0);
    expect(N(loadMessage(2, x, false, { blocks: 80, amount: 1440000 }))).toBe(
      "Жўнатма 2 юкланди: 600×300×200 — 160 та (ҳаммаси 160 та). Юкланди 380 / 300, қолди 0 та. Буюртмадан ортиқ +80 та · +1 440 000 UZS.",
    );
  });

  it("correction: only the changed sizes, before → after, and the truck total before → after", () => {
    const x = loadExtras({
      lines: [{ id: "A", productLabel: "600×300×200", quantity: 100 }, { id: "B", productLabel: "600×300×100", quantity: 10 }],
      otherShipments: [],
      prevLoaded: { A: 70, B: 10 },
      nextLoaded: { A: 60, B: 10 },
      isCorrection: true,
      photos: 0,
    });
    expect(x.lines).toEqual([{ lineId: "A", label: "600×300×200", qty: 60, before: 70 }]);
    expect(x.truckTotal).toBe(70);
    expect(x.truckTotalBefore).toBe(80);
    expect(x.loadedTotal).toBe(70);
    expect(x.leftTotal).toBe(40);
    expect(N(loadMessage(1, x, true))).toBe(
      "Жўнатма 1 тузатилди: 600×300×200 70 → 60 та (−10). Ҳаммаси 80 → 70 та. Юкланди 70 / 110, қолди 40 та.",
    );
  });

  it("a size id that is not on the order keeps its id as the label", () => {
    const x = loadExtras({ lines, otherShipments: [], prevLoaded: null, nextLoaded: { ghost: 3 }, isCorrection: false, photos: 0 });
    expect(x.lines).toEqual([{ lineId: "ghost", label: "ghost", qty: 3 }]);
  });
});

describe("deliverExtras", () => {
  it("copies the truck's sizes with labels and totals them", () => {
    const x = deliverExtras(lines, { A: 500, B: 40 });
    expect(x).toEqual({
      lines: [
        { lineId: "A", label: "600×300×200", qty: 500 },
        { lineId: "B", label: "600×300×300", qty: 40 },
      ],
      deliveredTotal: 540,
    });
    expect(N(deliverMessage(1, x))).toBe("Жўнатма 1 етказилди: 600×300×200 — 500 та, 600×300×300 — 40 та (540 та).");
  });

  it("an empty truck still reads", () => {
    expect(deliverExtras(lines, null)).toEqual({ lines: [], deliveredTotal: 0 });
  });
});

describe("closeShortExtras / message", () => {
  it("not taken per size, totals and refund", () => {
    const x = closeShortExtras({
      quantities: [{ label: "600×300×200", ordered: 100, loaded: 60 }],
      totalBefore: 1800000,
      totalAfter: 1080000,
      confirmedPaid: 1800000,
    });
    expect(x).toEqual({ notTakenTotal: 40, refundDue: 720000 });
    expect(
      N(closeShortMessage({ quantities: [{ label: "600×300×200", ordered: 100, loaded: 60 }], totalBefore: 1800000, totalAfter: 1080000, refundDue: 720000, reason: "тўхтади" })),
    ).toBe("Юкланганича ёпилди: 600×300×200 — 60 / 100 та (40 та олинмади). Жами 1 800 000 → 1 080 000 UZS. Қайтариш керак 720 000 UZS. Сабаб: тўхтади");
  });

  it("no refund line when nothing is owed back", () => {
    const x = closeShortExtras({ quantities: [{ label: "A", ordered: 10, loaded: 4 }], totalBefore: 100, totalAfter: 40, confirmedPaid: 0 });
    expect(x.refundDue).toBe(0);
    expect(N(closeShortMessage({ quantities: [{ label: "A", ordered: 10, loaded: 4 }], totalBefore: 100, totalAfter: 40, refundDue: 0, reason: "x" }))).toBe(
      "Юкланганича ёпилди: A — 4 / 10 та (6 та олинмади). Жами 100 → 40 UZS. Сабаб: x",
    );
  });
});

describe("payment messages", () => {
  it("recorded: amount, method in Uzbek, receipts", () => {
    expect(N(paymentRecordedMessage({ amount: 10000000, method: "CLICK", receipts: 1 }))).toBe("Тўлов ёзилди: 10 000 000 UZS · Click · чек 1 та");
    expect(N(paymentRecordedMessage({ amount: 500.5, method: "CASH", receipts: 0 }))).toBe("Тўлов ёзилди: 500,5 UZS · Нақд");
  });

  it("confirmed / rejected: amount, method, recorder, reason", () => {
    expect(N(paymentDecisionMessage({ approve: true, amount: 10000000, method: "CLICK", recordedBy: "Admin" }))).toBe(
      "Тўлов тасдиқланди: 10 000 000 UZS · Click (ёзган: Admin)",
    );
    expect(N(paymentDecisionMessage({ approve: false, amount: 1000000, method: "CASH", recordedBy: null, reason: "Пул тушмаган" }))).toBe(
      "Тўлов рад этилди: 1 000 000 UZS · Нақд — сабаб: Пул тушмаган",
    );
    expect(N(paymentDecisionMessage({ approve: true, amount: 5, method: "CASH", recordedBy: "Op", auto: true }))).toBe(
      "Тўлов тасдиқланди (автоматик): 5 UZS · Нақд",
    );
  });
});

describe("placedLines", () => {
  it("keeps label, count and frozen price per size", () => {
    expect(placedLines([{ productLabel: "600×300×200", quantity: 100, unitPrice: 18000 }])).toEqual([
      { label: "600×300×200", qty: 100, unitPrice: 18000 },
    ]);
  });
});
