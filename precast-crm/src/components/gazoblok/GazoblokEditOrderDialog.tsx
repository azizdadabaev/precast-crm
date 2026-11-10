"use client";

/**
 * Edit an open order: per-size quantities, added sizes, discount, delivery, date, notes —
 * or (mode "schedule") only the date. The preview runs the same editPlan the server runs,
 * so the operator sees the new total, the floor refusals and any refund it would cause
 * before saving. Only changed fields are sent, so a date-only save stays a reschedule.
 */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLang, useT } from "@/lib/i18n";
import { formatNumber } from "@/lib/utils";
import { editPlan } from "@/lib/gazoblok-edit";
import { loadedByLine, parseDecimal } from "@/lib/gazoblok-quantities";
import { parseMoney, uzPart } from "@/lib/gazoblok-text";
import type { GazoblokEditOrderInput } from "@/lib/gazoblok-validation";

/** The fields of the order detail GET this dialog reads. */
export type GazoblokEditOrderDetail = {
  id: string;
  orderNumber: string;
  status: string;
  shortClosedAt: string | null;
  confirmedPaid: string;
  totalPrice: string;
  linesSubtotal: string;
  discountPercent: string;
  discountAmount: string;
  deliveryCost: string;
  overshipAmount: string;
  scheduledAt: string | null;
  notes: string | null;
  lines: { id: string; productLabel: string; unitPrice: string; quantity: number; product: { id: string } | null }[];
  shipments: { loadedLines: Record<string, number> | null }[];
};

export type GazoblokCatalogProduct = {
  id: string;
  label: string;
  pricePerBlock: string;
  active: boolean;
  lengthM: string;
  heightM: string;
  thicknessM: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  order: GazoblokEditOrderDetail;
  catalog: GazoblokCatalogProduct[];
  perms: { edit: boolean; editShipped: boolean };
  mode: "full" | "schedule";
  onSaved: () => void;
};

export function GazoblokEditOrderDialog(props: Props) {
  const t = useT();
  return (
    <Dialog open={props.open} onOpenChange={(v) => { if (!v) props.onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:p-4">
        <DialogHeader>
          <DialogTitle>
            {props.mode === "schedule" ? t("Санани ўзгартириш", "Change the date") : t("Буюртмани таҳрирлаш", "Edit order")}
            <span className="ml-2 font-mono tabular-nums text-sm font-normal text-muted-foreground">{props.order.orderNumber}</span>
          </DialogTitle>
        </DialogHeader>
        {/* Mounted only while open, so every opening starts from the saved order. */}
        <EditForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

type Row = {
  key: string;
  lineId: string | null;
  // Legacy lines lost their product: the server matches them by lineId, so the
  // lineId stands in as a unique, non-empty productId.
  productId: string;
  label: string;
  unitPrice: number;
  ordered: number; // 0 for a size added in this dialog
  loaded: number;
  qty: string;
};

const dayOf = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const money0 = (n: number) => formatNumber(n, 0);

function EditForm({ onClose, order, catalog, perms, mode, onSaved }: Props) {
  const t = useT();
  const lang = useLang();
  const loadedMap = useMemo(() => loadedByLine(order.shipments), [order.shipments]);
  const initialRows = useMemo<Row[]>(
    () => order.lines.map((l) => ({
      key: l.id,
      lineId: l.id,
      productId: l.product?.id ?? l.id,
      label: l.productLabel,
      unitPrice: Number(l.unitPrice),
      ordered: l.quantity,
      loaded: loadedMap.get(l.id) ?? 0,
      qty: String(l.quantity),
    })),
    [order.lines, loadedMap],
  );
  const totalLoaded = initialRows.reduce((s, r) => s + r.loaded, 0);
  const moneyLocked = totalLoaded > 0 && !perms.editShipped;
  const showMoney = mode === "full";

  const storedPercent = Number(order.discountPercent);
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [addId, setAddId] = useState("");
  const [percent, setPercent] = useState(storedPercent > 0 ? formatNumber(storedPercent, 2) : "");
  const [amount, setAmount] = useState("");
  const [discountTouched, setDiscountTouched] = useState(false);
  const [delivery, setDelivery] = useState(money0(Number(order.deliveryCost)));
  const [date, setDate] = useState(dayOf(order.scheduledAt));
  const [notes, setNotes] = useState(order.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const addable = catalog.filter((p) => p.active && !rows.some((r) => r.productId === p.id));

  // Build the request from what changed; null when an input can't be read.
  const built = useMemo((): { edit: GazoblokEditOrderInput; bad: string | null } => {
    const edit: GazoblokEditOrderInput = {};
    if (showMoney && !moneyLocked) {
      const qtys = rows.map((r) => {
        const n = parseDecimal(r.qty);
        return n !== null && Number.isInteger(n) && n >= 1 ? n : null;
      });
      if (qtys.some((q) => q === null)) return { edit, bad: t("Сонни бутун қилиб киритинг (камида 1)", "Enter a whole quantity (at least 1)") };
      const linesChanged = rows.length !== initialRows.length || rows.some((r, i) => r.lineId === null || qtys[i] !== r.ordered);
      if (linesChanged) {
        edit.lines = rows.map((r, i) => ({ ...(r.lineId ? { lineId: r.lineId } : {}), productId: r.productId, quantity: qtys[i] as number }));
      }
      if (discountTouched) {
        if (amount.trim() !== "") {
          const a = parseMoney(amount);
          if (a === null) return { edit, bad: t("Чегирма суммасини тўғри киритинг", "Enter a valid discount amount") };
          edit.discountAmount = a;
        } else {
          const p = percent.trim() === "" ? 0 : parseDecimal(percent);
          if (p === null || p < 0 || p > 100) return { edit, bad: t("Чегирма 0–100 % бўлиши керак", "Discount must be 0–100 %") };
          edit.discountPercent = p;
        }
      }
      const d = delivery.trim() === "" ? 0 : parseMoney(delivery);
      if (d === null) return { edit, bad: t("Етказиб бериш суммасини тўғри киритинг", "Enter a valid delivery cost") };
      if (d !== Number(order.deliveryCost)) edit.deliveryCost = d;
    }
    if (date !== dayOf(order.scheduledAt)) edit.scheduledAt = date ? new Date(date) : null;
    if (showMoney && notes.trim() !== (order.notes ?? "").trim()) edit.notes = notes.trim() || null;
    return { edit, bad: null };
  }, [showMoney, moneyLocked, rows, initialRows, discountTouched, amount, percent, delivery, date, notes, order, t]);

  const preview = useMemo(() => {
    if (built.bad) return null;
    return editPlan({
      order: {
        linesSubtotal: Number(order.linesSubtotal),
        discountPercent: Number(order.discountPercent),
        discountAmount: Number(order.discountAmount),
        deliveryCost: Number(order.deliveryCost),
        overshipAmount: Number(order.overshipAmount),
        totalPrice: Number(order.totalPrice),
        scheduledAt: order.scheduledAt ? new Date(order.scheduledAt) : null,
        notes: order.notes,
      },
      lines: initialRows.map((r) => ({
        id: r.key,
        productId: r.productId,
        productLabel: r.label,
        quantity: r.ordered,
        unitPrice: r.unitPrice,
      })),
      shipments: order.shipments,
      products: catalog.map((p) => ({
        id: p.id,
        label: p.label,
        pricePerBlock: Number(p.pricePerBlock),
        active: p.active,
        lengthM: Number(p.lengthM),
        heightM: Number(p.heightM),
        thicknessM: Number(p.thicknessM),
      })),
      edit: built.edit,
    });
  }, [built, order, initialRows, catalog]);

  const plan = preview && !("problem" in preview) ? preview : null;
  const problem = built.bad ?? (preview && "problem" in preview ? uzPart(preview.problem.message, lang) : null);
  const oldTotal = Number(order.totalPrice);
  const refund = plan ? Math.max(0, Number(order.confirmedPaid) - plan.totals.totalPrice) : 0;

  const save = useMutation({
    mutationFn: () => api(`/api/gazoblok/orders/${order.id}/edit`, { method: "PATCH", json: built.edit }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (e: Error) => setError(uzPart(e.message, lang)),
  });

  const setQty = (key: string, qty: string) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, qty } : r)));
  const addSize = () => {
    const p = catalog.find((c) => c.id === addId);
    if (!p) return;
    setRows((rs) => [...rs, {
      key: `new-${p.id}`, lineId: null, productId: p.id, label: p.label,
      unitPrice: Number(p.pricePerBlock), ordered: 0, loaded: 0, qty: "",
    }]);
    setAddId("");
  };

  const fieldLabel = "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";
  const monoInput = "h-11 font-mono tabular-nums text-right";

  return (
    <div className="grid gap-4">
      {showMoney && (
        <section className="grid gap-3">
          {moneyLocked && (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              {t("Юк жўнатилган — фақат эгаси ўзгартира олади", "Blocks were loaded — only the owner can change quantities or prices")}
            </p>
          )}
          <div className="grid gap-2">
            {rows.map((r) => (
              <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_7.5rem_2.75rem] items-center gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium" title={r.label}>{r.label}</div>
                  <div className="font-mono tabular-nums text-xs text-muted-foreground">
                    {money0(r.unitPrice)} UZS
                    {r.loaded > 0 && <> · {t(`камида ${formatNumber(Math.min(r.loaded, r.ordered), 0)} (юкланган)`, `at least ${formatNumber(Math.min(r.loaded, r.ordered), 0)} (loaded)`)}</>}
                    {r.lineId === null && <> · {t("янги", "new")}</>}
                  </div>
                </div>
                <Input
                  inputMode="decimal"
                  aria-label={t(`${r.label} — сони`, `${r.label} — quantity`)}
                  className={monoInput}
                  value={r.qty}
                  disabled={moneyLocked || save.isPending}
                  onChange={(e) => setQty(r.key, e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11"
                  aria-label={t("Ўлчамни олиб ташлаш", "Remove size")}
                  disabled={moneyLocked || r.loaded > 0 || rows.length === 1 || save.isPending}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          {addable.length > 0 && (
            <div className="flex gap-2">
              <Select
                aria-label={t("Ўлчам қўшиш", "Add size")}
                className="h-11"
                value={addId}
                disabled={moneyLocked || save.isPending}
                onChange={(e) => setAddId(e.target.value)}
              >
                <option value="">{t("Ўлчам қўшиш…", "Add size…")}</option>
                {addable.map((p) => (
                  <option key={p.id} value={p.id}>{p.label} — {money0(Number(p.pricePerBlock))} UZS</option>
                ))}
              </Select>
              <Button type="button" variant="outline" className="h-11 min-w-[44px]" disabled={!addId || moneyLocked || save.isPending} onClick={addSize}>
                <Plus className="h-4 w-4" />
                <span className="sr-only">{t("Қўшиш", "Add")}</span>
              </Button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className={fieldLabel}>
              {t("Чегирма, %", "Discount, %")}
              <Input
                inputMode="decimal"
                className={`mt-1 ${monoInput}`}
                value={percent}
                disabled={moneyLocked || amount.trim() !== "" || save.isPending}
                onChange={(e) => { setPercent(e.target.value); setDiscountTouched(true); }}
              />
            </label>
            <label className={fieldLabel}>
              {t("Чегирма, UZS", "Discount, UZS")}
              <Input
                inputMode="decimal"
                className={`mt-1 ${monoInput}`}
                value={amount}
                disabled={moneyLocked || percent.trim() !== "" || save.isPending}
                onChange={(e) => { setAmount(e.target.value); setDiscountTouched(true); }}
              />
            </label>
            <label className={fieldLabel}>
              {t("Етказиб бериш, UZS", "Delivery, UZS")}
              <Input
                inputMode="decimal"
                className={`mt-1 ${monoInput}`}
                value={delivery}
                disabled={moneyLocked || save.isPending}
                onChange={(e) => setDelivery(e.target.value)}
              />
            </label>
          </div>
        </section>
      )}

      <div className={showMoney ? "grid grid-cols-1 gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]" : "grid gap-3"}>
        <label className={fieldLabel}>
          {t("Сана", "Date")}
          <div className="mt-1 flex gap-2">
            <Input type="date" className="h-11 font-mono tabular-nums" value={date} disabled={save.isPending} onChange={(e) => setDate(e.target.value)} />
            {date && (
              <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={t("Санани олиб ташлаш", "Clear date")} disabled={save.isPending} onClick={() => setDate("")}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </label>
        {showMoney && (
          <label className={fieldLabel}>
            {t("Изоҳ", "Notes")}
            <textarea
              rows={2}
              maxLength={1000}
              value={notes}
              disabled={save.isPending}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm normal-case tracking-normal font-normal"
            />
          </label>
        )}
      </div>

      <div className="grid gap-1 rounded-md bg-muted/40 p-3 text-sm" aria-live="polite">
        {plan ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-muted-foreground">{t("Жами", "Total")}</span>
              <span className="font-mono tabular-nums">
                {money0(oldTotal)} → <span className="font-semibold">{money0(plan.totals.totalPrice)}</span> UZS
              </span>
            </div>
            {refund > 0 && (
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-semibold text-warning">
                <span>{t("Қайтариш керак бўлади", "Refund will be owed")}</span>
                <span className="font-mono tabular-nums">{money0(refund)} UZS</span>
              </div>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">{problem}</span>
        )}
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" className="min-h-[44px]" onClick={onClose} disabled={save.isPending}>{t("Орқага", "Back")}</Button>
        <Button className="min-h-[44px]" disabled={!plan || save.isPending} onClick={() => { setError(null); save.mutate(); }}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("Сақлаш", "Save")}
        </Button>
      </div>
    </div>
  );
}
