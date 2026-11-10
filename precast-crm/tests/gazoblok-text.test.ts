import { describe, expect, it } from "vitest";
import { STATUS_LABELS, eventText, placedText, statusChangeText, uzPart } from "@/lib/gazoblok-text";

describe("gazoblok text", () => {
  it("uzPart keeps the Uzbek half in uz mode", () => {
    expect(uzPart("Рухсат йўқ · Permission denied", "uz")).toBe("Рухсат йўқ");
    expect(uzPart("Рухсат йўқ · Permission denied", "bilingual")).toBe("Рухсат йўқ · Permission denied");
    expect(uzPart("Рухсат йўқ", "uz")).toBe("Рухсат йўқ");
  });

  it("STATUS_LABELS names every status in Uzbek", () => {
    expect(STATUS_LABELS.PLACED[0]).toBe("Қабул қилинган");
    expect(STATUS_LABELS.IN_PRODUCTION[0]).toBe("Ишлаб чиқилмоқда");
    expect(STATUS_LABELS.DELIVERED[0]).toBe("Етказилган");
    expect(STATUS_LABELS.CANCELED[0]).toBe("Бекор қилинган");
  });

  it("placedText and statusChangeText", () => {
    expect(placedText("Алишер", null)).toBe("Буюртма қабул қилинди — Алишер");
    expect(placedText("Алишер", "B-2026-11-0003")).toBe("Қайта буюртма (B-2026-11-0003 асосида) — Алишер");
    expect(statusChangeText("PLACED", "DELIVERED")).toBe("Ҳолат: Қабул қилинган → Етказилган");
  });

  it("eventText rebuilds a status change from the payload", () => {
    expect(
      eventText({ type: "STATUS_CHANGED", message: "Status PLACED → DELIVERED", payload: { from: "PLACED", to: "DELIVERED" } }),
    ).toBe("Ҳолат: Қабул қилинган → Етказилган");
  });

  it("eventText rebuilds an English placement message", () => {
    expect(eventText({ type: "ORDER_PLACED", message: "Order placed for Алишер", payload: { totalPrice: 1 } })).toBe(
      "Буюртма қабул қилинди — Алишер",
    );
    expect(
      eventText({ type: "ORDER_PLACED", message: "Order placed for Алишер", payload: { reorderOf: "B-2026-11-0003" } }),
    ).toBe("Қайта буюртма (B-2026-11-0003 асосида) — Алишер");
  });

  it("eventText rebuilds English payment messages with grouped amounts", () => {
    expect(
      eventText({ type: "PAYMENT_RECORDED", message: "Payment of 1000000 recorded at placement (CASH).", payload: { amount: 1000000 } }),
    ).toMatch(/^Тўлов ёзилди: 1\s000\s000 UZS$/);
    expect(
      eventText({ type: "PAYMENT_CONFIRMED", message: "Payment abc123 auto-confirmed (recorder has confirm rights): 1000000", payload: { amount: 1000000 } }),
    ).toMatch(/^Тўлов тасдиқланди: 1\s000\s000 UZS$/);
  });

  it("eventText keeps a message that is already Uzbek", () => {
    const m = "Тўлов ёзилди: 500 000 UZS (CLICK)";
    expect(eventText({ type: "PAYMENT_RECORDED", message: m, payload: { amount: 500000 } })).toBe(m);
    expect(eventText({ type: "NOTE", message: "Изоҳ", payload: null })).toBe("Изоҳ");
    expect(eventText({ type: "NOTE", message: null, payload: null })).toBe("");
  });
});
