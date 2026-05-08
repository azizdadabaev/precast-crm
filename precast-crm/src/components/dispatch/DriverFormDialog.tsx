"use client";

import { useState } from "react";
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

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: { name: string; phone: string; notes: string | null }) => Promise<void>;
}

/** Add Driver dialog. Phone is normalized server-side; we just accept the
 *  raw operator input and pass it through. */
export function DriverFormDialog({ open, onClose, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setPhone("");
    setNotes("");
    setError(null);
    setSubmitting(false);
  }

  async function save() {
    if (name.trim().length < 2) {
      setError("Name is too short");
      return;
    }
    if (phone.replace(/\D+/g, "").length < 5) {
      setError("Phone is too short");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        phone: phone.trim(),
        notes: notes.trim() ? notes.trim() : null,
      });
      reset();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Янги хайдовчи · New Driver</DialogTitle>
          <DialogDescription>
            Phone is normalized to digits-only on save (matches the Client phone format).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Исм · Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Olimjon Karimov" />
          </div>
          <div className="space-y-1.5">
            <Label>Тел рақам · Phone *</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+998 90 ___ __ __"
              className="tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Изоҳ · Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 12-ton truck, weekend backup" />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
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
