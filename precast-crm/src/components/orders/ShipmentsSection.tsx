"use client";

import { useState } from "react";
import { Plus, Truck, Package, CheckCircle2, Clock, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { formatDate, formatNumber } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import { SplitShipmentLoadModal } from "./SplitShipmentLoadModal";
import type { BeamGroup } from "@/lib/weight-distributor";

type ShipmentStatus = "PENDING" | "LOADED" | "DISPATCHED" | "DELIVERED";

interface ShipmentData {
  id: string;
  number: number;
  status: ShipmentStatus;
  loadedBeams: Record<string, number> | null;
  loadedBlocks: number | null;
  loadedPhotoUrl: string | null;
  loadedAt: string | null;
  driverWillCollectCash: boolean;
  cashToCollect: string | null;
  truckIdentifier: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  notes: string | null;
  driver: { id: string; name: string; phone: string } | null;
  dispatchedBy: { id: string; name: string } | null;
}

interface Props {
  orderId: string;
  shipments: ShipmentData[];
  beamGroups: BeamGroup[];
  totalBlocks: number;
  orderStatus: string;
  onRefresh: () => void;
}

const STATUS_ICONS: Record<ShipmentStatus, React.ComponentType<{ className?: string }>> = {
  PENDING:    Clock,
  LOADED:     Package,
  DISPATCHED: Truck,
  DELIVERED:  CheckCircle2,
};

const STATUS_COLORS: Record<ShipmentStatus, string> = {
  PENDING:    "text-muted-foreground bg-muted/40 border-border",
  LOADED:     "text-amber-700 bg-amber-50 border-amber-200",
  DISPATCHED: "text-sky-700 bg-sky-50 border-sky-200",
  DELIVERED:  "text-emerald-700 bg-emerald-50 border-emerald-200",
};

const STATUS_LABEL_UZ: Record<ShipmentStatus, string> = {
  PENDING:    "Кутилмоқда",
  LOADED:     "Юкланган",
  DISPATCHED: "Жўнатилган",
  DELIVERED:  "Етказилган",
};

export function ShipmentsSection({
  orderId, shipments, beamGroups, totalBlocks, orderStatus, onRefresh,
}: Props) {
  const t = useT();
  const [loadModalShipment, setLoadModalShipment] = useState<ShipmentData | null>(null);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prevLoaded = shipments
    .filter((s) => s.loadedBeams !== null && s.status !== "PENDING")
    .map((s) => ({
      loadedBeams: (s.loadedBeams as Record<string, number>) ?? {},
      loadedBlocks: s.loadedBlocks ?? 0,
    }));

  async function createNewShipment() {
    setCreatingNew(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/shipments`, { method: "POST" });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed");
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setCreatingNew(false);
    }
  }

  async function dispatchShipment(shipmentId: string) {
    setDispatchingId(shipmentId);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/shipments/${shipmentId}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverWillCollectCash: false }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed");
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setDispatchingId(null);
    }
  }

  async function deleteShipment(shipmentId: string) {
    setDeletingId(shipmentId);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/shipments/${shipmentId}`, {
        method: "DELETE",
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed");
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setDeletingId(null);
    }
  }

  async function deliverShipment(shipmentId: string) {
    setDeliveringId(shipmentId);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/shipments/${shipmentId}/deliver`, {
        method: "POST",
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed");
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setDeliveringId(null);
    }
  }

  const canAddMore = ["IN_PRODUCTION", "DISPATCHED"].includes(orderStatus);

  return (
    <div className="rounded-lg border bg-background overflow-hidden">
      <div className="px-4 py-3 border-b flex items-baseline justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Жўнатмалар<span className="lang-en"> · Shipments</span>
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          {shipments.length} {t("та жўнатма", "shipments")}
        </div>
      </div>

      <div className="divide-y">
        {shipments.map((s) => {
          const Icon = STATUS_ICONS[s.status];
          const colorCls = STATUS_COLORS[s.status];

          return (
            <div key={s.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">Жўнатма {s.number}</span>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${colorCls}`}>
                    <Icon className="h-3 w-3" />
                    {STATUS_LABEL_UZ[s.status]}
                  </span>
                </div>

                <div className="flex gap-2">
                  {s.status === "PENDING" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLoadModalShipment(s)}
                      >
                        <Package className="h-3.5 w-3.5 mr-1.5" />
                        {t("Юклаш", "Load truck")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:bg-destructive/10 hover:border-destructive/40"
                        disabled={deletingId === s.id}
                        onClick={() => deleteShipment(s.id)}
                      >
                        {deletingId === s.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </>
                  )}
                  {s.status === "LOADED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={dispatchingId === s.id}
                      onClick={() => dispatchShipment(s.id)}
                    >
                      {dispatchingId === s.id
                        ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        : <Truck className="h-3.5 w-3.5 mr-1.5" />}
                      {t("Жўнатиш", "Dispatch")}
                    </Button>
                  )}
                  {s.status === "DISPATCHED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={deliveringId === s.id}
                      onClick={() => deliverShipment(s.id)}
                    >
                      {deliveringId === s.id
                        ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                      {t("Етказилди", "Mark delivered")}
                    </Button>
                  )}
                </div>
              </div>

              {(s.loadedBeams || s.loadedBlocks !== null) && (
                <div className="text-xs text-muted-foreground space-x-3 font-mono">
                  {s.loadedBeams && Object.entries(s.loadedBeams as Record<string, number>).map(([len, cnt]) => (
                    <span key={len}>{cnt} × {len}м балка</span>
                  ))}
                  {s.loadedBlocks !== null && <span>{s.loadedBlocks} гишт</span>}
                </div>
              )}

              {s.driver && (
                <div className="text-xs text-muted-foreground">
                  {t("Ҳайдовчи:", "Driver:")} <span className="font-medium text-foreground">{s.driver.name}</span>
                  {" "}{formatPhone(s.driver.phone)}
                  {s.driverWillCollectCash && s.cashToCollect && (
                    <span className="ml-2 text-amber-600 font-semibold">
                      · {formatNumber(s.cashToCollect, 0)} UZS {t("олиб келади", "expected to collect")}
                    </span>
                  )}
                </div>
              )}
              {!s.driver && s.status !== "PENDING" && s.status !== "LOADED" && (
                <div className="text-xs text-muted-foreground italic">
                  {t("Мижоз ўз транспорти билан", "Client's own transport")}
                </div>
              )}

              <div className="flex gap-4 text-[10px] text-muted-foreground">
                {s.loadedAt && <span>{t("Юкланди:", "Loaded:")} {formatDate(s.loadedAt)}</span>}
                {s.dispatchedAt && <span>{t("Жўнатилди:", "Dispatched:")} {formatDate(s.dispatchedAt)}</span>}
                {s.deliveredAt && <span className="text-emerald-600">{t("Етказилди:", "Delivered:")} {formatDate(s.deliveredAt)}</span>}
              </div>

              {s.loadedPhotoUrl && (
                <a href={s.loadedPhotoUrl} target="_blank" rel="noreferrer">
                  <img
                    src={s.loadedPhotoUrl}
                    alt={`Shipment ${s.number} photo`}
                    className="max-h-24 rounded border object-cover hover:opacity-90 transition-opacity"
                  />
                </a>
              )}
            </div>
          );
        })}
      </div>

      {canAddMore && (
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
            + {t("Янги жўнатма", "Add next shipment")}
          </Button>
        </div>
      )}

      {error && (
        <div className="border-t px-4 py-2 text-sm text-destructive bg-destructive/10">
          {error}
        </div>
      )}

      {loadModalShipment && (
        <SplitShipmentLoadModal
          orderId={orderId}
          shipmentId={loadModalShipment.id}
          shipmentNumber={loadModalShipment.number}
          beamGroups={beamGroups}
          totalBlocks={totalBlocks}
          prevShipments={prevLoaded}
          open={true}
          onClose={() => setLoadModalShipment(null)}
          onSuccess={() => { setLoadModalShipment(null); onRefresh(); }}
        />
      )}
    </div>
  );
}
