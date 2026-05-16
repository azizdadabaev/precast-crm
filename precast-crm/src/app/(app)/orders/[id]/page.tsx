"use client";

import { useRef, useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Printer,
  Ban,
  Loader2,
  Calendar,
  CheckCircle2,
  Truck,
  Plus,
  Pencil,
  Package,
  Split,
} from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import { DeliveryProofDialog, type DeliveryFormPayload } from "@/components/orders/DeliveryProofDialog";
import { AddPaymentDialog } from "@/components/payments/AddPaymentDialog";
import { ShareCalculationButton } from "@/components/ShareCalculationButton";
import { SendToBlenderButton } from "@/components/blender-bridge/SendToBlenderButton";
import { DrawingsSection } from "@/components/blender-bridge/DrawingsSection";
import { useT } from "@/lib/i18n";
import { useThemeStore } from "@/store/theme";
import { addressToCyrillic } from "@/lib/regions";
import { LoadTruckDialog } from "@/components/orders/LoadTruckDialog";
import { ShipmentsSection } from "@/components/orders/ShipmentsSection";
import type { BeamGroup } from "@/lib/weight-distributor";

const WEEKDAY_UZ = ["Якшанба", "Душанба", "Сешанба", "Чоршанба", "Пайшанба", "Жума", "Шанба"];

function displayRoomName(name: string | null): string {
  if (!name) return "";
  return name.replace(/^Room\s+(\d+)$/i, "Хона $1");
}

function displayBearing(bearing: string): string {
  const cm = Math.round(Number(bearing) * 100);
  return `${cm} см`;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: "PLACED" | "IN_PRODUCTION" | "LOADED" | "DISPATCHED" | "DELIVERED" | "CANCELED";
  paymentState: "AWAITING_PAYMENT" | "PARTIALLY_PAID" | "FULLY_PAID";
  confirmedPaid: string;
  roomsSubtotal: string;
  discountPercent: string;
  discountAmount: string;
  deliveryCost: string;
  otherCost: string;
  totalPrice: string;
  totalArea: string;
  totalBlocks: number;
  totalBeams: number;
  scheduledAt: string;
  placedAt: string;
  productionStartedAt: string | null;
  deliveredAt: string | null;
  paidAt: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  deliveryProofUrl: string | null;
  deliveryProofUploadedAt: string | null;
  loadedPhotoUrl: string | null;
  loadedAt: string | null;
  notes: string | null;
  shipments: Array<{
    id: string;
    number: number;
    status: "PENDING" | "LOADED" | "DISPATCHED" | "DELIVERED";
    loadedBeams: Record<string, number> | null;
    loadedBlocks: number | null;
    loadedPhotoUrl: string | null;
    loadedAt: string | null;
    driverWillCollectCash: boolean;
    cashToCollect: string | null;
    truckIdentifier: string | null;
    dispatchedAt: string | null;
    deliveredAt: string | null;
    notes: string | null;
    driver: { id: string; name: string; phone: string } | null;
    dispatchedBy: { id: string; name: string } | null;
  }>;
  client: { id: string; name: string; phone: string; address: string | null };
  project: {
    id: string;
    name: string | null;
    calculations: Array<{
      id: string;
      name: string | null;
      innerWidth: string;
      innerLength: string;
      pattern: "GB" | "BGB" | "GBG";
      patternAuto: "GB" | "BGB" | "GBG";
      bearing: string;
      beamLength: string;
      blocksPerRow: number;
      beamCount: number;
      blockRows: number;
      totalBlocks: number;
      monolithLength: string;
      monolithArea: string;
      m2Price: string;
      m2PriceOverride: boolean;
      m2PriceReason: string | null;
      subtotal: string;
    }>;
  };
  events: Array<{
    id: string;
    type: string;
    message: string | null;
    payload: unknown;
    createdAt: string;
    actor: { id: string; name: string; email: string } | null;
  }>;
  dispatch: {
    id: string;
    truckIdentifier: string | null;
    expectedCollection: string;
    notes: string | null;
    dispatchedAt: string;
    returnedAt: string | null;
    driver: { id: string; name: string; phone: string } | null;
    dispatchedBy: { id: string; name: string } | null;
  } | null;
  payments: Array<{
    id: string;
    amount: string;
    method: "CASH" | "BANK_TRANSFER" | "CLICK" | "PAYME" | "OTHER";
    status: "PENDING_CONFIRMATION" | "CONFIRMED" | "REJECTED";
    collectedAt: string | null;
    recordedAt: string;
    handedOverToOfficeAt: string | null;
    confirmedAt: string | null;
    rejectedAt: string | null;
    rejectionReason: string | null;
    adjustmentNote: string | null;
    notes: string | null;
    collectedByDriver: { id: string; name: string } | null;
    recordedBy: { id: string; name: string } | null;
    handedOverTo: { id: string; name: string } | null;
    confirmedBy: { id: string; name: string } | null;
    rejectedBy: { id: string; name: string } | null;
  }>;
}

const STATUS_FLOW: Array<{ key: OrderDetail["status"]; uz: string; en: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "PLACED",    uz: "Қабул қилинди", en: "Accepted", icon: CheckCircle2 },
  { key: "LOADED",    uz: "Юкланди",       en: "Loaded",   icon: Package },
  { key: "DELIVERED", uz: "Етказилди",     en: "Delivered", icon: Truck },
];

const PATTERN_LABEL: Record<"GB" | "BGB" | "GBG", string> = {
  GB: "Г-Б",
  BGB: "Б-Г-Б",
  GBG: "Г-Б-Г",
};

const PAYMENT_STATE_BADGE: Record<OrderDetail["paymentState"], { label: string; cls: string }> = {
  AWAITING_PAYMENT: { label: "Awaiting payment", cls: "bg-amber-100 text-amber-800" },
  PARTIALLY_PAID:   { label: "Partially paid",   cls: "bg-sky-100 text-sky-800" },
  FULLY_PAID:       { label: "Fully paid",       cls: "bg-emerald-100 text-emerald-800" },
};

const PAYMENT_STATUS_BADGE: Record<OrderDetail["payments"][number]["status"], { label: string; cls: string }> = {
  PENDING_CONFIRMATION: { label: "Pending",   cls: "bg-amber-100 text-amber-800" },
  CONFIRMED:            { label: "Confirmed", cls: "bg-emerald-100 text-emerald-800" },
  REJECTED:             { label: "Rejected",  cls: "bg-rose-100 text-rose-800" },
};

function translatePaymentState(s: OrderDetail["paymentState"], t: (uz: string, en: string) => string): string {
  switch (s) {
    case "AWAITING_PAYMENT": return t("Тўлов кутилмоқда", "Awaiting payment");
    case "PARTIALLY_PAID":   return t("Қисман тўланган", "Partially paid");
    case "FULLY_PAID":       return t("Тўлиқ тўланган", "Fully paid");
  }
}

function translatePaymentBadgeStatus(s: OrderDetail["payments"][number]["status"], t: (uz: string, en: string) => string): string {
  switch (s) {
    case "PENDING_CONFIRMATION": return t("Кутилмоқда", "Pending");
    case "CONFIRMED":            return t("Тасдиқланган", "Confirmed");
    case "REJECTED":             return t("Рад этилган", "Rejected");
  }
}

export default function OrderDetailPage() {
  const t = useT();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelPassword, setCancelPassword] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [proofOpen, setProofOpen] = useState(false);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [loadTruckOpen, setLoadTruckOpen] = useState(false);
  const [splitLoading, setSplitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDark = useThemeStore((s) => s.theme) === "dark";
  const [mobileCalcOpen, setMobileCalcOpen] = useState(false);
  /** Captured by ShareCalculationButton — wraps the header card +
   *  calculation summary card so the operator can ship a one-shot
   *  image of the order to the customer. */
  const shareRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const mirrorScrollRef = useRef<HTMLDivElement>(null);
  const mirrorSpacerRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    const sync = () => {
      if (mirrorSpacerRef.current) mirrorSpacerRef.current.style.width = `${el.scrollWidth}px`;
    };
    sync();
    const obs = new ResizeObserver(sync);
    obs.observe(el);
    return () => obs.disconnect();
  });

  const { data: order, isLoading } = useQuery<OrderDetail>({
    queryKey: ["order", params.id],
    queryFn: () => api(`/api/orders/${params.id}`),
  });

  // Permission check for the owner-only Blender bridge button. Light
  // shape — we only care whether `blender.bridge` is in the array.
  const { data: me } = useQuery<{ permissions: string[] }>({
    queryKey: ["me"],
    queryFn: () => api("/api/auth/me"),
  });
  const canUseBlender = me?.permissions?.includes("blender.bridge") ?? false;

  const updateStatus = useMutation({
    mutationFn: (status: OrderDetail["status"]) =>
      api<OrderDetail>(`/api/orders/${params.id}`, {
        method: "PATCH",
        json: { status },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["order", params.id] }),
    onError: (e: Error) => setError(e.message),
  });

  /** Upload the delivery photo + cash collection in one shot. */
  async function uploadDeliveryProof(payload: DeliveryFormPayload) {
    const fd = new FormData();
    fd.append("file", payload.file);
    fd.append("cashAmount", String(payload.cashAmount));
    fd.append("noCashCollected", String(payload.noCashCollected));
    fd.append("noCashCollectedNote", payload.noCashCollectedNote ?? "");
    fd.append("driverReturned", String(payload.driverReturned));
    const res = await fetch(`/api/orders/${params.id}/delivery-proof`, {
      method: "POST",
      body: fd,
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!res.ok || !json.ok) {
      throw new Error(json.error ?? "Upload failed");
    }
    setProofOpen(false);
    qc.invalidateQueries({ queryKey: ["order", params.id] });
  }

  const handoverPayment = useMutation({
    mutationFn: (paymentId: string) =>
      api(`/api/payments/${paymentId}/handover`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["order", params.id] }),
    onError: (e: Error) => setError(e.message),
  });

  const cancelOrder = useMutation({
    mutationFn: () =>
      api(`/api/orders/${params.id}/cancel`, {
        method: "POST",
        json: { reason: cancelReason || null, password: cancelPassword || null },
      }),
    onSuccess: () => {
      setCancelOpen(false);
      qc.invalidateQueries({ queryKey: ["order", params.id] });
    },
    onError: (e: Error) => setError(e.message),
  });

  // Must be before the early return — hooks cannot be called conditionally.
  const beamGroups: BeamGroup[] = useMemo(() => {
    if (!order) return [];
    const map = new Map<string, number>();
    for (const c of order.project.calculations) {
      const key = Number(c.beamLength).toFixed(1);
      map.set(key, (map.get(key) ?? 0) + c.beamCount);
    }
    return Array.from(map.entries()).map(([beamLength, totalCount]) => ({ beamLength, totalCount }));
  }, [order]);

  if (isLoading || !order) return <div className="p-4 text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>;

  const isCanceled = order.status === "CANCELED";

  const calcTotals = order.project.calculations.reduce(
    (acc, c) => ({
      blocks: acc.blocks + c.totalBlocks,
      beams: acc.beams + c.beamCount,
      monolithLength: acc.monolithLength + Number(c.monolithLength),
      monolithArea: acc.monolithArea + Number(c.monolithArea),
    }),
    { blocks: 0, beams: 0, monolithLength: 0, monolithArea: 0 },
  );
  const totalNum = Number(order.totalPrice);
  const paidNum = Number(order.confirmedPaid);
  const remainingNum = Math.max(0, totalNum - paidNum);
  const fullyPaid = paidNum > 0 && remainingNum === 0;

  async function createFirstShipment() {
    if (!order) return;
    setSplitLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/shipments`, { method: "POST" });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed");
      qc.invalidateQueries({ queryKey: ["order", params.id] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSplitLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Back nav only — Print + Cancel moved down into the action bar
          near Add Payment so all order-level actions sit together. */}
      <Link
        href="/orders"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> {t("Буюртмаларга қайтиш", "Back to orders")}
      </Link>

      {/* Shareable area — wraps the header card + calculation summary
          so ShareCalculationButton captures both together as one image.
          flex+gap (not space-y-*) so html-to-image doesn't include any
          phantom margin from the parent's space-y rule. p-4 gives the
          captured image symmetric breathing room (avoids the "values
          cut at the edge" feel on the bottom recap row). */}
      <div ref={shareRef} className="flex flex-col gap-5 p-4 bg-background">
      {/* Header card */}
      <div className="rounded-lg border bg-background p-3 sm:p-5 shadow-sm">
        {/* Mobile: single-column compact layout */}
        <div className="flex items-start justify-between gap-2 sm:hidden">
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">
              Буюртма
            </div>
            <h1 className="text-xl font-black tabular-nums tracking-tight leading-tight">
              {order.orderNumber}
            </h1>
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              <Link href={`/clients/${order.client.id}`} className="text-foreground font-medium">
                {order.client.name}
              </Link>
              {" · "}
              <span className="tabular-nums">{formatPhone(order.client.phone)}</span>
            </div>
            {order.client.address && (
              <div className="text-xs text-muted-foreground truncate">{addressToCyrillic(order.client.address)}</div>
            )}
            <div className="mt-1.5 flex items-center gap-1.5 text-xs">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-semibold tabular-nums">
                {WEEKDAY_UZ[new Date(order.scheduledAt).getDay()]}, {formatDate(order.scheduledAt)}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">Жами</div>
            <div className="text-lg font-black tabular-nums text-success font-mono leading-tight">
              {formatNumber(order.totalPrice, 0)}
              <span className="text-[10px] text-muted-foreground font-normal ml-0.5">UZS</span>
            </div>
            {(() => {
              const paid = Number(order.confirmedPaid);
              const remaining = Math.max(0, Number(order.totalPrice) - paid);
              const fullyPaid = paid > 0 && remaining === 0;
              return (
                <div className="mt-0.5 space-y-px text-xs">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Тўлов</span>
                    <span className={`tabular-nums font-semibold ${paid > 0 ? "text-success" : "text-muted-foreground"}`}>
                      {formatNumber(paid, 0)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Қолди</span>
                    <span className={`tabular-nums font-semibold ${fullyPaid ? "text-success" : remaining > 0 ? "text-warning" : "text-muted-foreground"}`}>
                      {fullyPaid ? t("Тўланган", "Paid") : formatNumber(remaining, 0)}
                    </span>
                  </div>
                  <span className={`inline-block mt-0.5 text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 ${PAYMENT_STATE_BADGE[order.paymentState].cls}`}>
                    {translatePaymentState(order.paymentState, t)}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Desktop: original spacious layout */}
        <div className="hidden sm:flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              Буюртма<span className="lang-en"> · Order</span>
            </div>
            <h1 className="text-3xl font-black tabular-nums tracking-tight">
              {order.orderNumber}
            </h1>
            <div className="text-sm text-muted-foreground mt-1">
              {t("Мижоз:", "Client:")}{" "}
              <Link href={`/clients/${order.client.id}`} className="text-foreground font-medium hover:underline">
                {order.client.name}
              </Link>
              {" · "}
              <span className="tabular-nums">{formatPhone(order.client.phone)}</span>
              {order.client.address && <> · {addressToCyrillic(order.client.address)}</>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                {t("Жадвал", "Schedule")}
              </div>
              <div className="inline-flex items-center gap-1.5 font-semibold">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="tabular-nums">
                  {WEEKDAY_UZ[new Date(order.scheduledAt).getDay()]},{" "}
                  {formatDate(order.scheduledAt)}
                </span>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {t("Қабул қилинган", "Placed")} {formatDate(order.placedAt)}
              </span>
            </div>
          </div>
          <div className="text-right min-w-[16rem]">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              Жами<span className="lang-en"> · Total</span>
            </div>
            <div className="text-3xl font-black tabular-nums text-success font-mono">
              {formatNumber(order.totalPrice, 0)}
              <span className="text-xs text-muted-foreground font-normal ml-1">UZS</span>
            </div>
            {(() => {
              const total = Number(order.totalPrice);
              const paid = Number(order.confirmedPaid);
              const remaining = Math.max(0, total - paid);
              const fullyPaid = paid > 0 && remaining === 0;
              const pendingAmount = order.payments
                .filter((p) => p.status === "PENDING_CONFIRMATION")
                .reduce((s, p) => s + Number(p.amount), 0);
              return (
                <div className="mt-2 space-y-0.5 text-sm">
                  <div className="flex items-baseline justify-between gap-6">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">
                      Тўлов<span className="lang-en"> · Paid</span>
                    </span>
                    <span className={`tabular-nums font-semibold ${paid > 0 ? "text-success" : "text-muted-foreground"}`}>
                      {formatNumber(paid, 0)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-6">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">
                      Қолди<span className="lang-en"> · Remaining</span>
                    </span>
                    <span
                      className={`tabular-nums font-semibold ${
                        fullyPaid
                          ? "text-success"
                          : remaining > 0
                            ? "text-warning"
                            : "text-muted-foreground"
                      }`}
                    >
                      {fullyPaid ? t("Тўланган", "Paid") : formatNumber(remaining, 0)}
                    </span>
                  </div>
                  {pendingAmount > 0 && (
                    <div className="text-[11px] text-muted-foreground italic text-right">
                      + {formatNumber(pendingAmount, 0)} {t("тасдиқлаш кутилмоқда", "pending confirmation")}
                    </div>
                  )}
                </div>
              );
            })()}
            <span
              className={`inline-block mt-2 text-[10px] font-bold uppercase tracking-wider rounded px-2 py-0.5 ${PAYMENT_STATE_BADGE[order.paymentState].cls}`}
            >
              {translatePaymentState(order.paymentState, t)}
            </span>
          </div>
        </div>{/* end desktop flex */}
      </div>

      {/* Calculation summary — per-room breakdown + financial recap */}
      {order.project.calculations.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {/* Card header — with mobile toggle */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Ҳисоб-китоб<span className="lang-en"> · Calculation Summary</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">
                {order.project.calculations.length}{" "}
                {t("хона", order.project.calculations.length === 1 ? "room" : "rooms")}
              </div>
              {/* Toggle — mobile only */}
              <button
                type="button"
                onClick={() => setMobileCalcOpen(v => !v)}
                className="sm:hidden inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 rounded px-2 py-1 transition-colors"
              >
                {mobileCalcOpen ? t("Яшириш", "Hide") : t("Кўриш", "Show")}
                <span className={`transition-transform duration-200 ${mobileCalcOpen ? "rotate-180" : ""}`}>▾</span>
              </button>
            </div>
          </div>

          {/* Load list — always visible, for loading operators */}
          {beamGroups.length > 0 && (
            <div className="border-b border-border bg-muted/10">
              <div className="px-4 pt-3 pb-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                Юклаш рўйхати<span className="lang-en"> · Load list</span>
              </div>
              <div className="px-4 pb-3 flex flex-wrap gap-2">
                {beamGroups.map(({ beamLength, totalCount }) => (
                  <div key={beamLength} className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm">
                    <span className="font-semibold">{Number(beamLength).toFixed(1)}<span className="text-xs text-muted-foreground ml-0.5">m</span></span>
                    <span className="text-muted-foreground text-xs">=</span>
                    <span className="font-mono font-bold tabular-nums text-foreground">{totalCount}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-3 py-2 text-sm">
                  <span className="font-semibold text-amber-900 dark:text-amber-300">{t("Ғишт", "Block")}</span>
                  <span className="text-amber-600 dark:text-amber-500 text-xs">=</span>
                  <span className="font-mono font-bold tabular-nums text-amber-900 dark:text-amber-300">{calcTotals.blocks}</span>
                </div>
              </div>
            </div>
          )}

          {/* Detailed table — hidden on mobile by default, toggled */}
          <div className={`${mobileCalcOpen ? "block" : "hidden"} sm:block`}>
          <div
            ref={tableScrollRef}
            className="overflow-x-auto [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: "none" } as React.CSSProperties}
            onScroll={() => {
              if (syncingRef.current || !mirrorScrollRef.current || !tableScrollRef.current) return;
              syncingRef.current = true;
              mirrorScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
              syncingRef.current = false;
            }}
          >
            <table className="w-full text-sm">
              <thead className="bg-muted text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2.5 font-semibold">
                    Хона<span className="lang-en font-normal"> · Room</span>
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold">
                    Эни<span className="lang-en font-normal"> · W</span>
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold">
                    Бўйи<span className="lang-en font-normal"> · L</span>
                  </th>
                  <th className="text-left px-3 py-2.5 font-semibold">
                    Шаблон<span className="lang-en font-normal"> · Pattern</span>
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold">
                    Таяниш<span className="lang-en font-normal"> · Bearing</span>
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold">
                    Балка<span className="lang-en font-normal"> · Beam</span>
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold">
                    Ғ/қатор<span className="lang-en font-normal"> · Per row</span>
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold">
                    Жами Ғ<span className="lang-en font-normal"> · Blocks</span>
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold">
                    Балка<span className="lang-en font-normal"> · Beams</span>
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold">
                    Майдон<span className="lang-en font-normal"> · Area</span>
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold">
                    м² нархи<span className="lang-en font-normal"> · Rate</span>
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold">
                    Сумма<span className="lang-en font-normal"> · Subtotal</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.project.calculations.map((c, i) => (
                  <tr
                    key={c.id}
                    className={
                      "border-b last:border-b-0 border-border/60 hover:bg-surface-hover transition-colors " +
                      (i % 2 === 1 ? "bg-muted/30" : "")
                    }
                  >
                    <td className="px-3 py-2.5 font-medium">
                      {c.name ? displayRoomName(c.name) : (
                        <span className="text-text-tertiary italic">
                          {t("Номсиз хона", "Unnamed Room")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {formatNumber(c.innerWidth, 2)}
                      <span className="text-text-tertiary text-xs ml-0.5">m</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {formatNumber(c.innerLength, 2)}
                      <span className="text-text-tertiary text-xs ml-0.5">m</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                        <span className="font-semibold">{PATTERN_LABEL[c.pattern]}</span>
                        {c.pattern !== c.patternAuto && (
                          <span className="text-text-tertiary normal-case">
                            ({t("авто", "auto")}: {PATTERN_LABEL[c.patternAuto]})
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-text-tertiary">
                      {displayBearing(c.bearing)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {formatNumber(c.beamLength, 2)}
                      <span className="text-text-tertiary text-xs ml-0.5">m</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-text-tertiary">
                      {c.blockRows > 0 ? c.blocksPerRow : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold">
                      {c.totalBlocks}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold">
                      {c.beamCount}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-text-tertiary">
                      {formatNumber(c.monolithArea, 2)}
                      <span className="text-xs ml-0.5">m²</span>
                    </td>
                    <td
                      className="px-3 py-2.5 text-right font-mono"
                      title={
                        c.m2PriceOverride
                          ? `Override · ${formatNumber(c.m2Price, 0)}${c.m2PriceReason ? `. Reason: ${c.m2PriceReason}` : ""}`
                          : undefined
                      }
                    >
                      <span className="inline-flex items-center justify-end gap-1">
                        {formatNumber(c.m2Price, 0)}
                        {c.m2PriceOverride && (
                          <Pencil className="h-3 w-3 text-warning" />
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-success">
                      {formatNumber(c.subtotal, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals strip — outside overflow-x-auto so it never scrolls and
              is always visible. The scrollbar now sits below all table rows,
              above this strip. Column alignment is replaced by explicit labels. */}
          <div className="border-t-2 border-border-strong bg-muted/40 px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Жами<span className="lang-en font-normal"> · Totals</span>
            </span>
            <div className="flex items-center gap-5 font-mono font-bold text-sm ml-auto">
              <span>
                {calcTotals.blocks}
                <span className="text-[10px] text-muted-foreground font-normal ml-0.5">Ғ</span>
              </span>
              <span>
                {calcTotals.beams}
                <span className="text-[10px] text-muted-foreground font-normal ml-0.5">Б</span>
              </span>
              <span>
                {formatNumber(calcTotals.monolithArea, 2)}
                <span className="text-[10px] text-muted-foreground font-normal ml-0.5">m²</span>
              </span>
              <span className="text-success font-extrabold text-base">
                {formatNumber(order.roomsSubtotal, 0)}
              </span>
            </div>
          </div>

          {/* Financial recap — Weight / Total / Paid / Remaining */}
          <div className="border-t border-border">
            {/* Payment progress bar */}
            {totalNum > 0 && (
              <div className="h-1 bg-muted overflow-hidden">
                <div
                  className="h-full bg-success transition-all duration-500"
                  style={{ width: `${Math.min(100, (paidNum / totalNum) * 100)}%` }}
                />
              </div>
            )}
            <div className="flex items-stretch justify-end">
              {/* Weight — logistics stat */}
              <div className="flex flex-col justify-center text-right px-6 py-4 bg-muted/20">
                <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-1">
                  Оғирлик<span className="lang-en"> · Weight</span>
                </div>
                <div className="text-lg font-black tabular-nums font-mono text-foreground leading-none">
                  {formatNumber(Number(order.totalArea) * 180, 0)}
                  <span className="text-xs font-normal text-muted-foreground ml-1">кг</span>
                </div>
              </div>

              <div className="w-px bg-border my-3" />

              {/* Total */}
              <div className="flex flex-col justify-center text-right px-6 py-4">
                <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-1">
                  Жами<span className="lang-en"> · Total</span>
                </div>
                <div className="text-xl font-black tabular-nums font-mono text-foreground leading-none">
                  {formatNumber(order.totalPrice, 0)}
                  <span className="text-[10px] font-normal text-muted-foreground ml-1">UZS</span>
                </div>
              </div>

              <div className="w-px bg-border my-3" />

              {/* Paid */}
              <div className="flex flex-col justify-center text-right px-6 py-4">
                <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-1">
                  Тўлов<span className="lang-en"> · Paid</span>
                </div>
                <div className={`text-xl font-black tabular-nums font-mono leading-none ${paidNum > 0 ? "text-success" : "text-muted-foreground"}`}>
                  {formatNumber(paidNum, 0)}
                </div>
              </div>

              <div className="w-px bg-border my-3" />

              {/* Remaining */}
              <div className={`flex flex-col justify-center text-right px-6 py-4 ${fullyPaid ? "bg-success/5" : remainingNum > 0 ? "bg-warning/5" : ""}`}>
                <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-1">
                  Қолди<span className="lang-en"> · Remaining</span>
                </div>
                <div className={`text-xl font-black tabular-nums font-mono leading-none ${
                  fullyPaid ? "text-success" : remainingNum > 0 ? "text-warning" : "text-muted-foreground"
                }`}>
                  {fullyPaid ? t("Тўланган", "Paid") : formatNumber(remainingNum, 0)}
                </div>
              </div>
            </div>
          </div>

          {/* Mirror scrollbar — synced with the table above */}
          <div
            ref={mirrorScrollRef}
            className="overflow-x-auto border-t border-border/40"
            onScroll={() => {
              if (syncingRef.current || !tableScrollRef.current || !mirrorScrollRef.current) return;
              syncingRef.current = true;
              tableScrollRef.current.scrollLeft = mirrorScrollRef.current.scrollLeft;
              syncingRef.current = false;
            }}
          >
            <div ref={mirrorSpacerRef} className="h-[1px]" />
          </div>
          </div>{/* end detailed table wrapper */}
        </div>
      )}
      </div>
      {/* /shareRef */}

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* Stock-warning banner — surfaced when delivery decremented inventory below zero */}
      {order.events.some((e) => e.type === "STOCK_WARNING") && (
        <div className="rounded-lg border-2 border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <div className="font-bold mb-1">
            {t("Етказиб беришда захира манфийга тушди", "Stock went negative on delivery")}
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            {order.events
              .filter((e) => e.type === "STOCK_WARNING")
              .slice(0, 5)
              .map((e) => (
                <li key={e.id}>{e.message}</li>
              ))}
          </ul>
          <div className="text-xs text-warning/80 mt-2 italic">
            {t(
              "Ишлаб чиқариш ёзуви ёки Омбордаги қўлда созлаш орқали солиштиринг.",
              "Reconcile via a production log entry or manual stock adjustment in Омбор.",
            )}
          </div>
        </div>
      )}

      {/* Order action bar */}
      {(() => {
        const total = Number(order.totalPrice);
        const confirmed = Number(order.confirmedPaid);
        const pendingSum = order.payments
          .filter((p) => p.status === "PENDING_CONFIRMATION")
          .reduce((s, p) => s + Number(p.amount), 0);
        const remaining = Math.max(0, total - confirmed - pendingSum);
        const canAdd =
          order.status !== "CANCELED" &&
          !(order.status === "DELIVERED" && order.paymentState === "FULLY_PAID") &&
          remaining > 0;
        return (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">

              {/* Left — utility / export actions */}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/orders/${order.id}/print`}>
                    <Printer className="h-3.5 w-3.5 mr-1.5" />
                    {t("Чоп этиш", "Print")}
                  </Link>
                </Button>
                <ShareCalculationButton
                  targetRef={shareRef}
                  fileBase={`${order.orderNumber}-${order.client.name
                    .replace(/[<>:"/\\|?*]+/g, "")
                    .replace(/\s+/g, " ")
                    .trim()}`}
                  disabled={order.project.calculations.length === 0}
                />
                {canUseBlender && order.project.calculations.length > 0 && (
                  <SendToBlenderButton orderId={order.id} />
                )}
              </div>

              {/* Right — management actions + primary CTA */}
              <div className="flex items-center gap-2">
                {/* Edit */}
                {(() => {
                  const editable =
                    order.status === "PLACED" || order.status === "IN_PRODUCTION";
                  return (
                    <Button
                      variant="outline"
                      size="sm"
                      className={!editable ? "opacity-40 cursor-not-allowed" : ""}
                      asChild={editable}
                      disabled={!editable}
                      title={
                        editable
                          ? t(
                              "Ўлчам, нарх, жадвал ёки изоҳни таҳрирлаш",
                              "Edit dimensions, pricing, schedule or notes",
                            )
                          : t(
                              `Ҳолат ${order.status} да таҳрир блокланган`,
                              `Editing locked at status ${order.status}`,
                            )
                      }
                    >
                      {editable ? (
                        <Link href={`/calculations?fromOrder=${order.id}`}>
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          {t("Таҳрирлаш", "Edit")}
                        </Link>
                      ) : (
                        <span className="flex items-center">
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          {t("Таҳрирлаш", "Edit")}
                        </span>
                      )}
                    </Button>
                  );
                })()}

                {/* Cancel — loud destructive button */}
                {!isCanceled && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive hover:text-white hover:border-destructive transition-colors"
                    onClick={() => setCancelOpen(true)}
                  >
                    <Ban className="h-3.5 w-3.5 mr-1.5" />
                    {t("Буюртмани бекор қилиш", "Cancel order")}
                  </Button>
                )}

                {/* Add Payment — primary CTA */}
                {canAdd && (
                  <Button
                    size="sm"
                    className="bg-success hover:bg-success/90 text-success-foreground"
                    onClick={() => setAddPaymentOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Тўлов қўшиш<span className="lang-en"> · Add Payment</span>
                  </Button>
                )}
              </div>

            </div>
          </div>
        );
      })()}

      {/* Status timeline */}
      {!isCanceled ? (
        <div className="rounded-lg border bg-background p-4 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
            Жараён<span className="lang-en"> · Status timeline</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUS_FLOW
              .filter((s) => !(s.key === "LOADED" && order.shipments.length > 0))
              .map((s) => {
                const flowIdx = STATUS_FLOW.findIndex((f) => f.key === s.key);
                // Map removed statuses to the nearest visible step so existing
                // orders continue to render correctly.
                // IN_PRODUCTION → PLACED (LOADED is the next action)
                // DISPATCHED    → LOADED  (DELIVERED is the next action)
                const effectiveStatus =
                  order.status === "IN_PRODUCTION" ? "PLACED" :
                  order.status === "DISPATCHED"    ? "LOADED" :
                  order.status;
                const currentFlowIdx = STATUS_FLOW.findIndex((f) => f.key === effectiveStatus);
                const Icon = s.icon;
                const reached = flowIdx <= currentFlowIdx;
                const isCurrent = flowIdx === currentFlowIdx;
                const canAdvance = flowIdx === currentFlowIdx + 1;

                // Compute partial-fill fraction for DISPATCHED / DELIVERED when split shipments exist
                const n = order.shipments.length;
                const shipmentFraction: number | null =
                  n > 0 && (s.key === "DISPATCHED" || s.key === "DELIVERED")
                    ? s.key === "DISPATCHED"
                      ? order.shipments.filter((sh) => sh.status === "DISPATCHED" || sh.status === "DELIVERED").length / n
                      : order.shipments.filter((sh) => sh.status === "DELIVERED").length / n
                    : null;
                const isPartialFill = shipmentFraction !== null && shipmentFraction > 0 && shipmentFraction < 1;
                const pct = shipmentFraction !== null ? Math.round(shipmentFraction * 100) : 0;

                const pendingShipments = order.shipments.filter(
                  (sh) => sh.status === "PENDING" || sh.status === "LOADED",
                );
                const deliveredBlocked =
                  s.key === "DELIVERED" && (remainingNum > 0 || pendingShipments.length > 0);

                const tooltip = isPartialFill
                  ? t(
                      `${Math.round(shipmentFraction! * n)} / ${n} жўнатма`,
                      `${Math.round(shipmentFraction! * n)} of ${n} shipments`,
                    )
                  : deliveredBlocked
                    ? remainingNum > 0
                      ? t(
                          `Тўлов тўлиқ эмас — қолди: ${formatNumber(remainingNum, 0)} UZS`,
                          `Payment incomplete — remaining: ${formatNumber(remainingNum, 0)} UZS`,
                        )
                      : t(
                          `${pendingShipments.length} та жўнатма ҳали жўнатилмаган`,
                          `${pendingShipments.length} shipment(s) not yet dispatched`,
                        )
                    : undefined;

                const onClick = () => {
                  if (!canAdvance || deliveredBlocked) return;
                  if (s.key === "LOADED") setLoadTruckOpen(true);
                  else if (s.key === "DELIVERED") updateStatus.mutate("DELIVERED");
                  else updateStatus.mutate(s.key);
                };

                return (
                  <button
                    key={s.key}
                    type="button"
                    disabled={isPartialFill || !canAdvance || updateStatus.isPending || deliveredBlocked}
                    onClick={onClick}
                    title={tooltip}
                    style={isPartialFill
                      ? { background: isDark
                          ? `linear-gradient(to right, #064e3b ${pct}%, #1c1917 ${pct}%)`
                          : `linear-gradient(to right, #ecfdf5 ${pct}%, #f8fafc ${pct}%)` }
                      : undefined}
                    className={[
                      "flex items-center gap-2 px-3 py-2 rounded-md text-sm border transition-all",
                      isPartialFill
                        ? "border-emerald-600 text-emerald-300 dark:border-emerald-700 dark:text-emerald-300"
                        : reached
                          ? "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300"
                          : canAdvance && !deliveredBlocked
                            ? "bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100 cursor-pointer dark:bg-amber-950/50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/80"
                            : "bg-muted/30 border-border text-muted-foreground cursor-not-allowed",
                      isCurrent || isPartialFill ? "ring-2 ring-emerald-400 dark:ring-emerald-700" : "",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="font-medium">{t(s.uz, s.en)}</span>
                    {isPartialFill && (
                      <span className="text-xs font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                        {Math.round(shipmentFraction! * n)}/{n}
                      </span>
                    )}
                    {!isPartialFill && canAdvance && !deliveredBlocked && (
                      <span className="text-xs">
                        {s.key === "LOADED"
                          ? t("→ расм юкланг", "→ upload photo")
                          : s.key === "DELIVERED"
                            ? t("→ тасдиқлаш", "→ confirm")
                            : t("→ давом эттириш учун босинг", "→ click to advance")}
                      </span>
                    )}
                    {!isPartialFill && deliveredBlocked && (
                      <span className="text-xs text-muted-foreground/70">{t("· блокланган", "· blocked")}</span>
                    )}
                  </button>
                );
              })}

            {/* Split Shipment button — shown when PLACED/IN_PRODUCTION and no shipments yet */}
            {(order.status === "PLACED" || order.status === "IN_PRODUCTION") && order.shipments.length === 0 && (
              <>
                <div className="w-px self-stretch bg-border/60 mx-1" />
                <button
                  type="button"
                  disabled={splitLoading}
                  onClick={createFirstShipment}
                  className="flex items-center gap-2.5 px-3.5 py-2 rounded-md text-sm border-2 border-dashed border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100 hover:border-violet-400 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-300 dark:hover:bg-violet-950/80 dark:hover:border-violet-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {splitLoading
                    ? <Loader2 className="h-4 w-4 animate-spin shrink-0 text-violet-600" />
                    : <Split className="h-4 w-4 shrink-0" />}
                  <span className="flex flex-col items-start leading-tight">
                    <span className="font-semibold">{t("Бўлиб юклаш", "Split shipment")}</span>
                    <span className="text-[10px] font-normal text-violet-500 dark:text-violet-400">{t("Бир нечта машинага бўлиш", "Multiple trucks")}</span>
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive">
          <div className="font-bold">Бекор қилинди<span className="lang-en"> · Canceled</span></div>
          {order.cancelReason && (
            <div className="text-sm mt-1">{t("Сабаб:", "Reason:")} {order.cancelReason}</div>
          )}
        </div>
      )}

      {/* Split-shipment tracking */}
      {order.shipments.length > 0 && (
        <ShipmentsSection
          orderId={order.id}
          shipments={order.shipments}
          beamGroups={beamGroups}
          totalBlocks={calcTotals.blocks}
          orderStatus={order.status}
          onRefresh={() => qc.invalidateQueries({ queryKey: ["order", params.id] })}
        />
      )}


      {/* Drawings — Blender-generated PDFs attached to this order */}
      {canUseBlender && <DrawingsSection orderId={order.id} />}

      {/* Payments — chain of custody view */}
      {order.payments.length > 0 && (
        <div className="rounded-lg border bg-background overflow-hidden">
          <div className="px-4 py-3 border-b flex items-baseline justify-between">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Тўловлар<span className="lang-en"> · Payments</span>
            </div>
            <div className="text-[10px] text-muted-foreground tabular-nums">
              {t("Тасдиқланган:", "Confirmed:")} {formatNumber(order.confirmedPaid, 0)} / {formatNumber(order.totalPrice, 0)}
            </div>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">{t("Усул", "Method")}</th>
                <th className="text-right px-3 py-2">{t("Сумма", "Amount")}</th>
                <th className="text-left px-3 py-2">{t("Ҳолат", "Status")}</th>
                <th className="text-left px-3 py-2">{t("Йиғилди", "Collected")}</th>
                <th className="text-left px-3 py-2">{t("Қайд этилди", "Recorded")}</th>
                <th className="text-left px-3 py-2">{t("Топширилди", "Handed over")}</th>
                <th className="text-left px-3 py-2">{t("Тасдиқланди", "Confirmed")}</th>
                <th className="px-3 py-2 w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {order.payments.map((p) => (
                <tr key={p.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 text-xs uppercase tracking-wider">{p.method}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {formatNumber(p.amount, 0)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider rounded px-2 py-0.5 ${PAYMENT_STATUS_BADGE[p.status].cls}`}
                    >
                      {translatePaymentBadgeStatus(p.status, t)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {p.collectedByDriver ? p.collectedByDriver.name : "—"}
                    {p.collectedAt && <div className="tabular-nums">{formatDate(p.collectedAt)}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {p.recordedBy ? p.recordedBy.name : "—"}
                    <div className="tabular-nums">{formatDate(p.recordedAt)}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {p.handedOverToOfficeAt ? (
                      <>
                        {p.handedOverTo?.name ?? "—"}
                        <div className="tabular-nums">{formatDate(p.handedOverToOfficeAt)}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {p.confirmedAt ? (
                      <>
                        {p.confirmedBy?.name ?? "—"}
                        <div className="tabular-nums">{formatDate(p.confirmedAt)}</div>
                      </>
                    ) : p.rejectedAt ? (
                      <>
                        <span className="text-destructive">{t("Рад этилган", "Rejected")}</span>
                        {p.rejectedBy && <div>{p.rejectedBy.name}</div>}
                        {p.rejectionReason && (
                          <div className="italic">{p.rejectionReason}</div>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {p.status === "PENDING_CONFIRMATION" && !p.handedOverToOfficeAt && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={handoverPayment.isPending}
                        onClick={() => handoverPayment.mutate(p.id)}
                      >
                        {handoverPayment.isPending ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : null}
                        {t("Топшириш", "Hand over")}
                      </Button>
                    )}
                    {p.status === "PENDING_CONFIRMATION" && p.handedOverToOfficeAt && (
                      <Link
                        href="/payments"
                        className="text-xs text-muted-foreground underline hover:no-underline"
                      >
                        {t("Тасдиқлаш кутилмоқда →", "Awaiting confirm →")}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Loaded truck photo (single-truck flow) */}
      {order.loadedPhotoUrl && (
        <div className="rounded-lg border bg-background overflow-hidden">
          <div className="px-4 py-3 border-b text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Юкланган машина<span className="lang-en"> · Loaded truck</span>
          </div>
          <div className="p-4">
            <a href={order.loadedPhotoUrl} target="_blank" rel="noreferrer">
              <img
                src={order.loadedPhotoUrl}
                alt="Loaded truck"
                className="max-h-48 rounded border object-cover hover:opacity-90 transition-opacity"
              />
            </a>
          </div>
        </div>
      )}

      {/* Delivery proof — visible once uploaded */}
      {order.deliveryProofUrl && (
        <div className="rounded-lg border bg-background p-4 shadow-sm">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Етказиб бериш фотоси<span className="lang-en"> · Delivery proof</span>
            </div>
            {order.deliveryProofUploadedAt && (
              <div className="text-[10px] text-muted-foreground">
                {t("Юкланди", "Uploaded")} {formatDate(order.deliveryProofUploadedAt)}
              </div>
            )}
          </div>
          <a
            href={order.deliveryProofUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-md overflow-hidden border bg-black/5 hover:opacity-95 transition-opacity"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={order.deliveryProofUrl}
              alt="Truck loaded with order"
              className="block w-full max-h-96 object-contain"
            />
          </a>
        </div>
      )}

      {/* Activity log */}
      <div className="rounded-lg border bg-background">
        <div className="px-4 py-3 border-b">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {t("Фаолият", "Activity")}
          </div>
        </div>
        <ul className="divide-y">
          {order.events.map((e) => (
            <li key={e.id} className="px-4 py-2.5 text-sm flex items-baseline justify-between gap-4">
              <div>
                <span className="font-medium">{e.type.replace(/_/g, " ").toLowerCase()}</span>
                {e.message && <span className="text-muted-foreground"> — {e.message}</span>}
                {e.actor && (
                  <span className="text-xs text-muted-foreground ml-2">{t("·", "by")} {e.actor.name}</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatDate(e.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Delivery proof modal — gates the IN_PRODUCTION → DELIVERED step */}
      <DeliveryProofDialog
        open={proofOpen}
        onClose={() => setProofOpen(false)}
        expectedCollection={
          order.dispatch
            ? Number(order.dispatch.expectedCollection)
            : Math.max(0, Number(order.totalPrice) - Number(order.confirmedPaid))
        }
        onUpload={uploadDeliveryProof}
      />
      <LoadTruckDialog
        orderId={order.id}
        open={loadTruckOpen}
        onClose={() => setLoadTruckOpen(false)}
        onSuccess={() => {
          setLoadTruckOpen(false);
          qc.invalidateQueries({ queryKey: ["order", params.id] });
        }}
      />

      <AddPaymentDialog
        open={addPaymentOpen}
        onClose={() => setAddPaymentOpen(false)}
        orderId={order.id}
        currentRemaining={Math.max(
          0,
          Number(order.totalPrice) -
            Number(order.confirmedPaid) -
            order.payments
              .filter((p) => p.status === "PENDING_CONFIRMATION")
              .reduce((s, p) => s + Number(p.amount), 0),
        )}
        existingPendingTotal={order.payments
          .filter((p) => p.status === "PENDING_CONFIRMATION")
          .reduce((s, p) => s + Number(p.amount), 0)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["order", params.id] })}
      />

      {/* Cancel modal */}
      {cancelOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-lg shadow-2xl w-full max-w-md p-5 space-y-3 border border-border">
            <h2 className="text-lg font-bold">
              {t(`${order.orderNumber} буюртмани бекор қилиш?`, `Cancel order ${order.orderNumber}?`)}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(
                "Бекор қилиш АДМИН ролини ёки компания бекор қилиш паролини талаб қилади. Лойиҳа қайта таҳрирлаш учун Лойиҳага қайтарилади.",
                "Cancellation requires ADMIN role or the company cancel password. The Project will move back to Draft so it can be re-edited.",
              )}
            </p>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider">
                {t("Бекор қилиш пароли", "Cancel password")}
              </label>
              <input
                type="password"
                className="w-full h-9 rounded border px-2 text-sm tabular-nums"
                placeholder={t("Агар АДМИН бўлсангиз бўш қолдиринг", "Leave empty if you're an Admin")}
                value={cancelPassword}
                onChange={(e) => setCancelPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider">
                {t("Сабаб (ихтиёрий)", "Reason (optional)")}
              </label>
              <input
                className="w-full h-9 rounded border px-2 text-sm"
                placeholder={t("масалан: Мижоз бекор қилишни сўради", "e.g. Client called to cancel")}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setCancelOpen(false)}>
                {t("Буюртмани сақлаш", "Keep order")}
              </Button>
              <Button
                size="sm"
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                disabled={cancelOrder.isPending}
                onClick={() => cancelOrder.mutate()}
              >
                {cancelOrder.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Ban className="h-4 w-4 mr-2" />
                )}
                {t("Буюртмани бекор қилиш", "Cancel order")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
