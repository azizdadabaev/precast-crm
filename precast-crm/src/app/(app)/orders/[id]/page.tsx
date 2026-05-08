"use client";

import { useState } from "react";
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
  CreditCard,
  Hammer,
  Plus,
} from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import { DeliveryProofDialog, type DeliveryFormPayload } from "@/components/orders/DeliveryProofDialog";
import { DispatchDialog } from "@/components/dispatch/DispatchDialog";
import { AddPaymentDialog } from "@/components/payments/AddPaymentDialog";

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: "PLACED" | "IN_PRODUCTION" | "DISPATCHED" | "DELIVERED" | "CANCELED";
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
  notes: string | null;
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
      beamLength: string;
      blocksPerRow: number;
      beamCount: number;
      totalBlocks: number;
      monolithLength: string;
      monolithArea: string;
      m2Price: string;
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
    driver: { id: string; name: string; phone: string };
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

const STATUS_FLOW: Array<{ key: OrderDetail["status"]; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "PLACED",        label: "Placed",        icon: CheckCircle2 },
  { key: "IN_PRODUCTION", label: "In production", icon: Hammer },
  { key: "DISPATCHED",    label: "Dispatched",    icon: CreditCard }, // truck icon used elsewhere; CreditCard placeholder
  { key: "DELIVERED",     label: "Delivered",     icon: Truck },
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

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelPassword, setCancelPassword] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [proofOpen, setProofOpen] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: order, isLoading } = useQuery<OrderDetail>({
    queryKey: ["order", params.id],
    queryFn: () => api(`/api/orders/${params.id}`),
  });

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

  const markDriverReturned = useMutation({
    mutationFn: (dispatchId: string) =>
      api(`/api/dispatches/${dispatchId}/return`, { method: "PATCH" }),
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

  if (isLoading || !order) return <div className="p-4 text-muted-foreground">Loading…</div>;

  const isCanceled = order.status === "CANCELED";
  const currentIdx = STATUS_FLOW.findIndex((s) => s.key === order.status);

  const calcTotals = order.project.calculations.reduce(
    (acc, c) => ({
      blocks: acc.blocks + c.totalBlocks,
      beams: acc.beams + c.beamCount,
      monolithArea: acc.monolithArea + Number(c.monolithArea),
    }),
    { blocks: 0, beams: 0, monolithArea: 0 },
  );
  const totalNum = Number(order.totalPrice);
  const paidNum = Number(order.confirmedPaid);
  const remainingNum = Math.max(0, totalNum - paidNum);
  const fullyPaid = paidNum > 0 && remainingNum === 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link
          href="/orders"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to orders
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/orders/${order.id}/print`}>
              <Printer className="h-4 w-4 mr-2" /> Print
            </Link>
          </Button>
          {!isCanceled && (
            <Button
              variant="outline"
              size="sm"
              className="text-rose-700 hover:bg-rose-50"
              onClick={() => setCancelOpen(true)}
            >
              <Ban className="h-4 w-4 mr-2" /> Cancel order
            </Button>
          )}
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-lg border bg-background p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              Буюртма · Order
            </div>
            <h1 className="text-3xl font-black tabular-nums tracking-tight">
              {order.orderNumber}
            </h1>
            <div className="text-sm text-muted-foreground mt-1">
              Client:{" "}
              <Link href={`/clients/${order.client.id}`} className="text-foreground font-medium hover:underline">
                {order.client.name}
              </Link>
              {" · "}
              <span className="tabular-nums">{formatPhone(order.client.phone)}</span>
              {order.client.address && <> · {order.client.address}</>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                Schedule
              </div>
              <div className="inline-flex items-center gap-1.5 font-semibold">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="tabular-nums">
                  {new Date(order.scheduledAt).toLocaleDateString("en-GB", {
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                Placed {formatDate(order.placedAt)}
              </span>
            </div>
          </div>
          <div className="text-right min-w-[16rem]">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              Жами · Total
            </div>
            <div className="text-3xl font-black tabular-nums text-emerald-700">
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
                      Тўлов · Paid
                    </span>
                    <span className={`tabular-nums font-semibold ${paid > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                      {formatNumber(paid, 0)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-6">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">
                      Қолди · Remaining
                    </span>
                    <span
                      className={`tabular-nums font-semibold ${
                        fullyPaid
                          ? "text-emerald-700"
                          : remaining > 0
                            ? "text-amber-700"
                            : "text-muted-foreground"
                      }`}
                    >
                      {fullyPaid ? "Тўланган" : formatNumber(remaining, 0)}
                    </span>
                  </div>
                  {pendingAmount > 0 && (
                    <div className="text-[11px] text-muted-foreground italic text-right">
                      + {formatNumber(pendingAmount, 0)} pending confirmation
                    </div>
                  )}
                </div>
              );
            })()}
            <span
              className={`inline-block mt-2 text-[10px] font-bold uppercase tracking-wider rounded px-2 py-0.5 ${PAYMENT_STATE_BADGE[order.paymentState].cls}`}
            >
              {PAYMENT_STATE_BADGE[order.paymentState].label}
            </span>
          </div>
        </div>
      </div>

      {/* Calculation summary — per-room breakdown + financial recap */}
      {order.project.calculations.length > 0 && (
        <div className="rounded-lg border bg-background overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Ҳисоб-китоб · Calculation Summary (Rooms)
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
                <tr>
                  <th className="px-3 py-2 border-b text-left bg-yellow-50">Name</th>
                  <th className="px-3 py-2 border-b text-center bg-yellow-50">W</th>
                  <th className="px-3 py-2 border-b text-center bg-yellow-50">L</th>
                  <th className="px-3 py-2 border-b text-center bg-blue-50">Pattern</th>
                  <th className="px-3 py-2 border-b text-center bg-green-50">Beam Len</th>
                  <th className="px-3 py-2 border-b text-center">Blks/Row</th>
                  <th className="px-3 py-2 border-b text-center bg-orange-50">Total Blks</th>
                  <th className="px-3 py-2 border-b text-center bg-gray-100">Beams</th>
                  <th className="px-3 py-2 border-b text-center">Slab L</th>
                  <th className="px-3 py-2 border-b text-center">Area</th>
                  <th className="px-3 py-2 border-b text-center bg-green-50">m² Rate</th>
                  <th className="px-3 py-2 border-b text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {order.project.calculations.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-3 py-2 font-medium bg-yellow-50/20">
                      {c.name || "Unnamed Room"}
                    </td>
                    <td className="px-3 py-2 text-center bg-yellow-50/20 tabular-nums">
                      {formatNumber(c.innerWidth, 2)}
                    </td>
                    <td className="px-3 py-2 text-center bg-yellow-50/20 tabular-nums">
                      {formatNumber(c.innerLength, 2)}
                    </td>
                    <td className="px-3 py-2 text-center text-xs font-medium bg-blue-50/30">
                      {PATTERN_LABEL[c.pattern]}
                      {c.pattern !== c.patternAuto && (
                        <span className="text-muted-foreground"> (auto: {PATTERN_LABEL[c.patternAuto]})</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center font-bold bg-green-50/20 text-green-800 tabular-nums">
                      {formatNumber(c.beamLength, 2)}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">{c.blocksPerRow}</td>
                    <td className="px-3 py-2 text-center font-black bg-orange-50/20 text-orange-800 tabular-nums">
                      {c.totalBlocks}
                    </td>
                    <td className="px-3 py-2 text-center font-black bg-gray-100/50 tabular-nums">
                      {c.beamCount}
                    </td>
                    <td className="px-3 py-2 text-center text-xs tabular-nums">
                      {formatNumber(c.monolithLength, 2)} m
                    </td>
                    <td className="px-3 py-2 text-center text-xs tabular-nums">
                      {formatNumber(c.monolithArea, 2)} m²
                    </td>
                    <td className="px-3 py-2 text-center font-bold bg-green-50/20 text-green-800 tabular-nums">
                      {formatNumber(c.m2Price, 0)}
                    </td>
                    <td className="px-3 py-2 text-right font-black text-green-700 tabular-nums">
                      {formatNumber(c.subtotal, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/20 font-black border-t-2 border-primary/10">
                <tr>
                  <td className="px-3 py-3 text-right" colSpan={6}>
                    TOTALS (ЖАМИ):
                  </td>
                  <td className="px-3 py-3 text-center text-orange-800 bg-orange-50/50 tabular-nums">
                    {calcTotals.blocks}
                  </td>
                  <td className="px-3 py-3 text-center bg-gray-100 tabular-nums">
                    {calcTotals.beams}
                  </td>
                  <td className="px-3 py-3"></td>
                  <td className="px-3 py-3 text-center text-xs tabular-nums">
                    {formatNumber(calcTotals.monolithArea, 2)} m²
                  </td>
                  <td
                    className="px-3 py-3 text-right text-green-800 bg-green-50/50 text-lg tabular-nums"
                    colSpan={2}
                  >
                    {formatNumber(order.roomsSubtotal, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Financial recap — Total Sum / Paid / Remaining */}
          <div className="border-t bg-muted/10 px-4 py-3">
            <div className="flex flex-wrap items-end justify-end gap-x-10 gap-y-3">
              <div className="text-right min-w-[7rem]">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                  Жами · Total Sum
                </div>
                <div className="text-xl font-black tabular-nums text-emerald-700">
                  {formatNumber(order.totalPrice, 0)}
                  <span className="text-[10px] text-muted-foreground font-normal ml-1">UZS</span>
                </div>
              </div>
              <div className="text-right min-w-[7rem]">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                  Тўлов · Paid
                </div>
                <div
                  className={`text-xl font-black tabular-nums ${
                    paidNum > 0 ? "text-emerald-700" : "text-muted-foreground"
                  }`}
                >
                  {formatNumber(paidNum, 0)}
                </div>
              </div>
              <div className="text-right min-w-[7rem]">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                  Қолди · Remaining
                </div>
                <div
                  className={`text-xl font-black tabular-nums ${
                    fullyPaid
                      ? "text-emerald-700"
                      : remainingNum > 0
                        ? "text-amber-700"
                        : "text-muted-foreground"
                  }`}
                >
                  {fullyPaid ? "Тўланган" : formatNumber(remainingNum, 0)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* Stock-warning banner — surfaced when delivery decremented inventory below zero */}
      {order.events.some((e) => e.type === "STOCK_WARNING") && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="font-bold mb-1">Stock went negative on delivery</div>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            {order.events
              .filter((e) => e.type === "STOCK_WARNING")
              .slice(0, 5)
              .map((e) => (
                <li key={e.id}>{e.message}</li>
              ))}
          </ul>
          <div className="text-xs text-amber-800 mt-2 italic">
            Reconcile via a production log entry or manual stock adjustment in Омбор.
          </div>
        </div>
      )}

      {/* Status timeline */}
      {!isCanceled ? (
        <div className="rounded-lg border bg-background p-4 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
            Жараён · Status timeline
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUS_FLOW.map((s, i) => {
              const Icon = s.icon;
              const reached = i <= currentIdx;
              const isCurrent = i === currentIdx;
              const canAdvance = i === currentIdx + 1;
              const needsProof = canAdvance && s.key === "DELIVERED";
              const needsDispatch = canAdvance && s.key === "DISPATCHED";
              const onClick = () => {
                if (needsProof) setProofOpen(true);
                else if (needsDispatch) setDispatchOpen(true);
                else updateStatus.mutate(s.key);
              };
              return (
                <button
                  key={s.key}
                  type="button"
                  disabled={!canAdvance || updateStatus.isPending}
                  onClick={onClick}
                  className={[
                    "flex items-center gap-2 px-3 py-2 rounded-md text-sm border transition-colors",
                    reached
                      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                      : canAdvance
                        ? "bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100 cursor-pointer"
                        : "bg-muted/30 border-border text-muted-foreground cursor-not-allowed",
                    isCurrent ? "ring-2 ring-emerald-400" : "",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4" />
                  <span className="font-medium">{s.label}</span>
                  {canAdvance && (
                    <span className="text-xs">
                      {needsProof
                        ? "→ requires photo + cash"
                        : needsDispatch
                          ? "→ assign driver"
                          : "→ click to advance"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border bg-rose-50 border-rose-200 p-4 text-rose-900">
          <div className="font-bold">Canceled · Бекор қилинди</div>
          {order.cancelReason && (
            <div className="text-sm mt-1">Reason: {order.cancelReason}</div>
          )}
        </div>
      )}

      {/* Dispatch — visible once a driver has been assigned */}
      {order.dispatch && (
        <div className="rounded-lg border bg-background p-4 shadow-sm space-y-3">
          <div className="flex items-baseline justify-between">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Юбориш · Dispatch
            </div>
            <div className="text-[10px] text-muted-foreground">
              Dispatched {formatDate(order.dispatch.dispatchedAt)}
              {order.dispatch.dispatchedBy && <> by {order.dispatch.dispatchedBy.name}</>}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Driver</div>
              <Link href={`/drivers/${order.dispatch.driver.id}`} className="font-semibold hover:underline">
                {order.dispatch.driver.name}
              </Link>
              <div className="text-xs text-muted-foreground tabular-nums">
                {formatPhone(order.dispatch.driver.phone)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Truck</div>
              <div className="font-semibold tabular-nums">
                {order.dispatch.truckIdentifier ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Expected</div>
              <div className="font-semibold tabular-nums">
                {formatNumber(order.dispatch.expectedCollection, 0)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Returned</div>
              {order.dispatch.returnedAt ? (
                <div className="font-semibold text-emerald-700">
                  {formatDate(order.dispatch.returnedAt)}
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={markDriverReturned.isPending}
                  onClick={() => markDriverReturned.mutate(order.dispatch!.id)}
                >
                  {markDriverReturned.isPending ? (
                    <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  ) : (
                    <Truck className="h-3 w-3 mr-2" />
                  )}
                  Mark returned
                </Button>
              )}
            </div>
          </div>
          {order.dispatch.notes && (
            <div className="text-xs text-muted-foreground border-t pt-2">
              <span className="font-semibold">Notes:</span> {order.dispatch.notes}
            </div>
          )}
        </div>
      )}

      {/* Add Payment — visible whenever there's still something owed
           and the order isn't terminal. Sits above the Payments table
           so operators have one obvious place to record cash that
           arrives between placement and delivery. */}
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
        if (!canAdd) return null;
        return (
          <div className="rounded-lg border bg-background px-4 py-3 flex items-center justify-between gap-3">
            <div className="text-sm">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Тўлов қабул қилиш · Record a payment
              </div>
              <div className="text-xs text-muted-foreground">
                Customer paying between placement and delivery? Record it here — owner confirms it from <span className="font-mono">/payments</span>.
              </div>
            </div>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setAddPaymentOpen(true)}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Тўлов қўшиш · Add Payment
            </Button>
          </div>
        );
      })()}

      {/* Payments — chain of custody view */}
      {order.payments.length > 0 && (
        <div className="rounded-lg border bg-background overflow-hidden">
          <div className="px-4 py-3 border-b flex items-baseline justify-between">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Тўловлар · Payments
            </div>
            <div className="text-[10px] text-muted-foreground tabular-nums">
              Confirmed: {formatNumber(order.confirmedPaid, 0)} / {formatNumber(order.totalPrice, 0)}
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Method</th>
                <th className="text-right px-3 py-2">Amount</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Collected</th>
                <th className="text-left px-3 py-2">Recorded</th>
                <th className="text-left px-3 py-2">Handed over</th>
                <th className="text-left px-3 py-2">Confirmed</th>
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
                      {PAYMENT_STATUS_BADGE[p.status].label}
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
                        <span className="text-rose-700">Rejected</span>
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
                        Hand over
                      </Button>
                    )}
                    {p.status === "PENDING_CONFIRMATION" && p.handedOverToOfficeAt && (
                      <Link
                        href="/payments"
                        className="text-xs text-muted-foreground underline hover:no-underline"
                      >
                        Awaiting confirm →
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delivery proof — visible once uploaded */}
      {order.deliveryProofUrl && (
        <div className="rounded-lg border bg-background p-4 shadow-sm">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Етказиб бериш фотоси · Delivery proof
            </div>
            {order.deliveryProofUploadedAt && (
              <div className="text-[10px] text-muted-foreground">
                Uploaded {formatDate(order.deliveryProofUploadedAt)}
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
            Activity
          </div>
        </div>
        <ul className="divide-y">
          {order.events.map((e) => (
            <li key={e.id} className="px-4 py-2.5 text-sm flex items-baseline justify-between gap-4">
              <div>
                <span className="font-medium">{e.type.replace(/_/g, " ").toLowerCase()}</span>
                {e.message && <span className="text-muted-foreground"> — {e.message}</span>}
                {e.actor && (
                  <span className="text-xs text-muted-foreground ml-2">by {e.actor.name}</span>
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
      <DispatchDialog
        open={dispatchOpen}
        onClose={() => setDispatchOpen(false)}
        orderId={order.id}
        suggestedExpectedCollection={Math.max(
          0,
          Number(order.totalPrice) - Number(order.confirmedPaid),
        )}
        onDispatched={() => qc.invalidateQueries({ queryKey: ["order", params.id] })}
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
          <div className="bg-background rounded-lg shadow-2xl w-full max-w-md p-5 space-y-3">
            <h2 className="text-lg font-bold">Cancel order {order.orderNumber}?</h2>
            <p className="text-sm text-muted-foreground">
              Cancellation requires <strong>ADMIN role</strong> or the company cancel password.
              The Project will move back to Draft so it can be re-edited.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider">
                Cancel password
              </label>
              <input
                type="password"
                className="w-full h-9 rounded border px-2 text-sm tabular-nums"
                placeholder="Leave empty if you're an Admin"
                value={cancelPassword}
                onChange={(e) => setCancelPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider">
                Reason (optional)
              </label>
              <input
                className="w-full h-9 rounded border px-2 text-sm"
                placeholder="e.g. Client called to cancel"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setCancelOpen(false)}>
                Keep order
              </Button>
              <Button
                size="sm"
                className="bg-rose-600 hover:bg-rose-700 text-white"
                disabled={cancelOrder.isPending}
                onClick={() => cancelOrder.mutate()}
              >
                {cancelOrder.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Ban className="h-4 w-4 mr-2" />
                )}
                Cancel order
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
