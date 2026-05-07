"use client";

import { useEffect, useState } from "react";
import { X, Sliders, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  open: boolean;
  onClose: () => void;
  /** What's currently in stock — shown for context. */
  currentQuantity: number;
  /** Display label (e.g. "Балка 4.30 m" or "Ғишт · Block"). */
  label: string;
  onSubmit: (delta: number, note: string) => Promise<void>;
}

export function AdjustStockDialog({
  open,
  onClose,
  currentQuantity,
  label,
  onSubmit,
}: Props) {
  const [delta, setDelta] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDelta("");
      setNote("");
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const deltaNum = delta === "" ? 0 : Number(delta);
  const noteOk = note.trim().length >= 3;
  const canSave = deltaNum !== 0 && noteOk && !submitting;
  const projected = currentQuantity + deltaNum;

  async function submit() {
    if (!canSave) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(deltaNum, note.trim());
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-start justify-between px-5 py-3 border-b">
          <div className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-amber-600" />
            <div>
              <h2 className="text-lg font-bold">Adjust stock</h2>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-muted disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="text-sm">
            Current quantity:{" "}
            <span className="font-semibold tabular-nums">{currentQuantity}</span>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold">
              Delta · ўзгариш
            </label>
            <Input
              type="number"
              step="1"
              className="h-9 mt-1 text-center tabular-nums"
              placeholder="e.g. +5 or -3"
              value={delta}
              onChange={(e) =>
                setDelta(e.target.value === "" ? "" : Number(e.target.value))
              }
            />
            <div className="text-[11px] text-muted-foreground mt-1">
              Projected after change:{" "}
              <span
                className={`font-semibold tabular-nums ${
                  projected < 0 ? "text-rose-700" : ""
                }`}
              >
                {projected}
              </span>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold">
              Изоҳ · Note <span className="text-destructive">*</span>
            </label>
            <Input
              className="h-9 mt-1"
              placeholder="e.g. Recount after audit, +3 found in yard"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t bg-muted/20 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Recorded with your name in the audit trail.
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button size="sm" disabled={!canSave} onClick={submit}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Apply
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
