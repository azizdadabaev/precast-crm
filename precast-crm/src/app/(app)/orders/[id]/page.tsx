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
} from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import { DeliveryProofDialog } from "@/components/orders/DeliveryProofDialog";

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: "PLACED" | "IN_PRODUCTION" | "DELIVERED" | "PAID" | "CANCELED";
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
      pattern: "GB" | "BGB" | "GBG";
      beamLength: string;
      beamCount: number;
      totalBlocks: number;
      monolithArea: string;
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
}

const STATUS_FLOW: Array<{ key: OrderDetail["status"]; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "PLACED",        label: "Placed",        icon: CheckCircle2 },
  { key: "IN_PRODUCTION", label: "In production", icon: Hammer },
  { key: "DELIVERED",     label: "Delivered",     icon: Truck },
  { key: "PAID",          label: "Paid",          icon: CreditCard },
];

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelPassword, setCancelPassword] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [proofOpen, setProofOpen] = useState(false);
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

  /** Upload the delivery photo and advance to DELIVERED in one shot. */
  async function uploadDeliveryProof(file: File) {
    const fd = new FormData();
    fd.append("file", file);
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
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              Жами · Total
            </div>
            <div className="text-3xl font-black tabular-nums text-emerald-700">
              {formatNumber(order.totalPrice, 0)}
              <span className="text-xs text-muted-foreground font-normal ml-1">UZS</span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
          {error}
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
              const onClick = () => {
                if (needsProof) {
                  setProofOpen(true);
                } else {
                  updateStatus.mutate(s.key);
                }
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
                      {needsProof ? "→ requires photo" : "→ click to advance"}
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

      {/* Schedule + breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border bg-background p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Schedule
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">
              {new Date(order.scheduledAt).toLocaleDateString("en-GB", {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Placed {formatDate(order.placedAt)}
          </div>
        </div>

        <div className="rounded-lg border bg-background p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Materials
          </div>
          <div className="space-y-1 text-sm">
            <Row label="Slab area" value={`${formatNumber(order.totalArea, 2)} m²`} />
            <Row label="Total beams" value={order.totalBeams} />
            <Row label="Total blocks" value={order.totalBlocks} />
          </div>
        </div>

        <div className="rounded-lg border bg-background p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Pricing breakdown
          </div>
          <div className="space-y-1 text-sm">
            <Row label="Rooms subtotal" value={formatNumber(order.roomsSubtotal, 0)} />
            {Number(order.discountPercent) > 0 && (
              <Row
                label={`Discount ${formatNumber(order.discountPercent, 1)}%`}
                value={`− ${formatNumber(order.discountAmount, 0)}`}
                rose
              />
            )}
            {Number(order.deliveryCost) > 0 && (
              <Row label="Delivery" value={formatNumber(order.deliveryCost, 0)} />
            )}
            {Number(order.otherCost) > 0 && (
              <Row label="Other" value={formatNumber(order.otherCost, 0)} />
            )}
          </div>
        </div>
      </div>

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
        onUpload={uploadDeliveryProof}
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

function Row({
  label,
  value,
  rose,
}: {
  label: string;
  value: string | number;
  rose?: boolean;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${rose ? "text-rose-700" : ""}`}>{value}</span>
    </div>
  );
}
