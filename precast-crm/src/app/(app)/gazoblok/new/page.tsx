"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Loader2,
  Plus,
  X,
  User,
  Phone,
  MapPin,
  Ruler,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import {
  estimateWall,
  orderTotal,
  lineTotal,
  blockVolumeM3,
} from "@/services/gazoblok-engine";

// ── API types ───────────────────────────────────────────────────
// Decimal fields arrive from Prisma as JSON STRINGS — always wrap with
// Number() before any math.
interface Product {
  id: string;
  label: string;
  lengthM: string;
  heightM: string;
  thicknessM: string;
  pricePerBlock: string;
  lowStockThreshold: number;
  active: boolean;
  seq: number;
  stock: { quantity: number } | null;
}

interface Config {
  grade?: string;
}

interface CreatedOrder {
  id: string;
  orderNumber: string;
}

/** A committed order line in the operator's draft. unitPrice is already a
 *  Number (resolved from the product's pricePerBlock string at add-time). */
interface DraftLine {
  productId: string;
  productLabel: string;
  unitPrice: number;
  quantity: number;
}

type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CLICK" | "PAYME" | "OTHER";

function dims(p: Product) {
  return {
    lengthM: Number(p.lengthM),
    heightM: Number(p.heightM),
    thicknessM: Number(p.thicknessM),
    pricePerBlock: Number(p.pricePerBlock),
  };
}

export default function GazoblokNewOrderPage() {
  const t = useT();
  const router = useRouter();

  const { data: products } = useQuery<Product[]>({
    queryKey: ["gazoblok-products"],
    queryFn: () => api("/api/gazoblok/products"),
  });
  const { data: config } = useQuery<Config>({
    queryKey: ["gazoblok-config"],
    queryFn: () => api("/api/gazoblok/config"),
  });

  const activeProducts = useMemo(
    () => (products ?? []).filter((p) => p.active),
    [products],
  );

  // ── Customer ──
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");

  // ── Line builder ──
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [pickProductId, setPickProductId] = useState("");
  const [pickQty, setPickQty] = useState("");

  // ── Wall estimator ──
  const [estOpen, setEstOpen] = useState(false);
  const [estProductId, setEstProductId] = useState("");
  const [estLength, setEstLength] = useState("");
  const [estHeight, setEstHeight] = useState("");
  const [estOpenings, setEstOpenings] = useState("");
  const [estWaste, setEstWaste] = useState("5");

  // ── Pricing knobs ──
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [deliveryCost, setDeliveryCost] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");

  const [error, setError] = useState<string | null>(null);

  function addLine() {
    const p = activeProducts.find((x) => x.id === pickProductId);
    const qty = Math.floor(Number(pickQty));
    if (!p || !Number.isFinite(qty) || qty <= 0) return;
    const unitPrice = Number(p.pricePerBlock);
    setLines((prev) => {
      // Merge into an existing line for the same product so duplicate
      // picks don't fragment the order.
      const existing = prev.findIndex((l) => l.productId === p.id);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = {
          ...next[existing],
          quantity: next[existing].quantity + qty,
        };
        return next;
      }
      return [
        ...prev,
        { productId: p.id, productLabel: p.label, unitPrice, quantity: qty },
      ];
    });
    setPickQty("");
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── Live wall estimate (client-side preview) ──
  const estProduct = activeProducts.find((p) => p.id === estProductId);
  const estimate = useMemo(() => {
    if (!estProduct) return null;
    const lengthM = Number(estLength);
    const heightM = Number(estHeight);
    if (!Number.isFinite(lengthM) || lengthM <= 0) return null;
    if (!Number.isFinite(heightM) || heightM <= 0) return null;
    try {
      return estimateWall(dims(estProduct), {
        lengthM,
        heightM,
        openingsM2: estOpenings.trim() === "" ? 0 : Number(estOpenings),
        wastePct: estWaste.trim() === "" ? undefined : Number(estWaste),
      });
    } catch {
      return null;
    }
  }, [estProduct, estLength, estHeight, estOpenings, estWaste]);

  function addEstimateToOrder() {
    if (!estProduct || !estimate || estimate.blocksNeeded <= 0) return;
    const unitPrice = Number(estProduct.pricePerBlock);
    const qty = estimate.blocksNeeded;
    setLines((prev) => {
      const existing = prev.findIndex((l) => l.productId === estProduct.id);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = {
          ...next[existing],
          quantity: next[existing].quantity + qty,
        };
        return next;
      }
      return [
        ...prev,
        {
          productId: estProduct.id,
          productLabel: estProduct.label,
          unitPrice,
          quantity: qty,
        },
      ];
    });
  }

  // ── Live totals (preview only — server recomputes authoritatively) ──
  const totals = useMemo(
    () =>
      orderTotal(
        lines.map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity })),
        {
          discountPercent:
            discountPercent.trim() === "" ? undefined : Number(discountPercent),
          discountAmount:
            discountAmount.trim() === "" ? undefined : Number(discountAmount),
          deliveryCost:
            deliveryCost.trim() === "" ? undefined : Number(deliveryCost),
        },
      ),
    [lines, discountPercent, discountAmount, deliveryCost],
  );

  // Total m³ across all lines (look up each product's volume).
  const totalVolumeM3 = useMemo(() => {
    let v = 0;
    for (const l of lines) {
      const p = (products ?? []).find((x) => x.id === l.productId);
      if (!p) continue;
      try {
        v += blockVolumeM3(dims(p)) * l.quantity;
      } catch {
        /* ignore bad dims */
      }
    }
    return v;
  }, [lines, products]);

  const placeOrder = useMutation({
    mutationFn: () =>
      api<CreatedOrder>("/api/gazoblok/orders", {
        method: "POST",
        json: {
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          clientAddress: clientAddress.trim() || undefined,
          lines: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
          })),
          discountPercent:
            discountAmount.trim() !== "" || discountPercent.trim() === ""
              ? undefined
              : Number(discountPercent),
          discountAmount:
            discountAmount.trim() === "" ? undefined : Number(discountAmount),
          deliveryCost:
            deliveryCost.trim() === "" ? undefined : Number(deliveryCost),
          scheduledAt: scheduledAt
            ? new Date(scheduledAt).toISOString()
            : undefined,
          paidAmount:
            paidAmount.trim() === "" || Number(paidAmount) <= 0
              ? undefined
              : Number(paidAmount),
          paymentMethod:
            paidAmount.trim() !== "" && Number(paidAmount) > 0
              ? paymentMethod
              : undefined,
        },
      }),
    onSuccess: (created) => {
      setError(null);
      router.push("/gazoblok/orders/" + created.id);
    },
    onError: (e: Error) => setError(e.message),
  });

  const canPlace =
    lines.length > 0 &&
    clientName.trim().length > 0 &&
    clientPhone.trim().length > 0 &&
    !placeOrder.isPending;

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Boxes className="h-6 w-6 text-muted-foreground" />
            Газоблок
            <span className="lang-en text-muted-foreground font-normal text-base">
              {" "}
              · Gazoblok
            </span>
            <span className="text-muted-foreground font-normal">·</span>
            <span className="text-lg font-semibold">
              {t("Янги буюртма", "New order")}
            </span>
          </h1>
          {config?.grade && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {t("Маркаси", "Grade")}:{" "}
              <span className="font-medium text-foreground">{config.grade}</span>
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* Customer */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {t("Мижоз", "Customer")}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Labeled icon={<User className="h-4 w-4" />} label="Исм" en="Name" required>
            <Input
              placeholder={t("Мижоз исми", "Client name")}
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </Labeled>
          <Labeled icon={<Phone className="h-4 w-4" />} label="Тел рақам" en="Phone" required>
            <Input
              type="tel"
              inputMode="tel"
              className="tabular-nums"
              placeholder="+998 90 ___ __ __"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
            />
          </Labeled>
          <Labeled icon={<MapPin className="h-4 w-4" />} label="Манзил" en="Address">
            <Input
              placeholder={t("Манзил", "Address")}
              value={clientAddress}
              onChange={(e) => setClientAddress(e.target.value)}
            />
          </Labeled>
        </div>
      </section>

      {/* Line builder */}
      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <header className="px-4 py-3 border-b">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {t("Қаторлар", "Lines")}
          </div>
        </header>
        <div className="p-4 space-y-4">
          {/* Add-line row */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <FieldLabel uz="Ўлчам" en="Size" />
              <Select
                value={pickProductId}
                onChange={(e) => setPickProductId(e.target.value)}
              >
                <option value="">{t("Ўлчам танланг…", "Pick a size…")}</option>
                {activeProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} — {formatNumber(Number(p.pricePerBlock), 0)} UZS/
                    {t("дона", "block")}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-32">
              <FieldLabel uz="Сони" en="Qty" />
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                className="tabular-nums"
                placeholder="0"
                value={pickQty}
                onChange={(e) => setPickQty(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={addLine}
              disabled={!pickProductId || Math.floor(Number(pickQty)) <= 0}
            >
              <Plus className="h-4 w-4 mr-1" />
              {t("Қўшиш", "Add")}
            </Button>
          </div>

          {/* Lines table */}
          {lines.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">
              {t(
                "Ҳали қатор қўшилмаган.",
                "No lines yet — add a size and quantity above.",
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">{t("Ўлчам", "Size")}</th>
                  <th className="text-right px-3 py-2 w-28">
                    {t("Нархи", "Unit")}
                  </th>
                  <th className="text-right px-3 py-2 w-20">
                    {t("Сони", "Qty")}
                  </th>
                  <th className="text-right px-3 py-2 w-36">
                    {t("Жами", "Total")}
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((l, i) => (
                  <tr key={l.productId}>
                    <td className="px-3 py-2 font-medium">{l.productLabel}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(l.unitPrice, 0)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {l.quantity}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {formatNumber(lineTotal(l.unitPrice, l.quantity), 0)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        aria-label={t("Ўчириш", "Remove")}
                        onClick={() => removeLine(i)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Wall estimator (collapsible) */}
      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => setEstOpen((v) => !v)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-accent/40 transition-colors"
        >
          <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <Ruler className="h-4 w-4" />
            {t("Девор калькулятори", "Wall estimator")}
          </span>
          {estOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {estOpen && (
          <div className="p-4 border-t space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="lg:col-span-3">
                <FieldLabel uz="Ўлчам" en="Size" />
                <Select
                  value={estProductId}
                  onChange={(e) => setEstProductId(e.target.value)}
                >
                  <option value="">{t("Ўлчам танланг…", "Pick a size…")}</option>
                  {activeProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <FieldLabel uz="Девор узунлиги (м)" en="Wall length (m)" />
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.1}
                  className="tabular-nums"
                  placeholder="0"
                  value={estLength}
                  onChange={(e) => setEstLength(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel uz="Баландлиги (м)" en="Height (m)" />
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.1}
                  className="tabular-nums"
                  placeholder="0"
                  value={estHeight}
                  onChange={(e) => setEstHeight(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel uz="Очиқликлар (м²)" en="Openings (m²)" />
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.1}
                  className="tabular-nums"
                  placeholder="0"
                  value={estOpenings}
                  onChange={(e) => setEstOpenings(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel uz="Чиқинди (%)" en="Waste (%)" />
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  className="tabular-nums"
                  placeholder="5"
                  value={estWaste}
                  onChange={(e) => setEstWaste(e.target.value)}
                />
              </div>
            </div>

            {estimate && (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
                <Stat
                  label={t("Деворлар (м²)", "Wall (m²)")}
                  value={formatNumber(estimate.wallAreaM2, 2)}
                />
                <Stat
                  label={t("Блоклар", "Blocks")}
                  value={formatNumber(estimate.blocksNeeded, 0)}
                  strong
                />
                <Stat
                  label="м³"
                  value={formatNumber(estimate.volumeM3, 3)}
                />
                <Stat
                  label={t("Нархи (UZS)", "Price (UZS)")}
                  value={formatNumber(estimate.price, 0)}
                  strong
                />
              </div>
            )}

            <Button
              type="button"
              variant="secondary"
              onClick={addEstimateToOrder}
              disabled={!estimate || estimate.blocksNeeded <= 0}
            >
              <Plus className="h-4 w-4 mr-1" />
              {t("Қаторга қўшиш", "Add to order")}
            </Button>
          </div>
        )}
      </section>

      {/* Pricing knobs */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {t("Нарх ва тўлов", "Pricing & payment")}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <FieldLabel uz="Чегирма (%)" en="Discount (%)" />
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              className="tabular-nums"
              placeholder="0"
              value={discountPercent}
              disabled={discountAmount.trim() !== ""}
              onChange={(e) => setDiscountPercent(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel uz="Чегирма (UZS)" en="Discount (UZS)" />
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              className="tabular-nums"
              placeholder="0"
              value={discountAmount}
              disabled={discountPercent.trim() !== ""}
              onChange={(e) => setDiscountAmount(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel uz="Етказиб бериш (UZS)" en="Delivery (UZS)" />
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              className="tabular-nums"
              placeholder="0"
              value={deliveryCost}
              onChange={(e) => setDeliveryCost(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel uz="Режалаштирилган сана" en="Scheduled date" />
            <Input
              type="date"
              className="tabular-nums"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel uz="Тўланди (UZS)" en="Paid up-front (UZS)" />
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              className="tabular-nums"
              placeholder="0"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel uz="Тўлов усули" en="Payment method" />
            <Select
              value={paymentMethod}
              disabled={paidAmount.trim() === "" || Number(paidAmount) <= 0}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            >
              <option value="CASH">{t("Нақд", "Cash")}</option>
              <option value="BANK_TRANSFER">
                {t("Банк ўтказмаси", "Bank transfer")}
              </option>
              <option value="CLICK">Click</option>
              <option value="PAYME">Payme</option>
              <option value="OTHER">{t("Бошқа", "Other")}</option>
            </Select>
          </div>
        </div>
      </section>

      {/* Summary + place */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="space-y-1.5 text-sm">
          <SummaryRow
            label={t("Қаторлар суммаси", "Lines subtotal")}
            value={formatNumber(totals.linesSubtotal, 0)}
          />
          {totals.discountAmount > 0 && (
            <SummaryRow
              label={`${t("Чегирма", "Discount")} (${formatNumber(
                totals.discountPercent,
                2,
              )}%)`}
              value={"−" + formatNumber(totals.discountAmount, 0)}
            />
          )}
          {totals.deliveryCost > 0 && (
            <SummaryRow
              label={t("Етказиб бериш", "Delivery")}
              value={formatNumber(totals.deliveryCost, 0)}
            />
          )}
          <div className="flex items-baseline justify-between pt-2 border-t">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {t("Жами", "Total")}
            </span>
            <span className="text-2xl font-bold tabular-nums">
              {formatNumber(totals.total, 0)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                UZS
              </span>
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums pt-1">
            <span>
              {t("Жами блоклар", "Total blocks")}:{" "}
              <span className="font-medium text-foreground">
                {formatNumber(totals.totalBlocks, 0)}
              </span>
            </span>
            <span>
              м³:{" "}
              <span className="font-medium text-foreground">
                {formatNumber(totalVolumeM3, 3)}
              </span>
            </span>
          </div>
        </div>

        <Button
          className="w-full"
          size="lg"
          disabled={!canPlace}
          onClick={() => placeOrder.mutate()}
        >
          {placeOrder.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Boxes className="h-4 w-4 mr-2" />
          )}
          {t("Буюртма бериш", "Place order")}
        </Button>
      </section>
    </div>
  );
}

// ── Small presentational helpers ────────────────────────────────

function FieldLabel({ uz, en }: { uz: string; en: string }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-wider mb-1">
      {uz}
      <span className="lang-en text-[10px] text-muted-foreground font-normal">
        {" "}
        · {en}
      </span>
    </div>
  );
}

function Labeled({
  icon,
  label,
  en,
  required,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  en: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </span>
        <span className="lang-en text-[10px] font-normal">· {en}</span>
      </div>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={`tabular-nums ${strong ? "font-bold text-base" : "font-medium"}`}
      >
        {value}
      </span>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
