"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Boxes,
  Loader2,
  Plus,
  X,
  User,
  Phone,
  MapPin,
  RotateCcw,
} from "lucide-react";
import { api, ApiError } from "@/lib/fetcher";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatNumber } from "@/lib/utils";
import { Bi, useLang, useT } from "@/lib/i18n";
import { PAYMENT_METHOD_LABELS } from "@/lib/gazoblok-labels";
import { parseMoney, uzPart } from "@/lib/gazoblok-text";
import { parseDecimal } from "@/lib/gazoblok-quantities";
import type { ReorderDraft } from "@/lib/gazoblok-reorder";
import {
  optionalNumber,
  reorderPrefill,
  type ReorderPrefill,
} from "@/lib/gazoblok-reorder-form";
import {
  orderTotal,
  lineTotal,
  blockVolumeM3,
} from "@/services/gazoblok-engine";
import type { PerSizeResult } from "@/services/gazoblok-engine";
import {
  GazoblokWallCalculator,
  type CalcProduct,
  type WallCalcSnapshot,
} from "@/components/gazoblok/GazoblokWallCalculator";

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

// Figures in IBM Plex Mono (--font-num): the app's default mono has no Cyrillic.
const NUM = "font-[family-name:var(--font-num)] tabular-nums [word-spacing:-0.38em]";

// `?from=<orderId>` reads the URL, which needs a Suspense boundary for next build.
export default function GazoblokNewOrderPage() {
  const t = useT();
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>}>
      <NewOrderForm />
    </Suspense>
  );
}

function NewOrderForm() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const fromId = useSearchParams().get("from");

  const {
    data: products,
    isLoading: productsLoading,
    isError: productsError,
    refetch: refetchProducts,
  } = useQuery<Product[]>({
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

  // ── Wall calculator snapshot (sent with the order at placement) ──
  const [wallSnapshot, setWallSnapshot] = useState<WallCalcSnapshot | null>(
    null,
  );

  // ── Pricing knobs ──
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [deliveryCost, setDeliveryCost] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  // No default method: the server rejects a paid amount without an explicit
  // method, so the operator must pick one consciously.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");

  const [error, setError] = useState<string | null>(null);

  // ── Reorder: `?from=<orderId>` prefills the form once; the operator checks and places ──
  const draft = useQuery<ReorderDraft>({
    queryKey: ["gazoblok-reorder-draft", fromId],
    queryFn: () => api(`/api/gazoblok/orders/${fromId}/reorder`),
    enabled: !!fromId,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const [reorder, setReorder] = useState<(ReorderPrefill & { source: ReorderDraft["source"] }) | null>(null);
  const prefilled = useRef(false);
  useEffect(() => {
    if (!draft.data || prefilled.current) return;
    prefilled.current = true;
    const p = reorderPrefill(draft.data);
    setClientName(p.client.name);
    setClientPhone(p.client.phone);
    setClientAddress(p.client.address);
    setLines(p.lines);
    setReorder({ ...p, source: draft.data.source });
  }, [draft.data]);

  const linesSectionRef = useRef<HTMLElement | null>(null);

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

  // A reorder's client may take more or less this time («олдин юкланган 220») — quantities stay editable.
  function setLineQty(idx: number, raw: string) {
    const n = Math.floor(Number(raw.replace(/\s/g, "")));
    const quantity = Number.isFinite(n) && n > 0 ? n : 0;
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, quantity } : l)));
  }

  // ── Stable product list for the wall calculator ──
  // The calculator memoizes on `products` identity, so this MUST be a stable
  // reference (not an inline map) or it re-estimates every render → render loop.
  const calcProducts = useMemo<CalcProduct[]>(
    () =>
      activeProducts.map((p) => ({
        id: p.id,
        label: p.label,
        lengthM: Number(p.lengthM),
        heightM: Number(p.heightM),
        thicknessM: Number(p.thicknessM),
        pricePerBlock: Number(p.pricePerBlock),
      })),
    [activeProducts],
  );

  // Merge each block size from the calculator into the order lines by product.
  function addPerSizeToOrder(perSize: PerSizeResult[]) {
    setLines((prev) => {
      const next = [...prev];
      for (const s of perSize) {
        if (s.blocksNeeded <= 0) continue;
        const p = activeProducts.find((x) => x.id === s.productId);
        if (!p) continue;
        const i = next.findIndex((l) => l.productId === s.productId);
        if (i >= 0)
          next[i] = { ...next[i], quantity: next[i].quantity + s.blocksNeeded };
        else
          next.push({
            productId: s.productId,
            productLabel: p.label,
            unitPrice: Number(p.pricePerBlock),
            quantity: s.blocksNeeded,
          });
      }
      return next;
    });
    linesSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }

  // ── Typed numbers: «1 000 000» and «7,5» are read; blank = not sent; unreadable = null (blocks placing) ──
  const pctNum = optionalNumber(discountPercent, parseDecimal);
  const discNum = optionalNumber(discountAmount, parseMoney);
  const deliveryNum = optionalNumber(deliveryCost, parseMoney);
  const paidTyped = optionalNumber(paidAmount, parseMoney);
  const badNumber = [pctNum, discNum, deliveryNum, paidTyped].some((v) => v === null);

  // ── Live totals (preview only — server recomputes authoritatively) ──
  const totals = useMemo(
    () =>
      orderTotal(
        lines.map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity })),
        {
          discountPercent: pctNum ?? undefined,
          discountAmount: discNum ?? undefined,
          deliveryCost: deliveryNum ?? undefined,
        },
      ),
    [lines, pctNum, discNum, deliveryNum],
  );

  // ── Payment coupling (mirrors the server-side refine) ──
  const paidNum = paidTyped ?? 0;
  const paidPositive = paidNum > 0;
  const methodMissing = paidPositive && paymentMethod === "";
  const paidExceedsTotal = paidPositive && paidNum > totals.total;

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

  // The phone belongs to a client saved under another name: ask, never rename silently.
  const [nameAsk, setNameAsk] = useState<{ saved: string; typed: string } | null>(null);
  const placeOrder = useMutation({
    mutationFn: (clientNameDecision?: "keep" | "update") =>
      api<CreatedOrder>("/api/gazoblok/orders", {
        method: "POST",
        json: {
          clientName: clientName.trim(),
          clientNameDecision,
          clientPhone: clientPhone.trim(),
          clientAddress: clientAddress.trim() || undefined,
          lines: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
          })),
          discountPercent:
            discountAmount.trim() !== "" ? undefined : pctNum ?? undefined,
          discountAmount: discNum ?? undefined,
          deliveryCost: deliveryNum ?? undefined,
          scheduledAt: scheduledAt
            ? new Date(scheduledAt).toISOString()
            : undefined,
          paidAmount: paidPositive ? paidNum : undefined,
          paymentMethod:
            paidPositive && paymentMethod !== "" ? paymentMethod : undefined,
          wallEstimate: wallSnapshot ?? undefined,
          sourceOrderId: reorder?.source.id,
        },
      }),
    onSuccess: (created) => {
      setError(null);
      setNameAsk(null);
      router.push("/gazoblok/orders/" + created.id);
    },
    onError: (e: Error) => {
      const details = e instanceof ApiError ? (e.payload as { details?: { code?: string; savedName?: string; typedName?: string } })?.details : undefined;
      if (details?.code === "CLIENT_NAME_MISMATCH") {
        setError(null);
        setNameAsk({ saved: details.savedName ?? "", typed: details.typedName ?? clientName.trim() });
        return;
      }
      setError(uzPart(e.message, lang));
    },
  });

  const canPlace =
    lines.length > 0 &&
    lines.every((l) => l.quantity > 0) &&
    !badNumber &&
    clientName.trim().length > 0 &&
    clientPhone.trim().length > 0 &&
    !methodMissing &&
    !placeOrder.isPending;

  // ── Catalog states shared by the line builder and the estimator ──
  // A config fetch failure must NOT block order entry — config only supplies the
  // optional cosmetic `grade` label (guarded with `config?.grade`), so let it fail
  // silently. Only a products failure blocks the line builder / estimator.
  const catalogError = productsError;
  const catalogEmpty = !!products && !catalogError && activeProducts.length === 0;
  const catalogNotice = catalogError ? (
    <div className="text-center space-y-2 py-2">
      <p className="text-sm text-muted-foreground">
        {t(
          "Маълумотни юклаб бўлмади. Уланишни текширинг.",
          "Failed to load. Check your connection.",
        )}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          refetchProducts();
        }}
      >
        {t("Қайта уриниш", "Retry")}
      </Button>
    </div>
  ) : catalogEmpty ? (
    <div className="text-sm text-muted-foreground">
      {t("Каталог бўш — аввал ўлчам қўшинг", "Catalog is empty — add a size first")}{" "}
      <Link
        href="/gazoblok/catalog"
        className="text-primary hover:underline whitespace-nowrap"
      >
        {t("Каталогга ўтиш", "Open catalog")}
      </Link>
    </div>
  ) : null;

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Boxes className="h-6 w-6 text-muted-foreground" />
            <Bi uz="Газоблок" en="Gazoblok" enClassName="text-muted-foreground font-normal text-base" />
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

      {fromId && draft.isLoading && (
        <div className="text-sm text-muted-foreground">{t("Аввалги буюртма юкланмоқда…", "Loading the earlier order…")}</div>
      )}
      {fromId && draft.isError && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
          {uzPart(draft.error.message, lang)}
        </div>
      )}
      {reorder && (
        <section className="rounded-lg border border-border bg-muted/40 px-4 py-3 space-y-2 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{t("Қайта буюртма", "Reorder")}:</span>
            <Link href={`/gazoblok/orders/${reorder.source.id}`} className={`${NUM} text-primary hover:underline`}>
              {reorder.source.orderNumber}
            </Link>
            <span>{t("асосида", "as the base")}</span>
            <span className="text-muted-foreground">
              · {t("бугунги нархлар; етказиш, чегирма ва сана янгидан киритилади", "today's prices; delivery, discount and date are entered anew")}
            </span>
          </div>
          {reorder.dropped.length > 0 && (
            <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-warning">
              <div className="font-medium">
                {reorder.lines.length === 0
                  ? t("Барча ўлчамлар архивда — ўлчам қўшинг", "Every size is archived — add a size")
                  : t("Архивдаги ўлчамлар қўшилмади", "Archived sizes were not added")}
              </div>
              <ul className="mt-1 space-y-0.5">
                {reorder.dropped.map((d, i) => (
                  <li key={i}>
                    {d.label} — <span className={NUM}>{formatNumber(d.quantity, 0)}</span> {t("та", "pcs")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
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
      <section
        ref={linesSectionRef}
        className="rounded-lg border border-border bg-card overflow-hidden"
      >
        <header className="px-4 py-3 border-b">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {t("Қаторлар", "Lines")}
          </div>
        </header>
        <div className="p-4 space-y-4">
          {/* Add-line row — a form so Enter in the qty field adds the line */}
          {catalogNotice ?? (
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                addLine();
              }}
            >
              <div className="flex-1 min-w-[200px]">
                <FieldLabel uz="Ўлчам" en="Size" />
                <Select
                  value={pickProductId}
                  disabled={productsLoading}
                  onChange={(e) => setPickProductId(e.target.value)}
                >
                  <option value="">
                    {productsLoading
                      ? t("Юкланмоқда…", "Loading…")
                      : t("Ўлчам танланг…", "Pick a size…")}
                  </option>
                  {activeProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} — {formatNumber(Number(p.pricePerBlock), 0)} UZS/
                      {t("та", "block")}
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
                type="submit"
                variant="secondary"
                disabled={!pickProductId || Math.floor(Number(pickQty)) <= 0}
              >
                <Plus className="h-4 w-4 mr-1" />
                {t("Қўшиш", "Add")}
              </Button>
            </form>
          )}

          {/* Lines table */}
          {lines.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">
              {reorder && reorder.lines.length === 0
                ? t("Барча ўлчамлар архивда — юқоридан ўлчам қўшинг.", "Every size is archived — add a size above.")
                : t("Ҳали қатор қўшилмаган.", "No lines yet — add a size and quantity above.")}
            </div>
          ) : (
            <>
            <table className="hidden sm:table w-full text-sm">
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
                {lines.map((l, i) => {
                  const note = reorder?.notes[l.productId];
                  return (
                  <tr key={l.productId}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{l.productLabel}</div>
                      {note && (
                        <div className="text-xs text-muted-foreground">
                          {t("олдин юкланган", "loaded last time")}{" "}
                          <span className={NUM}>{formatNumber(note.previousLoaded, 0)}</span>
                        </div>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right ${NUM}`}>
                      {formatNumber(l.unitPrice, 0)}
                      {note?.previousUnitPrice != null && (
                        <div className="text-xs text-muted-foreground">
                          {t("олдин", "was")} {formatNumber(note.previousUnitPrice, 0)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="text"
                        inputMode="numeric"
                        aria-label={t("Сони", "Qty")}
                        className={`h-11 md:h-9 w-20 ml-auto text-right ${NUM}`}
                        placeholder="0"
                        value={l.quantity || ""}
                        onChange={(e) => setLineQty(i, e.target.value)}
                      />
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold ${NUM}`}>
                      {formatNumber(lineTotal(l.unitPrice, l.quantity), 0)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        aria-label={t("Ўчириш", "Remove")}
                        onClick={() => removeLine(i)}
                        className="inline-flex items-center justify-center h-11 w-11 md:h-7 md:w-7 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Phone: stacked rows instead of a clipped table */}
            <ul className="sm:hidden divide-y border-y text-sm">
              {lines.map((l, i) => {
                const note = reorder?.notes[l.productId];
                return (
                  <li key={l.productId} className="py-2.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">{l.productLabel}</div>
                        {note && (
                          <div className="text-xs text-muted-foreground">
                            {t("олдин юкланган", "loaded last time")}{" "}
                            <span className={NUM}>{formatNumber(note.previousLoaded, 0)}</span>
                            {note.previousUnitPrice != null && (
                              <>
                                {" · "}
                                {t("олдин", "was")} <span className={NUM}>{formatNumber(note.previousUnitPrice, 0)}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label={t("Ўчириш", "Remove")}
                        onClick={() => removeLine(i)}
                        className="inline-flex shrink-0 items-center justify-center h-11 w-11 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-muted-foreground ${NUM}`}>{formatNumber(l.unitPrice, 0)} ×</span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        aria-label={t("Сони", "Qty")}
                        className={`h-11 w-24 text-right ${NUM}`}
                        placeholder="0"
                        value={l.quantity || ""}
                        onChange={(e) => setLineQty(i, e.target.value)}
                      />
                      <span className="text-muted-foreground">{t("та", "pcs")}</span>
                      <span className={`ml-auto font-semibold ${NUM}`}>
                        {formatNumber(lineTotal(l.unitPrice, l.quantity), 0)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            </>
          )}
        </div>
      </section>

      {/* Wall calculator */}
      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="p-4">
          {catalogNotice ?? (
            <GazoblokWallCalculator
              products={calcProducts}
              onAddToOrder={addPerSizeToOrder}
              onSnapshotChange={setWallSnapshot}
            />
          )}
        </div>
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
              type="text"
              inputMode="decimal"
              className={NUM}
              placeholder="0"
              value={discountPercent}
              disabled={discountAmount.trim() !== ""}
              onChange={(e) => setDiscountPercent(e.target.value)}
            />
            <BadNumber show={pctNum === null} />
            {reorder && reorder.hints.discountPercent > 0 && (
              <Hint>
                {t("олдин", "last time")}: <span className={NUM}>{formatNumber(reorder.hints.discountPercent, 2)}</span> %
              </Hint>
            )}
          </div>
          <div>
            <FieldLabel uz="Чегирма (UZS)" en="Discount (UZS)" />
            <Input
              type="text"
              inputMode="decimal"
              className={NUM}
              placeholder="0"
              value={discountAmount}
              disabled={discountPercent.trim() !== ""}
              onChange={(e) => setDiscountAmount(e.target.value)}
            />
            <BadNumber show={discNum === null} />
          </div>
          <div>
            <FieldLabel uz="Етказиб бериш (UZS)" en="Delivery (UZS)" />
            <Input
              type="text"
              inputMode="decimal"
              className={NUM}
              placeholder="0"
              value={deliveryCost}
              onChange={(e) => setDeliveryCost(e.target.value)}
            />
            <BadNumber show={deliveryNum === null} />
            {reorder && reorder.hints.deliveryCost > 0 && (
              <Hint>
                {t("олдин", "last time")}: <span className={NUM}>{formatNumber(reorder.hints.deliveryCost, 0)}</span> UZS ·{" "}
                {t("мижоз билан қайта келишинг", "agree it with the client again")}
              </Hint>
            )}
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
              type="text"
              inputMode="decimal"
              className={NUM}
              placeholder="0"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
            />
            <BadNumber show={paidTyped === null} />
            {paidExceedsTotal && (
              <p className="mt-1 text-xs text-warning">
                {t(
                  "Тўлов суммаси жамидан ошиб кетди",
                  "Paid amount exceeds the total",
                )}
              </p>
            )}
          </div>
          <div>
            <FieldLabel uz="Тўлов усули" en="Payment method" />
            <Select
              value={paymentMethod}
              required={paidPositive}
              disabled={!paidPositive}
              onChange={(e) =>
                setPaymentMethod(e.target.value as PaymentMethod | "")
              }
            >
              <option value="">{t("Танланг…", "Select…")}</option>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([value, [uz, en]]) => (
                <option key={value} value={value}>
                  {t(uz, en)}
                </option>
              ))}
            </Select>
            {methodMissing && (
              <p className="mt-1 text-xs text-destructive">
                {t(
                  "Тўлов усулини танланг",
                  "Payment method is required when an amount is paid",
                )}
              </p>
            )}
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
            <span className={`text-2xl font-bold ${NUM}`}>
              {formatNumber(totals.total, 0)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                UZS
              </span>
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
            <span>
              {t("Жами блоклар", "Total blocks")}:{" "}
              <span className={`font-medium text-foreground ${NUM}`}>
                {formatNumber(totals.totalBlocks, 0)}
              </span>
            </span>
            <span>
              м³:{" "}
              <span className={`font-medium text-foreground ${NUM}`}>
                {formatNumber(totalVolumeM3, 3)}
              </span>
            </span>
          </div>
        </div>

        <Button
          className="w-full"
          size="lg"
          disabled={!canPlace}
          onClick={() => placeOrder.mutate(undefined)}
        >
          {placeOrder.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Boxes className="h-4 w-4 mr-2" />
          )}
          {t("Буюртма бериш", "Place order")}
        </Button>
      </section>

      <Dialog open={!!nameAsk} onOpenChange={(v) => { if (!v && !placeOrder.isPending) setNameAsk(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Бу рақам бошқа ном билан сақланган", "This phone is saved under another name")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t(
              "Мижоз номи ўзгарса, унинг аввалги буюртмаларида ҳам ўзгаради.",
              "Renaming the client also changes the name on their earlier orders.",
            )}
          </p>
          <div className="grid gap-2 text-sm">
            <div><span className="text-muted-foreground">{t("Сақланган", "Saved")}: </span><b>{nameAsk?.saved}</b></div>
            <div><span className="text-muted-foreground">{t("Киритилган", "Typed")}: </span><b>{nameAsk?.typed}</b></div>
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Button className="min-h-[44px] flex-1" disabled={placeOrder.isPending} onClick={() => placeOrder.mutate("keep")}>
              {t("Сақланган номни қолдириш", "Keep the saved name")}
            </Button>
            <Button variant="outline" className="min-h-[44px] flex-1" disabled={placeOrder.isPending} onClick={() => placeOrder.mutate("update")}>
              {t("Номни янгилаш", "Update the name")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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

function BadNumber({ show }: { show: boolean }) {
  const t = useT();
  if (!show) return null;
  return (
    <p className="mt-1 text-xs text-destructive">
      {t("Сонни текширинг: масалан 1 000 000 ёки 7,5", "Check the number: e.g. 1 000 000 or 7,5")}
    </p>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-muted-foreground">{children}</p>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={NUM}>{value}</span>
    </div>
  );
}
