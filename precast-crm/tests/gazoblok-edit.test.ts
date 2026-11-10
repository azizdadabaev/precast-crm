import { describe, it, expect } from "vitest";
import { editScope, editPolicy, editPlan, orderVolumeM3, changesText, discountPercentToSend, percentFieldText, type EditChange } from "@/lib/gazoblok-edit";
import type { GazoblokEditOrderInput } from "@/lib/gazoblok-validation";
import { refundDue } from "@/lib/overpayment";
import { paymentStateFor, remainingBalance } from "@/lib/payment-state";

// Fixture A: 600×300×200 ordered 200 @ 18 000, 168 loaded; delivery 300 000; no discount.
const dims = { lengthM: 0.6, heightM: 0.3, thicknessM: 0.2 };
const products = [
  { id: "pA", label: "600×300×200", pricePerBlock: 20000, active: true, ...dims },
  { id: "pB", label: "600×300×300", pricePerBlock: 25000, active: true, ...dims, thicknessM: 0.3 },
  { id: "pC", label: "600×300×100", pricePerBlock: 9000, active: false, ...dims, thicknessM: 0.1 },
];
const lineA = { id: "A", productId: "pA", productLabel: "600×300×200", quantity: 200, unitPrice: 18000 };
const baseOrder = {
  linesSubtotal: 3600000,
  discountPercent: 0,
  discountAmount: 0,
  deliveryCost: 300000,
  overshipAmount: 0,
  totalPrice: 3900000,
  scheduledAt: new Date(2026, 10, 12) as Date | null,
  notes: null as string | null,
};

function plan(edit: GazoblokEditOrderInput, opts: { order?: Partial<typeof baseOrder>; loaded?: number; lines?: (typeof lineA)[] } = {}) {
  return editPlan({
    order: { ...baseOrder, ...opts.order },
    lines: opts.lines ?? [lineA],
    shipments: [{ loadedLines: { A: opts.loaded ?? 168 } }],
    products,
    edit,
  });
}

function ok(r: ReturnType<typeof editPlan>) {
  if ("problem" in r) throw new Error(`unexpected problem: ${r.problem.message}`);
  return r;
}
function problem(r: ReturnType<typeof editPlan>) {
  if (!("problem" in r)) throw new Error("expected a problem");
  return r.problem;
}

describe("editScope", () => {
  it("lines, discount or delivery are money; date and notes alone a reschedule", () => {
    expect(editScope({ scheduledAt: null })).toBe("schedule");
    expect(editScope({ notes: "x" })).toBe("schedule");
    expect(editScope({ deliveryCost: 1 })).toBe("money");
    expect(editScope({ discountPercent: 5 })).toBe("money");
    expect(editScope({ discountAmount: 5 })).toBe("money");
    expect(editScope({ lines: [{ productId: "pA", quantity: 1 }], scheduledAt: null })).toBe("money");
    expect(editScope({} as GazoblokEditOrderInput)).toBe("none");
  });
});

describe("editPolicy", () => {
  const open = { status: "PLACED", shortClosedAt: null, totalLoaded: 168 };
  it("editPolicy splits reschedule from money edits", () => {
    expect(editPolicy(open, "schedule", { edit: true, editShipped: false })).toBeNull();
    const r = editPolicy(open, "money", { edit: true, editShipped: false });
    expect(r?.status).toBe(403);
    expect(r?.message).toMatch(/эгаси/);
    expect(editPolicy(open, "money", { edit: true, editShipped: true })).toBeNull();
    expect(editPolicy({ ...open, status: "DELIVERED" }, "schedule", { edit: true, editShipped: true })?.status).toBe(409);
    expect(editPolicy({ ...open, status: "CANCELED" }, "schedule", { edit: true, editShipped: true })?.status).toBe(409);
    expect(editPolicy({ ...open, shortClosedAt: new Date() }, "schedule", { edit: true, editShipped: true })?.status).toBe(409);
  });

  it("needs order.edit for any change; money edits before loading need only order.edit", () => {
    expect(editPolicy(open, "schedule", { edit: false, editShipped: true })?.status).toBe(403);
    expect(editPolicy({ ...open, totalLoaded: 0 }, "money", { edit: true, editShipped: false })).toBeNull();
  });

  it("a price change (discount) after loading requires order.editShipped", () => {
    const scope = editScope({ discountPercent: 10 });
    expect(editPolicy(open, scope, { edit: true, editShipped: false })?.status).toBe(403);
    expect(editPolicy(open, scope, { edit: true, editShipped: true })).toBeNull();
  });
});

describe("editPlan", () => {
  it("editPlan refuses below loaded", () => {
    const p = problem(plan({ lines: [{ lineId: "A", productId: "pA", quantity: 150 }] }));
    expect(p.status).toBe(409);
    expect(p.message).toContain("168");
    expect(p.message).toContain("150");
    expect(p.message).toContain("600×300×200");
    // omitting a loaded line = removing it → same refusal
    const q = problem(plan({ lines: [{ productId: "pB", quantity: 10 }] }));
    expect(q.status).toBe(409);
    expect(q.message).toContain("168");
  });

  it("lowers a quantity to exactly the loaded count", () => {
    const r = ok(plan({ lines: [{ lineId: "A", productId: "pA", quantity: 168 }] }));
    expect(r.lineOps.update).toEqual([{ id: "A", quantity: 168, lineTotal: 3024000 }]);
    expect(r.totals).toMatchObject({ linesSubtotal: 3024000, overshipAmount: 0, totalPrice: 3324000, totalBlocks: 168 });
  });

  it("editPlan raises a line at its frozen price", () => {
    const r = ok(plan({ lines: [{ lineId: "A", productId: "pA", quantity: 250 }] }));
    expect(r.lineOps.update).toEqual([{ id: "A", quantity: 250, lineTotal: 4500000 }]);
    expect(r.lineOps.create).toEqual([]);
    expect(r.lineOps.remove).toEqual([]);
    expect(r.totals.linesSubtotal).toBe(4500000);
    expect(r.totals.totalPrice).toBe(4800000);
    expect(r.changes).toContainEqual(expect.objectContaining({ field: "line", before: "200", after: "250" }));
    expect(r.changes).toContainEqual(expect.objectContaining({ field: "total" }));
  });

  it("matches an existing line by product when lineId is omitted", () => {
    const r = ok(plan({ lines: [{ productId: "pA", quantity: 250 }] }));
    expect(r.lineOps.update).toEqual([{ id: "A", quantity: 250, lineTotal: 4500000 }]);
    expect(r.lineOps.create).toEqual([]);
  });

  it("editPlan adds a new size at today's price", () => {
    const r = ok(plan({ lines: [{ lineId: "A", productId: "pA", quantity: 200 }, { productId: "pB", quantity: 10 }] }));
    expect(r.lineOps.create).toEqual([{ productId: "pB", productLabel: "600×300×300", unitPrice: 25000, quantity: 10, lineTotal: 250000 }]);
    expect(r.lineOps.update).toEqual([]);
    expect(r.totals).toMatchObject({ linesSubtotal: 3850000, totalPrice: 4150000, totalBlocks: 210 });
    expect(r.changes).toContainEqual(expect.objectContaining({ field: "lineAdded", label: "600×300×300", after: "10" }));

    const bad = problem(plan({ lines: [{ lineId: "A", productId: "pA", quantity: 200 }, { productId: "pC", quantity: 10 }] }));
    expect(bad.status).toBe(422);
    expect(problem(plan({ lines: [{ lineId: "A", productId: "pA", quantity: 200 }, { productId: "nope", quantity: 1 }] })).status).toBe(422);
  });

  it("refuses the same size twice", () => {
    const p = problem(plan({ lines: [{ lineId: "A", productId: "pA", quantity: 200 }, { productId: "pA", quantity: 5 }] }));
    expect(p.status).toBe(422);
    expect(p.message).toMatch(/икки марта/);
  });

  it("refuses an unknown line id or a product swap on an existing line", () => {
    expect(problem(plan({ lines: [{ lineId: "ghost", productId: "pA", quantity: 200 }] })).status).toBe(422);
    expect(problem(plan({ lines: [{ lineId: "A", productId: "pB", quantity: 200 }] })).status).toBe(422);
  });

  it("removes a line nothing was loaded from", () => {
    const lineB = { id: "B", productId: "pB", productLabel: "600×300×300", quantity: 10, unitPrice: 24000 };
    const r = ok(
      plan(
        { lines: [{ lineId: "A", productId: "pA", quantity: 200 }] },
        { lines: [lineA, lineB], order: { linesSubtotal: 3840000, totalPrice: 4140000 } },
      ),
    );
    expect(r.lineOps.remove).toEqual(["B"]);
    expect(r.totals.linesSubtotal).toBe(3600000);
    expect(r.totals.totalPrice).toBe(3900000);
    expect(r.changes).toContainEqual(expect.objectContaining({ field: "lineRemoved", label: "600×300×300", before: "10" }));
  });

  it("editPlan absorbs an over-load", () => {
    const order = { overshipAmount: 360000, totalPrice: 4260000 };
    const r = ok(plan({ lines: [{ lineId: "A", productId: "pA", quantity: 220 }] }, { loaded: 220, order }));
    expect(r.totals.overshipAmount).toBe(0);
    expect(r.totals.linesSubtotal).toBe(3960000);
    expect(r.totals.totalPrice).toBe(3960000 + 300000);
    expect(r.changes).toContainEqual(expect.objectContaining({ field: "overship" }));
  });

  it("an edit on an over-loaded line keeps the over-load surcharge", () => {
    const order = { overshipAmount: 360000, totalPrice: 4260000 };
    // delivery only
    const d = ok(plan({ deliveryCost: 350000 }, { loaded: 220, order }));
    expect(d.totals.overshipAmount).toBe(360000);
    expect(d.totals.totalPrice).toBe(3600000 + 350000 + 360000);
    // the line kept at its ordered count (below loaded, as it already was) is allowed
    const same = ok(plan({ lines: [{ lineId: "A", productId: "pA", quantity: 200 }], deliveryCost: 350000 }, { loaded: 220, order }));
    expect(same.totals.overshipAmount).toBe(360000);
    // partly absorbed: 210 ordered, 10 still over at full price
    const part = ok(plan({ lines: [{ lineId: "A", productId: "pA", quantity: 210 }] }, { loaded: 220, order }));
    expect(part.totals.overshipAmount).toBe(180000);
    expect(part.totals.totalPrice).toBe(4260000);
    // but never lower than it was — that would grow the over-load by editing
    const p = problem(plan({ lines: [{ lineId: "A", productId: "pA", quantity: 190 }] }, { loaded: 220, order }));
    expect(p.status).toBe(409);
    expect(p.message).toContain("220");
  });

  it("editPlan keeps percent discount", () => {
    const order = { discountPercent: 10, discountAmount: 360000, totalPrice: 3540000 };
    const r = ok(plan({ lines: [{ lineId: "A", productId: "pA", quantity: 250 }] }, { order }));
    expect(r.totals.discountAmount).toBe(450000);
    expect(r.totals.discountPercent).toBe(10);
    expect(r.totals.totalPrice).toBe(4500000 - 450000 + 300000);
  });

  it("keeps a typed discount amount exact when the lines do not change", () => {
    // 100 000 off 3 600 000 is 2,78 % — re-applying the rounded percent would drift to 100 080
    const order = { discountPercent: 2.78, discountAmount: 100000, totalPrice: 3800000 };
    const r = ok(plan({ deliveryCost: 350000 }, { order }));
    expect(r.totals.discountAmount).toBe(100000);
    expect(r.totals.totalPrice).toBe(3600000 - 100000 + 350000);
  });

  it("applies a new discount percent or amount", () => {
    expect(ok(plan({ discountPercent: 5 })).totals).toMatchObject({ discountAmount: 180000, totalPrice: 3720000 });
    expect(ok(plan({ discountAmount: 200000 })).totals).toMatchObject({ discountAmount: 200000, totalPrice: 3700000 });
    const order = { discountPercent: 10, discountAmount: 360000, totalPrice: 3540000 };
    expect(ok(plan({ discountAmount: 0 }, { order })).totals).toMatchObject({ discountAmount: 0, discountPercent: 0, totalPrice: 3900000 });
  });

  it("existing lines ignore today's catalog price", () => {
    // catalog says 20 000, the line was quoted 18 000
    const r = ok(plan({ lines: [{ lineId: "A", productId: "pA", quantity: 201 }] }));
    expect(r.lineOps.update).toEqual([{ id: "A", quantity: 201, lineTotal: 3618000 }]);
  });

  it("date-only edit is a reschedule with no money ops; identical values change nothing", () => {
    const r = ok(plan({ scheduledAt: new Date(2026, 10, 14) }));
    expect(r.lineOps).toEqual({ update: [], create: [], remove: [] });
    expect(r.changes).toEqual([expect.objectContaining({ field: "date", before: "12.11.2026", after: "14.11.2026" })]);
    expect(r.totals.totalPrice).toBe(3900000);
    expect(r.scheduledAt?.getTime()).toBe(new Date(2026, 10, 14).getTime());

    const same = problem(plan({ scheduledAt: new Date(2026, 10, 12), deliveryCost: 300000, lines: [{ lineId: "A", productId: "pA", quantity: 200 }] }));
    expect(same.status).toBe(409);
    expect(same.message).toMatch(/Ўзгариш йўқ/);
  });

  it("notes: set, cleared, blank counts as cleared", () => {
    expect(ok(plan({ notes: "Эрта келинг" })).notes).toBe("Эрта келинг");
    expect(ok(plan({ notes: null }, { order: { notes: "x" } })).notes).toBeNull();
    expect(problem(plan({ notes: "" })).status).toBe(409);
  });

  // Final review #3: a stored empty note ("") is the same as no note.
  it("a stored empty note is not a change: no-op refused, date-only edit logs only the date", () => {
    expect(problem(plan({}, { order: { notes: "" } })).status).toBe(409);
    expect(problem(plan({ notes: "" }, { order: { notes: "" } })).status).toBe(409);
    const r = ok(plan({ scheduledAt: new Date(2026, 10, 14) }, { order: { notes: "" } }));
    expect(r.changes.map((c) => c.field)).toEqual(["date"]);
    expect(r.notes).toBeNull();
  });

  it("an edit producing a total below confirmed paid yields refund owed, not negative remaining", () => {
    const r = ok(plan({ lines: [{ lineId: "A", productId: "pA", quantity: 170 }] }));
    expect(r.totals.totalPrice).toBe(3360000);
    const confirmedPaid = 3900000;
    expect(refundDue({ status: "PLACED", totalPrice: r.totals.totalPrice, confirmedPaid, writeOffAmount: 0 })).toBe(540000);
    expect(remainingBalance(r.totals.totalPrice, confirmedPaid, 0)).toBe(0);
    expect(paymentStateFor(confirmedPaid, 0, r.totals.totalPrice)).toBe("FULLY_PAID");
  });
});

describe("orderVolumeM3", () => {
  it("sums block volume × quantity to 3 dp; lines without a product add nothing", () => {
    expect(orderVolumeM3([{ quantity: 200, product: dims }])).toBe(7.2);
    expect(orderVolumeM3([{ quantity: 200, product: dims }, { quantity: 5, product: null }])).toBe(7.2);
  });
});

describe("changesText", () => {
  it("joins label: before → after with units", () => {
    const changes: EditChange[] = [
      { field: "line", label: "600×300×200", before: "200", after: "250" },
      { field: "delivery", label: "Етказиб бериш", before: "300 000", after: "350 000" },
    ];
    expect(changesText(changes)).toMatch(/^600×300×200: 200 → 250 та; Етказиб бериш: 300\s000 → 350\s000 UZS$/);
  });
});

// Final review #6: the dialog pre-fills the stored percent at 2 dp; touching the field
// without changing it must not re-send the rounded value (33,333 % → 33,33 % drift).
describe("discountPercentToSend", () => {
  it("sends nothing while the field still shows the stored value", () => {
    expect(percentFieldText(33.3333)).toBe("33,33");
    expect(discountPercentToSend("33,33", 33.3333)).toBeUndefined();
    expect(discountPercentToSend(" 33,33 ", 33.3333)).toBeUndefined();
    expect(discountPercentToSend("", 0)).toBeUndefined();
  });
  it("sends a changed value, 0 for a cleared field, null when unreadable or out of range", () => {
    expect(discountPercentToSend("33,34", 33.3333)).toBe(33.34);
    expect(discountPercentToSend("5", 0)).toBe(5);
    expect(discountPercentToSend("", 10)).toBe(0);
    expect(discountPercentToSend("abc", 10)).toBeNull();
    expect(discountPercentToSend("150", 10)).toBeNull();
  });
});

