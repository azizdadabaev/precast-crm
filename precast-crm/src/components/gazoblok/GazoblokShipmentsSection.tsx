"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Truck, Package, CheckCircle2, Clock, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useT } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { GazoblokSplitShipmentModal } from "./GazoblokSplitShipmentModal";
import type { GazoblokLine } from "@/lib/gazoblok-weight";

type ShipmentStatus = "PENDING" | "LOADED" | "DELIVERED";

interface ShipmentData {
  id: string;
  number: number;
  status: ShipmentStatus;
  loadedLines: Record<string, number> | null;
  loadedPhotoUrls: string[];
  loadedAt: string | null;
  deliveredAt: string | null;
  notes: string | null;
}

interface Props {
  orderId: string;
  shipments: ShipmentData[];
  lines: GazoblokLine[];
  orderStatus: string;
  onRefresh: () => void;
}

const STATUS_ICONS: Record<ShipmentStatus, React.ComponentType<{ className?: string }>> = {
  PENDING:   Clock,
  LOADED:    Package,
  DELIVERED: CheckCircle2,
};

const STATUS_CHIP_VARIANT: Record<ShipmentStatus, "neutral" | "warning" | "success"> = {
  PENDING:   "neutral",
  LOADED:    "warning",
  DELIVERED: "success",
};

const STATUS_LABELS: Record<ShipmentStatus, { uz: string; en: string }> = {
  PENDING:   { uz: "Кутилмоқда", en: "Pending" },
  LOADED:    { uz: "Юкланган", en: "Loaded" },
  DELIVERED: { uz: "Етказилган", en: "Delivered" },
};

export function GazoblokShipmentsSection({
  orderId, shipments, lines, orderStatus, onRefresh,
}: Props) {
  const t = useT();
  const [loadModalShipment, setLoadModalShipment] = useState<ShipmentData | null>(null);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const labelById = new Map(lines.map((l) => [l.lineId, l.label]));

  const genericError = t("Хатолик юз берди. Қайта уриниб кўринг.", "Something went wrong. Try again.");

  async function createNewShipment() {
    setCreatingNew(true);
    setError(null);
    try {
      const res = await fetch(`/api/gazoblok/orders/${orderId}/shipments`, { method: "POST" });
      let json: { ok?: boolean; error?: string } = {};
      try {
        json = await res.json() as { ok?: boolean; error?: string };
      } catch {
        // non-JSON response (e.g. HTML error page) — fall through to generic error
      }
      if (!res.ok || !json.ok) throw new Error(json.error ?? genericError);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : genericError);
    } finally {
      setCreatingNew(false);
    }
  }

  async function deleteShipment(shipmentId: string) {
    setDeletingId(shipmentId);
    setError(null);
    try {
      const res = await fetch(`/api/gazoblok/orders/${orderId}/shipments/${shipmentId}`, {
        method: "DELETE",
      });
      let json: { ok?: boolean; error?: string } = {};
      try {
        json = await res.json() as { ok?: boolean; error?: string };
      } catch {
        // non-JSON response (e.g. HTML error page) — fall through to generic error
      }
      if (!res.ok || !json.ok) throw new Error(json.error ?? genericError);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : genericError);
    } finally {
      setDeletingId(null);
    }
  }

  async function deliverShipment(shipmentId: string) {
    setDeliveringId(shipmentId);
    setError(null);
    try {
      const res = await fetch(`/api/gazoblok/orders/${orderId}/shipments/${shipmentId}`, {
        method: "PATCH",
      });
      let json: { ok?: boolean; error?: string } = {};
      try {
        json = await res.json() as { ok?: boolean; error?: string };
      } catch {
        // non-JSON response (e.g. HTML error page) — fall through to generic error
      }
      if (!res.ok || !json.ok) throw new Error(json.error ?? genericError);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : genericError);
    } finally {
      setDeliveringId(null);
    }
  }

  // ── Delete two-tap confirm ────────────────────────────────────
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    },
    [],
  );
  const handleDeleteClick = (id: string) => {
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    if (confirmDeleteId === id) {
      setConfirmDeleteId(null);
      void deleteShipment(id);
      return;
    }
    setConfirmDeleteId(id);
    confirmTimerRef.current = setTimeout(() => setConfirmDeleteId(null), 3000);
  };

  // prevShipments for the modal = the OTHER shipments' loaded counts (exclude the
  // one being loaded; only those already loaded).
  function prevShipmentsFor(currentId: string): Array<Record<string, number>> {
    return shipments
      .filter((s) => s.id !== currentId && s.status !== "PENDING" && s.loadedLines !== null)
      .map((s) => (s.loadedLines as Record<string, number>) ?? {});
  }

  const canAddMore = orderStatus !== "DELIVERED" && orderStatus !== "CANCELED";

  return (
    <div className="rounded-lg border bg-background overflow-hidden">
      <button
        type="button"
        className="w-full px-4 py-3 border-b flex items-center justify-between gap-2 hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-baseline justify-between gap-2 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Жўнатмалар<span className="lang-en"> · Shipments</span>
          </div>
          <div className="text-[10px] text-muted-foreground tabular-nums">
            {shipments.length} {t("та жўнатма", "shipments")}
          </div>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ml-2 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && <div className="divide-y">
        {shipments.map((s) => {
          const Icon = STATUS_ICONS[s.status];

          return (
            <div key={s.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{t("Жўнатма", "Shipment")} {s.number}</span>
                  <Chip variant={STATUS_CHIP_VARIANT[s.status]}>
                    <Icon className="h-3 w-3" />
                    {t(STATUS_LABELS[s.status].uz, STATUS_LABELS[s.status].en)}
                  </Chip>
                </div>

                {orderStatus !== "CANCELED" && (
                  <div className="flex gap-2">
                    {s.status === "PENDING" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLoadModalShipment(s)}
                        >
                          <Package className="h-3.5 w-3.5 mr-1.5" />
                          {t("Юклаш", "Load")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:bg-destructive/10 hover:border-destructive/40"
                          aria-label={t("Ўчириш", "Delete")}
                          disabled={deletingId === s.id}
                          onClick={() => handleDeleteClick(s.id)}
                        >
                          {deletingId === s.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : confirmDeleteId === s.id
                              ? t("Тасдиқлайсизми?", "Confirm?")
                              : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      </>
                    )}
                    {s.status === "LOADED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={deliveringId === s.id}
                        onClick={() => deliverShipment(s.id)}
                      >
                        {deliveringId === s.id
                          ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                        {t("Етказилди", "Delivered")}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {s.loadedLines && Object.keys(s.loadedLines).length > 0 && (
                <div className="text-xs text-muted-foreground space-x-3 font-mono">
                  {Object.entries(s.loadedLines as Record<string, number>).map(([lineId, cnt]) => (
                    <span key={lineId}>{cnt} × {labelById.get(lineId) ?? lineId}</span>
                  ))}
                </div>
              )}

              <div className="flex gap-4 text-[10px] text-muted-foreground">
                {s.loadedAt && <span>{t("Юкланди:", "Loaded:")} {formatDate(s.loadedAt)}</span>}
                {s.deliveredAt && <span className="text-success">{t("Етказилди:", "Delivered:")} {formatDate(s.deliveredAt)}</span>}
              </div>

              {s.loadedPhotoUrls.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {s.loadedPhotoUrls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer">
                      <img
                        src={url}
                        alt={`Shipment ${s.number} photo ${i + 1}`}
                        className="max-h-24 rounded border object-cover hover:opacity-90 transition-opacity"
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>}

      {open && canAddMore && (
        <div className="border-t px-4 py-3">
          <Button
            size="sm"
            variant="outline"
            disabled={creatingNew}
            onClick={createNewShipment}
          >
            {creatingNew
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <Plus className="h-3.5 w-3.5 mr-1.5" />}
            + {t("Янги жўнатма", "New shipment")}
          </Button>
        </div>
      )}

      {error && (
        <div className="border-t px-4 py-2 text-sm text-destructive bg-destructive/10">
          {error}
        </div>
      )}

      {loadModalShipment && (
        <GazoblokSplitShipmentModal
          orderId={orderId}
          shipment={{ id: loadModalShipment.id, number: loadModalShipment.number }}
          lines={lines}
          prevShipments={prevShipmentsFor(loadModalShipment.id)}
          open={true}
          onClose={() => setLoadModalShipment(null)}
          onSuccess={() => { setLoadModalShipment(null); onRefresh(); }}
        />
      )}
    </div>
  );
}
