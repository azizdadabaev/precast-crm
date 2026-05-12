"use client";

import { useEffect, useState } from "react";
import { Truck, Loader2, AlertCircle } from "lucide-react";
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
import { api } from "@/lib/fetcher";
import { formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";

interface Driver {
  id: string;
  name: string;
  phone: string;
  active: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Order id + the suggested expected-collection (total - already-confirmed). */
  orderId: string;
  suggestedExpectedCollection: number;
  onDispatched: () => void;
}

export function DispatchDialog({
  open,
  onClose,
  orderId,
  suggestedExpectedCollection,
  onDispatched,
}: Props) {
  const t = useT();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverId, setDriverId] = useState("");
  const [truckIdentifier, setTruckIdentifier] = useState("");
  const [expected, setExpected] = useState<number | "">(suggestedExpectedCollection);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync the suggested amount when the dialog opens for a different order
  useEffect(() => {
    if (open) {
      setExpected(suggestedExpectedCollection);
      setError(null);
      setSubmitting(false);
    }
  }, [open, suggestedExpectedCollection]);

  // Load active drivers on first open
  useEffect(() => {
    if (!open) return;
    let alive = true;
    api<Driver[]>("/api/drivers?activeOnly=true")
      .then((d) => {
        if (alive) setDrivers(d);
      })
      .catch(() => {
        if (alive) setDrivers([]);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  async function submit() {
    if (!driverId) {
      setError(t("Ҳайдовчини танланг", "Select a driver"));
      return;
    }
    if (expected === "" || Number(expected) < 0) {
      setError(t("Кутилган сумма манфий бўлмаслиги керак", "Expected collection cannot be negative"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api(`/api/orders/${orderId}/dispatch`, {
        method: "POST",
        json: {
          driverId,
          truckIdentifier: truckIdentifier.trim() || null,
          expectedCollection: Number(expected),
          notes: notes.trim() || null,
        },
      });
      onDispatched();
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
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary shrink-0" />
            <span>
              Жўнатиш
              <span className="lang-en text-muted-foreground font-normal text-base">
                {" "}· Dispatch
              </span>
            </span>
          </DialogTitle>
          <DialogDescription>
            {t(
              "Юк машина материаллар билан заводдан чиқади. Ҳайдовчи мижоздан етказиб бериш жойида нақд пул йиғади.",
              "Truck leaves the factory with materials. The driver collects cash from the customer at the delivery site.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Хайдовчи<span className="lang-en"> · Driver</span> *</Label>
            <Select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">{t("— ҳайдовчини танланг —", "— select driver —")}</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            {drivers.length === 0 && (
              <div className="text-xs text-muted-foreground italic">
                {t(
                  "Фаол ҳайдовчилар йўқ. Аввал /drivers бўлимида қўшинг.",
                  "No active drivers. Add one in /drivers first.",
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Машина рақами<span className="lang-en"> · Truck identifier</span></Label>
            <Input
              className="tabular-nums"
              value={truckIdentifier}
              onChange={(e) => setTruckIdentifier(e.target.value)}
              placeholder={t("01 A 123 BC (ихтиёрий)", "01 A 123 BC (optional)")}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Кутилаётган сумма<span className="lang-en"> · Expected collection</span> (UZS) *</Label>
            <Input
              type="number"
              min="0"
              step="1000"
              className="tabular-nums"
              value={expected}
              onChange={(e) =>
                setExpected(e.target.value === "" ? "" : Number(e.target.value))
              }
            />
            <div className="text-[11px] text-muted-foreground">
              {t(
                "Буюртма жами − тасдиқланган тўловлар билан тўлдирилган. Таҳрирланиши мумкин — эга кейинроқ тасдиқлаш пайтида тафовутларни ҳал қилади.",
                "Pre-filled with order total − confirmed payments. Editable — the owner adjudicates discrepancies later when confirming the recorded payment.",
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Изоҳ<span className="lang-en"> · Notes</span></Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t(
                "масалан: мижоз эрта тонгда етказиб беришни сўради",
                "e.g. customer asked for early-morning delivery",
              )}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 px-3 py-2 rounded-md">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 pt-2 border-t border-border -mx-6 px-6 -mb-2 pb-1">
          <div className="text-xs text-text-tertiary">
            {t("Жўнатиш яратилади ва ҳолат", "Will create a Dispatch + flip status to")}{" "}
            <span className="font-mono font-bold text-foreground">DISPATCHED</span>
            {t(" га ўзгаради.", ".")}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              {t("Бекор қилиш", "Cancel")}
            </Button>
            <Button
              size="sm"
              onClick={submit}
              disabled={submitting || drivers.length === 0}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Truck className="h-4 w-4 mr-2" />
              )}
              {expected !== "" && Number(expected) > 0
                ? `${t("Жўнатиш", "Dispatch")} · ${formatNumber(Number(expected), 0)} ${t("кутилмоқда", "expected")}`
                : t("Жўнатиш", "Dispatch")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
