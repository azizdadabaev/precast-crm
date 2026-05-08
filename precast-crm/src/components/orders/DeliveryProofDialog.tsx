"use client";

import { useEffect, useRef, useState } from "react";
import { X, Truck, Upload, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface DeliveryFormPayload {
  file: File;
  cashAmount: number;
  noCashCollected: boolean;
  noCashCollectedNote: string | null;
  driverReturned: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** The dispatch's expected collection — pre-fills the cash amount input. */
  expectedCollection: number;
  /** Called with the chosen file + cash fields. Component awaits the promise; closes
   *  itself on resolve. */
  onUpload: (payload: DeliveryFormPayload) => Promise<void>;
}

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Modal that gates the IN_PRODUCTION → DELIVERED transition behind a
 * mandatory proof photo (truck loaded with product).
 *
 *   - JPG / PNG / WEBP only
 *   - Max 8 MB
 *   - Live preview after selection
 *   - Drag-and-drop or click-to-pick
 *   - Disabled confirm until a valid image is chosen
 */
export function DeliveryProofDialog({ open, onClose, expectedCollection, onUpload }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Cash collection state — operator records what the driver actually
  // brought back. Defaults to the dispatch's expected amount; operator
  // adjusts down when the customer paid less, or toggles "no cash" if
  // the customer is paying later.
  const [cashAmount, setCashAmount] = useState<number | "">(expectedCollection);
  const [noCashCollected, setNoCashCollected] = useState(false);
  const [noCashCollectedNote, setNoCashCollectedNote] = useState("");
  const [driverReturned, setDriverReturned] = useState(false);

  // Re-sync the suggested cash amount when re-opening for a new dispatch
  useEffect(() => {
    if (open) {
      setCashAmount(expectedCollection);
      setNoCashCollected(false);
      setNoCashCollectedNote("");
      setDriverReturned(false);
    }
  }, [open, expectedCollection]);

  // Manage object URL lifecycle so we don't leak
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setFile(null);
      setError(null);
      setSubmitting(false);
      setDragOver(false);
    }
  }, [open]);

  function pickFile(f: File | null) {
    if (!f) return;
    if (!ACCEPT.split(",").includes(f.type)) {
      setError("Only JPG, PNG, or WEBP images are accepted.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("Image is too large (max 8 MB).");
      return;
    }
    if (f.size === 0) {
      setError("Selected file is empty.");
      return;
    }
    setError(null);
    setFile(f);
  }

  async function confirm() {
    if (!file) return;
    if (noCashCollected && noCashCollectedNote.trim().length < 3) {
      setError("Please add a note explaining why no cash was collected.");
      return;
    }
    if (!noCashCollected && cashAmount !== "" && Number(cashAmount) < 0) {
      setError("Cash amount cannot be negative.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onUpload({
        file,
        cashAmount: noCashCollected ? 0 : Number(cashAmount || 0),
        noCashCollected,
        noCashCollectedNote: noCashCollected ? noCashCollectedNote.trim() : null,
        driverReturned,
      });
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-3 border-b">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-amber-600" />
            <div>
              <h2 className="text-lg font-bold">Delivery proof required</h2>
              <p className="text-xs text-muted-foreground">
                Upload a photo of the loaded truck to mark this order as
                delivered.
              </p>
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

        {/* Body */}
        <div className="p-5">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />

          {!file ? (
            <div
              ref={dropRef}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/30"
              }`}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
              <div className="mt-3 text-sm font-medium">
                Drop a photo here, or click to choose
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                JPG, PNG, or WEBP · up to 8 MB
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden border bg-black/5 max-h-80">
                {previewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="Delivery proof preview"
                    className="block w-full max-h-80 object-contain"
                  />
                )}
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="text-muted-foreground truncate">
                  {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                  className="underline hover:no-underline"
                  disabled={submitting}
                >
                  Choose a different file
                </button>
              </div>
            </div>
          )}

          {/* Cash collection */}
          <div className="mt-5 space-y-3 border-t pt-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Нақд пул · Cash collected from customer
            </div>

            {!noCashCollected && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider">
                  Сумма · Amount (UZS)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-primary/40"
                  value={cashAmount}
                  onChange={(e) =>
                    setCashAmount(e.target.value === "" ? "" : Number(e.target.value))
                  }
                />
                <div className="text-[11px] text-muted-foreground">
                  Pre-filled with the dispatch's expected collection. Owner reconciles any shortfall later.
                </div>
              </div>
            )}

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 mt-0.5 accent-primary cursor-pointer"
                checked={noCashCollected}
                onChange={(e) => {
                  setNoCashCollected(e.target.checked);
                  if (e.target.checked) setCashAmount(0);
                }}
              />
              <div className="text-sm">
                <span className="font-semibold">No cash collected</span>
                <span className="text-muted-foreground"> · driver came back empty (e.g. customer will transfer later)</span>
              </div>
            </label>

            {noCashCollected && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider">
                  Сабаб · Reason (required, min 3 chars)
                </label>
                <input
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  value={noCashCollectedNote}
                  onChange={(e) => setNoCashCollectedNote(e.target.value)}
                  placeholder="e.g. Customer will pay by bank transfer tomorrow"
                />
              </div>
            )}

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 mt-0.5 accent-primary cursor-pointer"
                checked={driverReturned}
                onChange={(e) => setDriverReturned(e.target.checked)}
              />
              <div className="text-sm">
                <span className="font-semibold">Driver returned to office</span>
                <span className="text-muted-foreground"> · stamps the dispatch's return time</span>
              </div>
            </label>
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t bg-muted/20 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            The photo will be saved with the order's audit trail.
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
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!file || submitting}
              onClick={confirm}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Truck className="h-4 w-4 mr-2" />
              )}
              Mark Delivered
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
