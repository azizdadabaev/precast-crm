"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Archive, Boxes, Keyboard, RotateCcw } from "lucide-react";
import { api, ApiError } from "@/lib/fetcher";
import { cn, formatNumber } from "@/lib/utils";
import { useLang, useT } from "@/lib/i18n";
import { PAYMENT_METHOD_LABELS } from "@/lib/gazoblok-labels";
import { parseMoney, uzPart } from "@/lib/gazoblok-text";
import { clientNamePlan } from "@/lib/gazoblok-quantities";
import type { ReorderDraft } from "@/lib/gazoblok-reorder";
import { optionalNumber, reorderPrefill, type ReorderPrefill } from "@/lib/gazoblok-reorder-form";
import {
  addPerSize,
  badQtyIds,
  discountInput,
  formLines,
  moneyText,
  orderProblems,
  parseDmy,
  paymentPreview,
  placementKey,
  qtyFromLines,
  scheduledAtIso,
  type DiscountMode,
  type Problem,
  type QtyMap,
} from "@/lib/gazoblok-order-form";
import { blockVolumeM3, orderTotal, type PerSizeResult } from "@/services/gazoblok-engine";
import { GazoblokWallCalculator, type CalcProduct, type WallCalcSnapshot } from "@/components/gazoblok/GazoblokWallCalculator";
import { ClientSection } from "@/components/gazoblok/order-form/ClientSection";
import { BlocksSection } from "@/components/gazoblok/order-form/BlocksSection";
import { DeliverySection } from "@/components/gazoblok/order-form/DeliverySection";
import { PaymentSection } from "@/components/gazoblok/order-form/PaymentSection";
import { MobilePlaceBar, OrderLedger } from "@/components/gazoblok/order-form/OrderLedger";
import { PlacedScreen } from "@/components/gazoblok/order-form/PlacedScreen";
import { NUM } from "@/components/gazoblok/order-form/ui";
import { useClientLookup } from "@/components/gazoblok/order-form/useClientLookup";
import type { FormProduct, PaymentMethod, PlacedOrder } from "@/components/gazoblok/order-form/types";

// ── API types ───────────────────────────────────────────────────
// Decimal fields arrive from Prisma as JSON STRINGS — always wrap with Number() before any math.
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

function volumeOf(p: Product): number {
  try {
    return blockVolumeM3({
      lengthM: Number(p.lengthM),
      heightM: Number(p.heightM),
      thicknessM: Number(p.thicknessM),
      pricePerBlock: Number(p.pricePerBlock),
    });
  } catch {
    return 0;
  }
}

// `?from=<orderId>` reads the URL, which needs a Suspense boundary for next build.
export default function GazoblokNewOrderPage() {
  const t = useT();
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>}>
      <NewOrderRoute />
    </Suspense>
  );
}

/** A fresh form per source order and per «Янги буюртма» press. */
function NewOrderRoute() {
  const fromId = useSearchParams().get("from");
  const [round, setRound] = useState(0);
  return <NewOrderForm key={`${fromId ?? ""}:${round}`} fromId={fromId} onFresh={() => setRound((n) => n + 1)} />;
}

const ELEMENT_FOR: Record<Problem["key"], string> = {
  phone: "f-phone",
  name: "f-name",
  nameDecision: "f-name-decision",
  lines: "",
  qty: "",
  date: "f-date",
  delivery: "f-delivery",
  discount: "f-discount",
  paid: "f-paid",
  paidOverTotal: "f-paid",
  method: "f-method",
};

function NewOrderForm({ fromId, onFresh }: { fromId: string | null; onFresh: () => void }) {
  const t = useT();
  const lang = useLang();
  const router = useRouter();

  const products = useQuery<Product[]>({ queryKey: ["gazoblok-products"], queryFn: () => api("/api/gazoblok/products") });
  // Config only supplies the cosmetic grade label: its failure must never block order entry.
  const { data: config } = useQuery<{ grade?: string }>({ queryKey: ["gazoblok-config"], queryFn: () => api("/api/gazoblok/config") });
  const { data: me } = useQuery<{ permissions: string[] }>({ queryKey: ["me"], queryFn: () => api("/api/auth/me") });
  const perms = me?.permissions ?? [];
  const canConfirm = perms.includes("payment.confirm");
  const canRecord = perms.includes("payment.record");

  const sizes = useMemo<FormProduct[]>(
    () =>
      (products.data ?? [])
        .filter((p) => p.active)
        .map((p) => ({
          id: p.id,
          label: p.label,
          lengthM: Number(p.lengthM),
          heightM: Number(p.heightM),
          thicknessM: Number(p.thicknessM),
          pricePerBlock: Number(p.pricePerBlock),
          volumeM3: volumeOf(p),
          stock: p.stock?.quantity ?? null,
          lowStockThreshold: p.lowStockThreshold,
        })),
    [products.data],
  );
  // The calculator memoizes on `products` identity: keep this a stable reference.
  const calcProducts = useMemo<CalcProduct[]>(
    () => sizes.map((p) => ({ id: p.id, label: p.label, lengthM: p.lengthM, heightM: p.heightM, thicknessM: p.thicknessM, pricePerBlock: p.pricePerBlock })),
    [sizes],
  );

  // ── Form state ──
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState<QtyMap>({});
  const [calcOpen, setCalcOpen] = useState(false);
  const [wallSnapshot, setWallSnapshot] = useState<WallCalcSnapshot | null>(null);
  const [dateRaw, setDateRaw] = useState("");
  const [deliveryRaw, setDeliveryRaw] = useState("");
  const [discountMode, setDiscountMode] = useState<DiscountMode>("percent");
  const [discountRaw, setDiscountRaw] = useState("");
  const [paidRaw, setPaidRaw] = useState("");
  // No default method: the server rejects a paid amount without one, so the operator picks consciously.
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [receiptUrls, setReceiptUrls] = useState<string[]>([]);
  const [pressed, setPressed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ saved: string; typed: string; value: "keep" | "update" } | null>(null);
  const [serverSaved, setServerSaved] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ order: PlacedOrder; paid: number; pending: boolean } | null>(null);

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
    setPhone(p.client.phone);
    setName(p.client.name);
    setAddress(p.client.address);
    setQty(qtyFromLines(p.lines));
    setReorder({ ...p, source: draft.data.source });
  }, [draft.data]);

  // ── Phone lookup: the known client fills an empty name/address, never overwrites a typed one ──
  const lookup = useClientLookup(phone, perms.includes("client.view"));
  const known = lookup.status === "known" ? lookup.client : null;
  const lastFilled = useRef<string | null>(null);
  useEffect(() => {
    if (!known || lastFilled.current === known.id) return;
    lastFilled.current = known.id;
    setName((n) => (n.trim() ? n : known.name));
    setAddress((a) => (a.trim() ? a : known.address ?? ""));
  }, [known]);

  // The phone's client is saved under another name → asked inline (the 409 is the fallback).
  const savedName = known?.name ?? serverSaved;
  const conflictSaved =
    savedName && name.trim() && clientNamePlan(savedName, name) === "ask" ? savedName : null;
  const decisionValue =
    conflictSaved && decision && decision.saved === conflictSaved && decision.typed === name.trim() ? decision.value : null;

  // ── Numbers: «1 000 000» and «7,5» read; blank = not sent; unreadable = blocks placing ──
  const lines = useMemo(() => formLines(sizes, qty), [sizes, qty]);
  const badIds = useMemo(() => badQtyIds(sizes, qty), [sizes, qty]);
  const discount = discountInput(discountMode, discountRaw);
  const deliveryNum = optionalNumber(deliveryRaw, parseMoney);
  const paidTyped = optionalNumber(paidRaw, parseMoney);
  const paid = paidTyped ?? 0;
  const scheduledYmd = dateRaw.trim() === "" ? null : parseDmy(dateRaw);
  const dateBad = dateRaw.trim() !== "" && scheduledYmd === null;

  // ── Live totals (preview only — the server recomputes authoritatively) ──
  const totals = useMemo(
    () =>
      orderTotal(
        lines.map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity })),
        { ...(discount ?? {}), deliveryCost: deliveryNum ?? undefined },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, discountMode, discountRaw, deliveryNum],
  );
  const volumeM3 = useMemo(() => {
    const vol = new Map(sizes.map((s) => [s.id, s.volumeM3]));
    return lines.reduce((s, l) => s + (vol.get(l.productId) ?? 0) * l.quantity, 0);
  }, [lines, sizes]);
  const preview = paymentPreview({ paid, total: totals.total, canConfirm });

  const problems = orderProblems({
    phone,
    name,
    nameDecisionNeeded: !!conflictSaved && !decisionValue,
    lineCount: lines.length,
    badQty: badIds.length > 0,
    dateBad,
    deliveryBad: deliveryNum === null,
    discountBad: discount === null,
    paidBad: paidTyped === null,
    paid,
    total: totals.total,
    methodChosen: method !== "",
  });

  const jump = useCallback(
    (p: Problem) => {
      const id =
        p.key === "qty" ? `f-qty-${badIds[0]}` : p.key === "lines" ? (sizes[0] ? `f-qty-${sizes[0].id}` : "sec-blocks") : ELEMENT_FOR[p.key];
      const all = Array.from(document.querySelectorAll<HTMLElement>(`[id="${id}"]`));
      // Desktop table and phone list both render the qty inputs: take the visible one.
      const el = all.find((e) => e.offsetParent !== null) ?? all[0];
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const focusable = el.matches("input,button") ? el : el.querySelector<HTMLElement>("input,button");
      focusable?.focus({ preventScroll: true });
    },
    [badIds, sizes],
  );

  const placeKey = useRef<{ body: string; key: string } | null>(null);
  const placeOrder = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({
        clientName: name.trim(),
        clientNameDecision: decisionValue ?? undefined,
        clientPhone: phone.trim(),
        clientAddress: address.trim() || undefined,
        lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        ...(discount ?? {}),
        deliveryCost: deliveryNum ?? undefined,
        scheduledAt: scheduledYmd ? scheduledAtIso(scheduledYmd) : undefined,
        notes: notes.trim() || undefined,
        paidAmount: paid > 0 ? paid : undefined,
        paymentMethod: paid > 0 && method !== "" ? method : undefined,
        receiptUrls: paid > 0 && receiptUrls.length ? receiptUrls : undefined,
        wallEstimate: wallSnapshot ?? undefined,
        sourceOrderId: reorder?.source.id,
      });
      placeKey.current = placementKey(placeKey.current, body, () => crypto.randomUUID());
      return api<PlacedOrder>("/api/gazoblok/orders", {
        method: "POST",
        body,
        headers: { "Idempotency-Key": placeKey.current.key },
      });
    },
    onSuccess: (created) => {
      placeKey.current = null;
      setError(null);
      setPlaced({ order: created, paid, pending: paid > 0 && !canConfirm });
      document.querySelector("main")?.scrollTo({ top: 0 });
    },
    onError: (e: Error) => {
      // A server answer is final for this key; only a lost connection retries with the same key.
      if (e instanceof ApiError) placeKey.current = null;
      const details =
        e instanceof ApiError ? (e.payload as { details?: { code?: string; savedName?: string } })?.details : undefined;
      if (details?.code === "CLIENT_NAME_MISMATCH") {
        // Lookup unavailable (no client.view) or raced: ask the same inline question now.
        setError(null);
        setServerSaved(details.savedName ?? "");
        setPressed(true);
        setTimeout(() => document.getElementById("f-name-decision")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
        return;
      }
      console.error("[gazoblok] place order failed:", e);
      setError(uzPart(e.message, lang));
      setTimeout(() => document.getElementById("place-error")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    },
  });

  const place = () => {
    if (placeOrder.isPending) return;
    setPressed(true);
    if (problems.length) {
      jump(problems[0]);
      return;
    }
    placeOrder.mutate();
  };
  const placeRef = useRef(place);
  placeRef.current = place;

  // Ctrl+Enter places; Alt+H opens the wall estimator.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        placeRef.current();
      } else if (e.altKey && (e.key === "h" || e.key === "H" || e.code === "KeyH")) {
        e.preventDefault();
        setCalcOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const addFromCalculator = (perSize: PerSizeResult[]) => {
    setQty((q) => addPerSize(q, perSize, new Set(sizes.map((s) => s.id))));
    document.getElementById("sec-blocks")?.querySelector("table, ul")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const header = (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[24px] font-bold leading-tight tracking-tight md:text-[26px]">{t("Янги буюртма", "New order")}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          <Boxes className="h-4 w-4" strokeWidth={1.75} />
          {t("Газоблок", "Gazoblok")}
          {config?.grade && (
            <>
              {" · "}
              {t("маркаси", "grade")} <span className="font-semibold text-foreground">{config.grade}</span>
            </>
          )}
        </div>
      </div>
      <div className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
        <Keyboard className="h-4 w-4" strokeWidth={1.75} />
        <span>
          <b className={cn(NUM, "text-foreground")}>{"Tab"}</b> {t("кейинги майдон", "next field")} ·{" "}
          <b className={cn(NUM, "text-foreground")}>{"Ctrl+Enter"}</b> {t("буюртма бериш", "place order")}
        </span>
      </div>
    </div>
  );

  if (placed) {
    const o = placed.order;
    return (
      <div className="max-w-[1240px]">
        {header}
        <PlacedScreen
          order={o}
          paidAtPlacement={placed.paid}
          pendingPayment={placed.pending}
          canChat={perms.includes("inbox.access")}
          onOpen={() => router.push(`/gazoblok/orders/${o.id}`)}
          onNew={() => {
            router.push("/gazoblok/new");
            onFresh();
          }}
          onAgain={() => router.push(`/gazoblok/new?from=${o.id}`)}
        />
      </div>
    );
  }

  const methodLabel = method ? t(...PAYMENT_METHOD_LABELS[method]) : null;
  const ledger = (
    <OrderLedger
      className="xl:sticky xl:top-6"
      clientLine={
        name.trim() || phone.trim()
          ? `${conflictSaved ? `${conflictSaved} / ${name.trim()}` : name.trim() || t("Исмсиз", "No name")}${phone.trim() ? ` · ${phone.trim()}` : ""}`
          : null
      }
      lines={lines}
      totals={{ ...totals, volumeM3 }}
      discountBad={discount === null}
      paid={paid}
      methodLabel={methodLabel}
      state={preview.state}
      pendingPayment={preview.payment === "pending"}
      debt={preview.debt}
      problems={problems}
      pressed={pressed}
      pending={placeOrder.isPending}
      onPlace={place}
      onJump={jump}
    />
  );

  return (
    <div className="max-w-[1240px] pb-28 xl:pb-0">
      {header}

      {fromId && draft.isLoading && (
        <div className="mb-5 text-sm text-muted-foreground">{t("Аввалги буюртма юкланмоқда…", "Loading the earlier order…")}</div>
      )}
      {fromId && draft.isError && (
        <div className="mb-5 rounded border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {uzPart(draft.error.message, lang)}
        </div>
      )}
      {reorder && (
        <section className="mb-5 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">
                {t("Қайта буюртма", "Reorder")} ·{" "}
                <Link href={`/gazoblok/orders/${reorder.source.id}`} className={cn(NUM, "text-primary hover:underline")}>
                  {reorder.source.orderNumber}
                </Link>{" "}
                {t("асосида", "as the base")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("Бугунги нархлар. Етказиш, чегирма ва сана янгидан киритилади.", "Today's prices. Delivery, discount and date are entered anew.")}
              </div>
            </div>
          </div>
          {reorder.dropped.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning md:ml-auto">
              <Archive className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
              <div>
                <b>
                  {reorder.lines.length === 0
                    ? t("Барча ўлчамлар архивда — ўлчам қўшинг", "Every size is archived — add a size")
                    : t("Архивдаги ўлчамлар қўшилмади", "Archived sizes were not added")}
                  :
                </b>{" "}
                {reorder.dropped.map((d, i) => (
                  <span key={i}>
                    {i > 0 && "; "}
                    {d.label} — <span className={NUM}>{formatNumber(d.quantity, 0)}</span> {t("та", "pcs")}
                  </span>
                ))}
                . {t("Ўрнига ўлчам танланг.", "Pick a size instead.")}
              </div>
            </div>
          )}
        </section>
      )}

      {error && (
        <div id="place-error" role="alert" className="mb-5 rounded border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-6">
        <div className="min-w-0 space-y-5">
          <ClientSection
            phone={phone}
            onPhone={(v) => {
              setPhone(v);
              setServerSaved(null);
            }}
            name={name}
            onName={setName}
            lookup={lookup}
            conflictSaved={conflictSaved}
            decision={decisionValue}
            onDecision={(value) => conflictSaved && setDecision({ saved: conflictSaved, typed: name.trim(), value })}
            onRepeatLast={(id) => router.push(`/gazoblok/new?from=${id}`)}
            showMissing={pressed}
            isReorder={!!reorder}
          />
          <BlocksSection
            products={sizes}
            loading={products.isLoading}
            failed={products.isError}
            onRetry={() => products.refetch()}
            qty={qty}
            onQty={(id, raw) => setQty((q) => ({ ...q, [id]: raw }))}
            notes={reorder?.notes ?? {}}
            badIds={badIds}
            showErrors={pressed}
            hasLines={lines.length > 0}
            calcOpen={calcOpen}
            onToggleCalc={() => setCalcOpen((o) => !o)}
            calculator={
              calcProducts.length > 0 ? (
                <GazoblokWallCalculator variant="embedded" products={calcProducts} onAddToOrder={addFromCalculator} onSnapshotChange={setWallSnapshot} />
              ) : null
            }
          />
          <DeliverySection
            dateRaw={dateRaw}
            onDate={setDateRaw}
            deliveryCost={deliveryRaw}
            onDeliveryCost={setDeliveryRaw}
            deliveryBad={deliveryNum === null}
            address={address}
            onAddress={setAddress}
            notes={notes}
            onNotes={setNotes}
            previousDelivery={reorder ? reorder.hints.deliveryCost : null}
            showErrors={pressed}
          />
          <PaymentSection
            discountMode={discountMode}
            onDiscountMode={(m) => {
              // One discount at a time: switching % ↔ UZS starts the field over.
              if (m !== discountMode) setDiscountRaw("");
              setDiscountMode(m);
            }}
            discountRaw={discountRaw}
            onDiscountRaw={setDiscountRaw}
            discountBad={discount === null}
            discountApplied={{ amount: totals.discountAmount, percent: totals.discountPercent }}
            previousDiscountPercent={reorder ? reorder.hints.discountPercent : null}
            paidRaw={paidRaw}
            onPaidRaw={setPaidRaw}
            paidBad={paidTyped === null}
            paid={paid}
            total={totals.total}
            onPayFull={() => setPaidRaw(moneyText(totals.total))}
            method={method}
            onMethod={setMethod}
            receiptUrls={receiptUrls}
            onReceiptUrls={setReceiptUrls}
            canRecord={canRecord}
            canConfirm={canConfirm}
            busy={placeOrder.isPending}
            showErrors={pressed}
          />
        </div>
        {ledger}
      </div>

      <MobilePlaceBar total={totals.total} blocks={totals.totalBlocks} ready={problems.length === 0} pending={placeOrder.isPending} onPlace={place} />
    </div>
  );
}
