import { describe, it, expect } from "vitest";
import {
  parseQty,
  groupDigits,
  stepQty,
  moneyText,
  placementKey,
  formLines,
  badQtyIds,
  addPerSize,
  qtyFromLines,
  discountInput,
  paymentPreview,
  orderProblems,
  dateQuickPicks,
  formatYmd,
  parseDmy,
  weekdayUz,
  scheduledAtIso,
  exactPhoneMatch,
  phoneLooksComplete,
  stockTone,
  type ProblemInput,
} from "@/lib/gazoblok-order-form";

const catalog = [
  { id: "a", label: "600×300×200", pricePerBlock: 18000 },
  { id: "b", label: "600×300×100", pricePerBlock: 9500 },
  { id: "c", label: "600×300×150", pricePerBlock: 13500 },
];

describe("parseQty", () => {
  it("reads blank as 0 and grouped digits", () => {
    expect(parseQty("")).toBe(0);
    expect(parseQty("  ")).toBe(0);
    expect(parseQty("1554")).toBe(1554);
    expect(parseQty("1 554")).toBe(1554);
    expect(parseQty("1 554")).toBe(1554);
    expect(parseQty("12 000 000")).toBe(12000000);
  });
  it("refuses decimals, negatives, commas and words", () => {
    for (const s of ["1,5", "1.5", "-3", "1,554", "abc", "1 55", "15 54"]) expect(parseQty(s)).toBeNull();
  });
});

describe("groupDigits / stepQty", () => {
  it("groups thousands with a plain space", () => {
    expect(groupDigits(0)).toBe("0");
    expect(groupDigits(1554)).toBe("1 554");
    expect(groupDigits(1234567)).toBe("1 234 567");
  });
  it("steps from the typed value and never goes below 0", () => {
    expect(stepQty("", 1)).toBe("1");
    expect(stepQty("1 554", 1)).toBe("1 555");
    expect(stepQty("1", -1)).toBe("");
    expect(stepQty("", -1)).toBe("");
    expect(stepQty("abc", 1)).toBe("1");
  });
});

describe("moneyText", () => {
  it("writes a sum parseMoney reads back", () => {
    expect(moneyText(28006400)).toBe("28 006 400");
    expect(moneyText(1000.5)).toBe("1 000,50");
    expect(moneyText(0)).toBe("0");
  });
});

describe("formLines", () => {
  it("keeps catalog order and only sizes with a quantity", () => {
    const lines = formLines(catalog, { c: "10", a: "1 554", b: "" });
    expect(lines).toEqual([
      { productId: "a", productLabel: "600×300×200", unitPrice: 18000, quantity: 1554 },
      { productId: "c", productLabel: "600×300×150", unitPrice: 13500, quantity: 10 },
    ]);
  });
  it("skips unreadable quantities and lists them", () => {
    const qty = { a: "1,5", b: "3" };
    expect(formLines(catalog, qty).map((l) => l.productId)).toEqual(["b"]);
    expect(badQtyIds(catalog, qty)).toEqual(["a"]);
  });
  it("ignores quantities for sizes not in the active catalog", () => {
    expect(formLines(catalog, { zzz: "5" })).toEqual([]);
    expect(badQtyIds(catalog, { zzz: "x" })).toEqual([]);
  });
});

describe("addPerSize (wall calculator → grid)", () => {
  it("adds estimated blocks onto the typed quantities", () => {
    const next = addPerSize({ a: "100" }, [
      { productId: "a", blocksNeeded: 1454 },
      { productId: "b", blocksNeeded: 20 },
      { productId: "c", blocksNeeded: 0 },
    ], new Set(["a", "b", "c"]));
    expect(next).toEqual({ a: "1 554", b: "20" });
  });
  it("drops sizes that are not active and treats a bad typed value as 0", () => {
    expect(addPerSize({ a: "x" }, [{ productId: "a", blocksNeeded: 5 }, { productId: "z", blocksNeeded: 9 }], new Set(["a"]))).toEqual({ a: "5" });
  });
});

describe("qtyFromLines (reorder prefill)", () => {
  it("one entry per size, quantities summed", () => {
    expect(qtyFromLines([
      { productId: "a", quantity: 100 },
      { productId: "b", quantity: 1200 },
      { productId: "a", quantity: 5 },
    ])).toEqual({ a: "105", b: "1 200" });
  });
});

describe("discountInput", () => {
  it("blank sends nothing", () => {
    expect(discountInput("percent", "")).toEqual({});
    expect(discountInput("amount", " ")).toEqual({});
  });
  it("percent reads a decimal comma, 0–100 only", () => {
    expect(discountInput("percent", "7,5")).toEqual({ discountPercent: 7.5 });
    expect(discountInput("percent", "5")).toEqual({ discountPercent: 5 });
    expect(discountInput("percent", "101")).toBeNull();
    expect(discountInput("percent", "7.5.5")).toBeNull();
  });
  it("amount is money: «1 000 000» yes, «1,000» no", () => {
    expect(discountInput("amount", "1 000 000")).toEqual({ discountAmount: 1000000 });
    expect(discountInput("amount", "1,000")).toBeNull();
  });
});

describe("paymentPreview", () => {
  it("nothing paid → awaiting, debt is the total", () => {
    expect(paymentPreview({ paid: 0, total: 1000, canConfirm: true })).toEqual({ state: "AWAITING_PAYMENT", payment: "none", debt: 1000 });
  });
  it("a confirmer's payment lands confirmed and moves the state", () => {
    expect(paymentPreview({ paid: 400, total: 1000, canConfirm: true })).toEqual({ state: "PARTIALLY_PAID", payment: "confirmed", debt: 600 });
    expect(paymentPreview({ paid: 1000, total: 1000, canConfirm: true })).toEqual({ state: "FULLY_PAID", payment: "confirmed", debt: 0 });
  });
  it("an operator's payment waits for confirmation; the order stays awaiting", () => {
    expect(paymentPreview({ paid: 400, total: 1000, canConfirm: false })).toEqual({ state: "AWAITING_PAYMENT", payment: "pending", debt: 600 });
  });
  it("more than the total is an over-payment", () => {
    expect(paymentPreview({ paid: 1001, total: 1000, canConfirm: true })).toEqual({ state: "OVERPAID", payment: "confirmed", debt: 0 });
  });
});

describe("orderProblems", () => {
  const ok: ProblemInput = {
    phone: "90 111 22 33", name: "Али", nameDecisionNeeded: false, lineCount: 1, badQty: false,
    dateBad: false, deliveryBad: false, discountBad: false, paidBad: false, paid: 0, total: 1000, methodChosen: false,
  };
  it("a complete form has no problems", () => {
    expect(orderProblems(ok)).toEqual([]);
  });
  it("lists missing items in screen order", () => {
    const p = orderProblems({ ...ok, phone: " ", name: "", nameDecisionNeeded: true, lineCount: 0 });
    expect(p.map((x) => x.key)).toEqual(["phone", "name", "nameDecision", "lines"]);
    expect(p.every((x) => x.kind === "missing")).toBe(true);
    expect(p[0].uz).toBe("Телефон рақами");
  });
  it("lists errors: unreadable numbers, over-payment, missing method", () => {
    const p = orderProblems({ ...ok, badQty: true, dateBad: true, deliveryBad: true, discountBad: true, paid: 2000, methodChosen: false });
    expect(p.map((x) => x.key)).toEqual(["qty", "date", "delivery", "discount", "paidOverTotal", "method"]);
    expect(p.every((x) => x.kind === "error")).toBe(true);
  });
  it("an unreadable paid amount is one error, not a method or over-total error", () => {
    expect(orderProblems({ ...ok, paidBad: true, paid: 0 }).map((x) => x.key)).toEqual(["paid"]);
  });
  it("a chosen method with a payment is fine", () => {
    expect(orderProblems({ ...ok, paid: 500, methodChosen: true })).toEqual([]);
  });
});

describe("dates", () => {
  it("quick picks are today, tomorrow and the day after in local time", () => {
    const picks = dateQuickPicks(new Date(2026, 10, 30, 23, 30));
    expect(picks).toEqual([
      { key: "today", ymd: "2026-11-30", short: "30.11" },
      { key: "tomorrow", ymd: "2026-12-01", short: "01.12" },
      { key: "after", ymd: "2026-12-02", short: "02.12" },
    ]);
  });
  it("formats and parses dd.mm.yyyy", () => {
    expect(formatYmd("2026-11-11")).toBe("11.11.2026");
    expect(parseDmy("11.11.2026")).toBe("2026-11-11");
    expect(parseDmy("1.2.2027")).toBe("2027-02-01");
    expect(parseDmy("31.02.2026")).toBeNull();
    expect(parseDmy("2026-11-11")).toBeNull();
    expect(parseDmy("")).toBeNull();
  });
  it("names the weekday in Uzbek", () => {
    expect(weekdayUz("2026-11-10")).toBe("сешанба");
    expect(weekdayUz("2026-11-15")).toBe("якшанба");
  });
  it("sends the date as UTC midnight, as the old form did", () => {
    expect(scheduledAtIso("2026-11-11")).toBe(new Date("2026-11-11").toISOString());
  });
});

describe("client lookup", () => {
  const rows = [
    { id: "1", name: "Тест", phone: "998975570452" },
    { id: "2", name: "Бошқа", phone: "998975570453" },
  ];
  it("matches only the same normalized phone", () => {
    expect(exactPhoneMatch("+998 97 557 04 52", rows)?.id).toBe("1");
    expect(exactPhoneMatch("97 557 04 52", rows)?.id).toBe("1");
    expect(exactPhoneMatch("97 557 04", rows)).toBeNull();
    expect(exactPhoneMatch("", rows)).toBeNull();
  });
  it("a phone is worth looking up from 9 digits", () => {
    expect(phoneLooksComplete("97 557 04 5")).toBe(false);
    expect(phoneLooksComplete("97 557 04 52")).toBe(true);
  });
});

describe("stockTone", () => {
  it("none at 0 or no stock row, low under the threshold", () => {
    expect(stockTone(null, 50)).toBe("none");
    expect(stockTone(0, 50)).toBe("none");
    expect(stockTone(49, 50)).toBe("low");
    expect(stockTone(50, 50)).toBe("ok");
  });
});

describe("placementKey (I3)", () => {
  let n = 0;
  const fresh = () => `k${++n}`;
  it("the same form body keeps its key (a network retry); any change gets a new one", () => {
    const a = placementKey(null, '{"q":1}', fresh);
    expect(placementKey(a, '{"q":1}', fresh)).toBe(a);
    const b = placementKey(a, '{"q":2}', fresh);
    expect(b.key).not.toBe(a.key);
    expect(b.body).toBe('{"q":2}');
  });
});
