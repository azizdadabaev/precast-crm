import { describe, it, expect } from "vitest";
import {
  placedNotice,
  paymentPendingNotice,
  paymentDecisionNotice,
  recipients,
} from "@/lib/gazoblok-notify";
import { formatNumber } from "@/lib/utils";

const order = { id: "gz1", orderNumber: "B-2026-11-0012" };

describe("gazoblok-notify", () => {
  it("placedNotice: bilingual title, client name body, ORDER_PLACED", () => {
    const n = placedNotice({ ...order, clientName: "Акмал Каримов" });
    expect(n.title).toBe("Янги газоблок буюртма №B-2026-11-0012 · New gazoblok order #B-2026-11-0012");
    expect(n.body).toBe("Акмал Каримов");
    expect(n.type).toBe("ORDER_PLACED");
  });

  it("paymentPendingNotice: amount formatted with UZS, method label as body", () => {
    const n = paymentPendingNotice(order, { id: "p1", amount: 1500000, method: "CLICK" });
    expect(n.type).toBe("PAYMENT_RECORDED");
    expect(n.title).toContain(formatNumber(1500000, 0));
    expect(n.title).toContain("UZS");
    expect(n.title).toContain("№B-2026-11-0012");
    expect(n.body).toBe("Click");
    expect(n.paymentId).toBe("p1");
  });

  it("paymentPendingNotice: Cyrillic method label for cash", () => {
    const n = paymentPendingNotice(order, { id: "p1", amount: 100, method: "CASH" });
    expect(n.body).toContain("Нақд");
  });

  it("paymentDecisionNotice: confirmed vs rejected types and titles", () => {
    const yes = paymentDecisionNotice(order, { id: "p1", amount: 250000 }, true);
    const no = paymentDecisionNotice(order, { id: "p1", amount: 250000 }, false);
    expect(yes.type).toBe("PAYMENT_CONFIRMED");
    expect(no.type).toBe("PAYMENT_REJECTED");
    expect(yes.title).toContain("Газоблок тўловингиз тасдиқланди");
    expect(no.title).toContain("Газоблок тўловингиз рад этилди");
    expect(no.title).toContain(`${formatNumber(250000, 0)} UZS`);
    expect(no.paymentId).toBe("p1");
  });

  it("notices never set orderId", () => {
    const all = [
      placedNotice({ ...order, clientName: "X" }),
      paymentPendingNotice(order, { id: "p1", amount: 1, method: "CASH" }),
      paymentDecisionNotice(order, { id: "p1", amount: 1 }, true),
      paymentDecisionNotice(order, { id: "p1", amount: 1 }, false),
    ];
    for (const n of all) {
      expect(n.orderId).toBeUndefined();
      expect(n.gazoblokOrderId).toBe(order.id);
    }
  });

  it("recipients drops the actor and de-duplicates", () => {
    expect(recipients(["a", "b", "a"], "a")).toEqual(["b"]);
    expect(recipients(["b", "c", "b"], "a")).toEqual(["b", "c"]);
  });
});
