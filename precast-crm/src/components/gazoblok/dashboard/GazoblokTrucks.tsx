"use client";

import Link from "next/link";
import type { TruckRow } from "@/lib/gazoblok-dashboard";
import { Chip } from "@/components/ui/chip";
import { useT } from "@/lib/i18n";
import { formatNumber } from "@/lib/utils";

const NUM = "font-[var(--font-num)] tabular-nums";

function hhmm(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Open trucks (loaded first, then waiting) and the ones delivered today. */
export function GazoblokTrucks({ trucks }: { trucks: TruckRow[] }) {
  const t = useT();
  const chip = (s: TruckRow["status"]) =>
    s === "DELIVERED" ? <Chip variant="success">{t("Етказилди", "Delivered")}</Chip>
      : s === "LOADED" ? <Chip variant="warning">{t("Юкланди", "Loaded")}</Chip>
        : <Chip variant="neutral">{t("Кутилмоқда", "Waiting")}</Chip>;
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="px-4 py-3 border-b border-border">
        <h2 className="text-base font-semibold">{t("Машиналар", "Trucks")}</h2>
      </header>
      {trucks.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{t("Очиқ машина йўқ", "No open trucks")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {trucks.map((r) => (
            <li key={r.shipmentId} className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 px-4 py-2.5">
              <span className={`${NUM} text-sm text-muted-foreground`}>{hhmm(r.at)}</span>
              <div className="min-w-0">
                <div className="text-sm font-semibold break-words">
                  {r.clientName} ·{" "}
                  <Link href={`/gazoblok/orders/${r.orderId}`} className={`${NUM} font-medium text-primary hover:underline`}>
                    {r.orderNumber}
                  </Link>
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("Жўнатма", "Shipment")} <span className={NUM}>{r.number}</span> · <span className={NUM}>{formatNumber(r.blocks, 0)}</span> {t("та", "pcs")} · <span className={NUM}>{formatNumber(r.weightKg, 0)}</span> {t("кг", "kg")}
                  {r.overBlocks > 0 && (
                    <> · <span className="text-destructive">{t("ортиқча", "extra")} +<span className={NUM}>{formatNumber(r.overBlocks, 0)}</span></span></>
                  )}
                </div>
              </div>
              {chip(r.status)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
