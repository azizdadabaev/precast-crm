"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export type DiscrepancyStatusValue =
  | "OPEN"
  | "RESOLVED_RECOVERED"
  | "RESOLVED_DISCOUNT"
  | "RESOLVED_WRITEOFF"
  | "DISPUTED";

interface Props {
  open: boolean;
  onClose: () => void;
  initialStatus: DiscrepancyStatusValue;
  onSubmit: (status: DiscrepancyStatusValue, note: string) => Promise<void>;
}

const OPTIONS: Array<{ value: DiscrepancyStatusValue; label: string }> = [
  { value: "OPEN",                label: "OPEN — keep tracking" },
  { value: "RESOLVED_RECOVERED",  label: "RESOLVED_RECOVERED — customer paid the rest" },
  { value: "RESOLVED_DISCOUNT",   label: "RESOLVED_DISCOUNT — owner approved as discount" },
  { value: "RESOLVED_WRITEOFF",   label: "RESOLVED_WRITEOFF — wrote off as loss" },
  { value: "DISPUTED",            label: "DISPUTED — HR / disciplinary action" },
];

export function DiscrepancyUpdateDialog({ open, onClose, initialStatus, onSubmit }: Props) {
  const [status, setStatus] = useState<DiscrepancyStatusValue>(initialStatus);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStatus(initialStatus);
      setNote("");
      setError(null);
      setSubmitting(false);
    }
  }, [open, initialStatus]);

  async function save() {
    if (note.trim().length < 5) {
      setError("Resolution note must be at least 5 characters");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(status, note.trim());
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update discrepancy</DialogTitle>
          <DialogDescription>
            Move the discrepancy through its lifecycle. The note is captured in the audit log and on the order's events.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as DiscrepancyStatusValue)}>
              {OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Resolution note (required, min 5 chars)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Customer paid the rest by bank transfer on May 9"
            />
          </div>
          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
