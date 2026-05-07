"use client";

import { useState } from "react";
import { X, PackageCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CapacityCalendar } from "@/components/orders/CapacityCalendar";
import { formatNumber } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-filled summary the user is about to commit */
  summary: {
    clientName: string;
    clientPhone: string;
    clientAddress: string;
    rooms: number;
    totalArea: number;        // m² (visual / monolith)
    totalBeams: number;
    totalBlocks: number;
    roomsSubtotal: number;    // UZS
    discountPercent: number;
    discountAmount: number;
    deliveryCost: number;
    totalPrice: number;
  };
  /** Confirm handler — receives the chosen scheduled date */
  onConfirm: (scheduledAt: Date) => Promise<void>;
}

export function PlaceOrderDialog({ open, onClose, summary, onConfirm }: Props) {
  const [date, setDate] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const canConfirm = !!date && !submitting;

  async function confirm() {
    if (!date) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(date);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div>
            <h2 className="text-lg font-bold">Буюртма Бериш · Place Order</h2>
            <p className="text-xs text-muted-foreground">
              Pick a delivery / production date. Calendar shows existing load.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
          <div>
            <CapacityCalendar
              value={date}
              onChange={setDate}
              pendingArea={summary.totalArea}
              disablePast
            />
            {date && (
              <div className="mt-3 text-sm bg-emerald-50/60 border border-emerald-200 text-emerald-900 rounded px-3 py-2">
                Will be scheduled for{" "}
                <span className="font-semibold">
                  {date.toLocaleDateString("en-GB", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
                </span>
                . The order's {formatNumber(summary.totalArea, 1)} m² is
                previewed in the calendar above.
              </div>
            )}
          </div>

          {/* Summary panel */}
          <aside className="rounded-lg border bg-muted/20 p-4 space-y-3 text-sm">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Мижоз · Client
              </div>
              <div className="font-semibold">{summary.clientName}</div>
              <div className="text-xs tabular-nums">{summary.clientPhone}</div>
              {summary.clientAddress && (
                <div className="text-xs text-muted-foreground">{summary.clientAddress}</div>
              )}
            </div>
            <div className="border-t pt-3">
              <Row label="Хоналар · Rooms" value={summary.rooms} />
              <Row label="Майдон · Slab area" value={`${formatNumber(summary.totalArea, 2)} m²`} />
              <Row label="Балка · Beams" value={summary.totalBeams} />
              <Row label="Ғишт · Blocks" value={summary.totalBlocks} />
            </div>
            <div className="border-t pt-3">
              <Row label="Сумма · Subtotal" value={formatNumber(summary.roomsSubtotal, 0)} />
              {summary.discountPercent > 0 && (
                <Row
                  label={`Чегирма ${summary.discountPercent}%`}
                  value={`− ${formatNumber(summary.discountAmount, 0)}`}
                  rose
                />
              )}
              {summary.deliveryCost > 0 && (
                <Row label="Етказиб бериш · Delivery" value={formatNumber(summary.deliveryCost, 0)} />
              )}
              <div className="flex items-baseline justify-between border-t pt-2 mt-2">
                <span className="font-bold">Жами · Total</span>
                <span className="font-black text-emerald-700 text-xl tabular-nums">
                  {formatNumber(summary.totalPrice, 0)}{" "}
                  <span className="text-xs text-muted-foreground font-normal">UZS</span>
                </span>
              </div>
            </div>
          </aside>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t bg-muted/20 flex items-center justify-between">
          {error ? (
            <div className="text-sm text-destructive">{error}</div>
          ) : (
            <div className="text-xs text-muted-foreground">
              Prices freeze at this moment. The Project's status flips to{" "}
              <span className="font-semibold">ORDERED</span>.
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-orange-500 hover:bg-orange-600 text-white"
              disabled={!canConfirm}
              onClick={confirm}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PackageCheck className="h-4 w-4 mr-2" />
              )}
              Буюртма Бериш · Place Order
            </Button>
          </div>
        </div>
      </div>
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
