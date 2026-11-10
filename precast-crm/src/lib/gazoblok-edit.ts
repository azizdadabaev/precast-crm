/**
 * Gazoblok order edit and reschedule (Stage 3, spec §4). Pure: no Prisma, no `new Date()`.
 * Owner rules: quantities never below what was loaded, finished orders are final, every
 * change is listed for the log, and the totals follow placement + load + close-short math
 * (frozen line prices, over-load at full price, discount scaled to the new subtotal,
 * delivery only as typed) so no money appears or disappears on an edit.
 */
import { round2 } from "@/services/calculation-engine";
import { blockVolumeM3, lineTotal, orderTotal } from "@/services/gazoblok-engine";
import { formatNumber } from "@/lib/utils";
import { computeOvership } from "./gazoblok-overship";
import { loadedByLine } from "./gazoblok-quantities";
import { isOpen } from "./gazoblok-rules";
import type { GazoblokEditOrderInput } from "./gazoblok-validation";

type Refusal = { status: number; message: string };

export type EditScope = "none" | "schedule" | "money";

/** Lines, discount or delivery touch money; date and notes alone are a reschedule. */
export function editScope(input: GazoblokEditOrderInput): EditScope {
  const money = input.lines !== undefined || input.discountPercent !== undefined
    || input.discountAmount !== undefined || input.deliveryCost !== undefined;
  if (money) return "money";
  return input.scheduledAt !== undefined || input.notes !== undefined ? "schedule" : "none";
}

/**
 * Who may edit what. Once any block is loaded, money edits need order.editShipped — this
 * also stops a selling operator raising a line to swallow an over-load and hide their debt.
 */
export function editPolicy(
  o: { status: string; shortClosedAt: Date | string | null; totalLoaded: number },
  scope: EditScope,
  perms: { edit: boolean; editShipped: boolean },
): Refusal | null {
  if (!isOpen(o)) return { status: 409, message: "Буюртма ёпилган — таҳрирлаб бўлмайди · The order is closed" };
  if (!perms.edit) return { status: 403, message: "Буюртмани ўзгартиришга рухсат йўқ · You can't change orders" };
  if (scope === "money" && o.totalLoaded > 0 && !perms.editShipped) {
    return {
      status: 403,
      message: "Юк жўнатилган — фақат эгаси ўзгартира олади · Blocks were loaded — only the owner can change quantities or prices",
    };
  }
  return null;
}

export type EditChange = {
  field: "line" | "lineAdded" | "lineRemoved" | "discount" | "delivery" | "overship" | "date" | "notes" | "total";
  label: string;
  before: string;
  after: string;
};

type EditOrder = {
  linesSubtotal: number;
  discountPercent: number;
  discountAmount: number;
  deliveryCost: number;
  overshipAmount: number;
  totalPrice: number;
  scheduledAt: Date | null;
  notes: string | null;
};
type EditLine = { id: string; productId: string | null; productLabel: string; quantity: number; unitPrice: number };
type EditProduct = {
  id: string;
  label: string;
  pricePerBlock: number;
  active: boolean;
  lengthM: number;
  heightM: number;
  thicknessM: number;
};

export type EditPlan = {
  lineOps: {
    update: { id: string; quantity: number; lineTotal: number }[];
    create: { productId: string; productLabel: string; unitPrice: number; quantity: number; lineTotal: number }[];
    remove: string[];
  };
  totals: {
    linesSubtotal: number;
    discountPercent: number;
    discountAmount: number;
    deliveryCost: number;
    overshipAmount: number;
    totalPrice: number;
    totalBlocks: number;
  };
  scheduledAt: Date | null;
  notes: string | null;
  changes: EditChange[];
};

const problem = (status: number, message: string): { problem: Refusal } => ({ problem: { status, message } });

function floorText(label: string, loaded: number, next: number): string {
  return `Юкланганидан кам қилиб бўлмайди — ${label}: юкланган ${loaded}, янгисида ${next} · Can't go below what was loaded — ${label}: loaded ${loaded}, new ${next}`;
}

function dayText(d: Date | null): string {
  if (!d) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

const money = (n: number) => formatNumber(n, 2);

/**
 * Resolve an edit into line operations, new totals and the change list, or a refusal.
 * `edit.lines`, when present, is the full new line list: an existing line is matched by
 * lineId (else by product) and keeps its frozen unitPrice; an unmatched product is a new
 * size at today's price; an omitted line is removed.
 */
export function editPlan(input: {
  order: EditOrder;
  lines: EditLine[];
  shipments: { loadedLines: unknown }[];
  products: EditProduct[];
  edit: GazoblokEditOrderInput;
}): { problem: Refusal } | EditPlan {
  const { order, lines, edit } = input;
  const loaded = loadedByLine(input.shipments);
  const products = new Map(input.products.map((p) => [p.id, p]));

  const update: EditPlan["lineOps"]["update"] = [];
  const create: EditPlan["lineOps"]["create"] = [];
  const remove: string[] = [];
  const changes: EditChange[] = [];
  let next: { id: string | null; quantity: number; unitPrice: number }[] = lines.map((l) => ({ ...l }));

  if (edit.lines) {
    const seen = new Set<string>();
    for (const e of edit.lines) {
      if (seen.has(e.productId)) return problem(422, "Бир ўлчам икки марта · Same size twice");
      seen.add(e.productId);
    }
    const claimed = new Set<string>();
    next = [];
    for (const e of edit.lines) {
      const line = e.lineId
        ? lines.find((l) => l.id === e.lineId)
        : lines.find((l) => l.productId === e.productId && !claimed.has(l.id));
      if (e.lineId && !line) return problem(422, "Буюртмада бундай қатор йўқ · No such line on this order");
      if (line) {
        if (claimed.has(line.id)) return problem(422, "Бир ўлчам икки марта · Same size twice");
        if (line.productId && line.productId !== e.productId) {
          return problem(422, "Қатор ўлчамини алмаштириб бўлмайди — янги ўлчам қўшинг · A line's size can't be swapped — add a new size");
        }
        claimed.add(line.id);
        const got = loaded.get(line.id) ?? 0;
        // An already over-loaded line may stay at its ordered count, but never drop further.
        if (e.quantity < Math.min(got, line.quantity)) return problem(409, floorText(line.productLabel, got, e.quantity));
        next.push({ id: line.id, quantity: e.quantity, unitPrice: Number(line.unitPrice) });
        if (e.quantity !== line.quantity) {
          update.push({ id: line.id, quantity: e.quantity, lineTotal: lineTotal(Number(line.unitPrice), e.quantity) });
          changes.push({ field: "line", label: line.productLabel, before: formatNumber(line.quantity), after: formatNumber(e.quantity) });
        }
        continue;
      }
      const p = products.get(e.productId);
      if (!p) return problem(422, "Ўлчам топилмади · Size not found");
      if (!p.active) return problem(422, `Ўлчам архивда — ${p.label} · This size is archived — ${p.label}`);
      const unitPrice = Number(p.pricePerBlock);
      next.push({ id: null, quantity: e.quantity, unitPrice });
      create.push({ productId: p.id, productLabel: p.label, unitPrice, quantity: e.quantity, lineTotal: lineTotal(unitPrice, e.quantity) });
      changes.push({ field: "lineAdded", label: p.label, before: "0", after: formatNumber(e.quantity) });
    }
    for (const l of lines) {
      if (claimed.has(l.id)) continue;
      const got = loaded.get(l.id) ?? 0;
      if (got > 0) return problem(409, floorText(l.productLabel, got, 0));
      remove.push(l.id);
      changes.push({ field: "lineRemoved", label: l.productLabel, before: formatNumber(l.quantity), after: "0" });
    }
  }

  const deliveryCost = edit.deliveryCost ?? Number(order.deliveryCost);
  const newSub = round2(next.reduce((s, l) => s + lineTotal(l.unitPrice, l.quantity), 0));
  let discount: { discountPercent?: number; discountAmount?: number };
  if ((edit.discountAmount ?? 0) > 0) discount = { discountAmount: edit.discountAmount };
  else if (edit.discountPercent !== undefined) discount = { discountPercent: edit.discountPercent };
  else if (edit.discountAmount === 0) discount = { discountPercent: 0 };
  else {
    // No new discount: scale the stored amount to the new subtotal, as close-short does.
    // Equals the stored percent, without the drift of re-applying a percent rounded to 2 dp.
    const oldSub = Number(order.linesSubtotal);
    const scaled = oldSub > 0 ? round2((Number(order.discountAmount) * newSub) / oldSub) : 0;
    discount = scaled > 0 ? { discountAmount: scaled } : { discountPercent: Number(order.discountPercent) };
  }
  const t = orderTotal(next, { ...discount, deliveryCost });

  const priced = next.filter((l): l is { id: string; quantity: number; unitPrice: number } => l.id !== null);
  const { overshipAmount } = computeOvership(priced, [{ loadedLines: Object.fromEntries(loaded) }]);
  const totalPrice = round2(t.total + overshipAmount);

  const was = {
    discount: round2(Number(order.discountAmount)),
    delivery: round2(Number(order.deliveryCost)),
    overship: round2(Number(order.overshipAmount)),
    total: round2(Number(order.totalPrice)),
  };
  if (t.discountAmount !== was.discount) changes.push({ field: "discount", label: "Чегирма", before: money(was.discount), after: money(t.discountAmount) });
  if (t.deliveryCost !== was.delivery) changes.push({ field: "delivery", label: "Етказиб бериш", before: money(was.delivery), after: money(t.deliveryCost) });
  if (overshipAmount !== was.overship) changes.push({ field: "overship", label: "Ортиқча юклаш", before: money(was.overship), after: money(overshipAmount) });

  const scheduledAt = edit.scheduledAt === undefined ? order.scheduledAt : edit.scheduledAt;
  if ((scheduledAt?.getTime() ?? null) !== (order.scheduledAt?.getTime() ?? null)) {
    changes.push({ field: "date", label: "Сана", before: dayText(order.scheduledAt), after: dayText(scheduledAt) });
  }
  const notes = edit.notes === undefined ? order.notes : edit.notes?.trim() || null;
  if (notes !== (order.notes || null)) changes.push({ field: "notes", label: "Изоҳ", before: order.notes || "—", after: notes ?? "—" });

  if (totalPrice !== was.total) changes.push({ field: "total", label: "Жами", before: money(was.total), after: money(totalPrice) });
  if (changes.length === 0) return problem(409, "Ўзгариш йўқ · Nothing changed");

  return {
    lineOps: { update, create, remove },
    totals: {
      linesSubtotal: t.linesSubtotal,
      discountPercent: t.discountPercent,
      discountAmount: t.discountAmount,
      deliveryCost: t.deliveryCost,
      overshipAmount,
      totalPrice,
      totalBlocks: t.totalBlocks,
    },
    scheduledAt,
    notes,
    changes,
  };
}

/** Σ block volume × quantity, 3 dp (as placement stores it). Lines without a product add nothing. */
export function orderVolumeM3(
  lines: { quantity: number; product: { lengthM: number; heightM: number; thicknessM: number } | null }[],
): number {
  const v = lines.reduce((s, l) => {
    if (!l.product) return s;
    const each = blockVolumeM3({
      lengthM: Number(l.product.lengthM),
      heightM: Number(l.product.heightM),
      thicknessM: Number(l.product.thicknessM),
      pricePerBlock: 0,
    });
    return s + each * l.quantity;
  }, 0);
  return Math.round(v * 1000) / 1000;
}

const UNIT: Record<EditChange["field"], string> = {
  line: " та",
  lineAdded: " та",
  lineRemoved: " та",
  discount: " UZS",
  delivery: " UZS",
  overship: " UZS",
  total: " UZS",
  date: "",
  notes: "",
};

/** The event message: «label: before → after» per change, joined with "; ". */
export function changesText(changes: EditChange[]): string {
  return changes.map((c) => `${c.label}: ${c.before} → ${c.after}${UNIT[c.field]}`).join("; ");
}
