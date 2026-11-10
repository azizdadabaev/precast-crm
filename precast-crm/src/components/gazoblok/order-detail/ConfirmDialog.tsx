"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { BTN_OUTLINE, BTN_PRIMARY, ICON } from "./ui";

/** Small confirm dialog: mark delivered, cancel (optional reason), reject a payment (optional reason). */
export function ConfirmDialog({
  title,
  text,
  reasonLabel,
  confirmLabel,
  icon,
  danger,
  pending,
  onClose,
  onConfirm,
}: {
  title: string;
  text?: ReactNode;
  /** When set, shows an optional reason field. */
  reasonLabel?: string;
  confirmLabel: string;
  icon: ReactNode;
  danger?: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason: string | undefined) => void;
}) {
  const t = useT();
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(v) => { if (!v && !pending) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
          {text && <DialogDescription className="text-[13px]">{text}</DialogDescription>}
        </DialogHeader>
        {reasonLabel && (
          <div>
            <label htmlFor="confirm-reason" className="mb-1.5 block text-xs font-semibold">
              {reasonLabel} <span className="font-medium text-muted-foreground">{t("ихтиёрий", "optional")}</span>
            </label>
            <textarea
              id="confirm-reason"
              rows={3}
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
        )}
        <div className="flex gap-2 sm:justify-end">
          <button type="button" className={cn(BTN_OUTLINE, "flex-1 sm:flex-none")} onClick={onClose} disabled={pending}>
            {t("Орқага", "Back")}
          </button>
          <button
            type="button"
            className={cn(BTN_PRIMARY, "flex-[2] sm:flex-none", danger ? "bg-destructive hover:bg-destructive/90" : "bg-success hover:bg-success/90")}
            disabled={pending}
            onClick={() => onConfirm(reason.trim() || undefined)}
            data-action="confirm-dialog"
          >
            {pending ? <Loader2 className="animate-spin" {...ICON} /> : icon}
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
