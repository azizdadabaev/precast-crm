"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CalendarClock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CapacityCalendar } from "@/components/orders/CapacityCalendar";
import { api } from "@/lib/fetcher";
import { formatNumber } from "@/lib/utils";

/**
 * Date-only reschedule (owner 2026-10-06): pick a day on the orders calendar,
 * press «Сақлаш», confirm. Sends PATCH /api/orders/[id] { scheduledAt } — no
 * re-pricing, unlike edit → save. The preview m² is what is still left to ship.
 */
export function RescheduleDialog({
  open,
  onClose,
  orderId,
  current,
  previewArea,
  formatLabel,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  current: Date;
  previewArea: number;
  formatLabel: (d: Date) => string;
  onSaved: () => void;
}) {
  const [date, setDate] = useState<Date | null>(null);
  const [confirming, setConfirming] = useState(false);

  const save = useMutation({
    mutationFn: (d: Date) => api(`/api/orders/${orderId}`, { method: "PATCH", json: { scheduledAt: d } }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const { reset } = save;

  useEffect(() => {
    if (open) {
      setDate(null);
      setConfirming(false);
      reset();
    }
  }, [open, reset]);

  if (!open) return null;
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const changed = date != null && !sameDay(date, current);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-card rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <CalendarClock className="h-5 w-5" />
              Санани ўзгартириш
            </h2>
            <p className="text-xs text-muted-foreground">
              Ҳозирги сана: <span className="font-semibold">{formatLabel(current)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-11 w-11 inline-flex items-center justify-center rounded hover:bg-muted"
            aria-label="Ёпиш"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {!confirming ? (
            <>
              <CapacityCalendar value={date} onChange={setDate} pendingArea={previewArea} disablePast />
              <p className="text-xs text-muted-foreground">
                Календарда шу буюртманинг жўнатилмаган қисми кўрсатилади:{" "}
                <span className="font-mono tabular-nums">{formatNumber(previewArea, 2)} м²</span>
              </p>
            </>
          ) : (
            <div className="rounded-md border border-border bg-muted/30 px-4 py-5 text-center">
              <div className="text-sm text-muted-foreground mb-1">Етказиб бериш санаси ўзгарсинми?</div>
              <div className="text-lg font-semibold">
                {formatLabel(current)} <span className="text-muted-foreground">→</span>{" "}
                {date ? formatLabel(date) : ""}
              </div>
            </div>
          )}
          {save.isError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {(save.error as Error).message || "Санани ўзгартиришда хато"}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          {!confirming ? (
            <>
              <Button variant="outline" onClick={onClose}>
                Бекор
              </Button>
              <Button disabled={!changed} onClick={() => setConfirming(true)}>
                Сақлаш
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={save.isPending}>
                Бекор
              </Button>
              <Button onClick={() => date && save.mutate(date)} disabled={save.isPending}>
                {save.isPending ? "Сақланмоқда…" : "Ҳа, ўзгартириш"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
