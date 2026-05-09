"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatNumber } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  /** The auto-picked rate from the engine for this row. Read-only. */
  autoRate: number;
  /** The catalog tier the operator just selected. Read-only. */
  selectedRate: number;
  /** Pre-fill if a reason already exists (e.g. they're changing from one
   *  override to another). */
  initialReason?: string | null;
  /** Confirm the override. Reason is trimmed; empty becomes null. */
  onConfirm: (reason: string | null) => void;
}

/**
 * Confirmation dialog shown when the operator picks a non-Auto tier
 * from the per-row Rate dropdown. Displays the auto-picked vs chosen
 * rates side-by-side and captures an optional 200-char reason. Reverting
 * to Auto does NOT use this dialog — that action is always safe.
 */
export function RateOverrideDialog({
  open,
  onClose,
  autoRate,
  selectedRate,
  initialReason,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason(initialReason ?? "");
  }, [open, initialReason]);

  const direction = selectedRate > autoRate ? "↑ markup" : "↓ discount";
  const directionCls =
    selectedRate > autoRate ? "text-rose-700" : "text-emerald-700";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-amber-600" />
            Нархни ўзгартиришни тасдиқлаш · Confirm rate change
          </DialogTitle>
          <DialogDescription>
            Per-row m² rate will be replaced for this room only. Reverting to
            Auto restores the engine's tier value.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm pt-1">
          <div className="rounded border bg-muted/30 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Auto-pick
            </div>
            <div className="font-semibold tabular-nums">
              {formatNumber(autoRate, 0)}
            </div>
          </div>
          <div className="rounded border bg-amber-50 border-amber-200 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-800">
              Selected
            </div>
            <div className={`font-semibold tabular-nums ${directionCls}`}>
              {formatNumber(selectedRate, 0)}{" "}
              <span className="text-[11px] font-normal">{direction}</span>
            </div>
          </div>
        </div>

        <div className="space-y-1.5 pt-1">
          <Label className="text-xs uppercase tracking-wider font-bold">
            Сабаб (ихтиёрий) · Reason (optional)
          </Label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder="e.g. owner-approved discount; rush-job markup; competitor match"
          />
          <div className="text-[10px] text-muted-foreground text-right tabular-nums">
            {reason.length} / 200
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Бекор қилиш · Cancel
          </Button>
          <Button
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => onConfirm(reason.trim() || null)}
          >
            <Pencil className="h-3.5 w-3.5 mr-2" />
            Тасдиқлаш · Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
