"use client";

import { useState } from "react";
import type { GazoblokMonth } from "@/lib/gazoblok-dashboard";
import { useT } from "@/lib/i18n";
import { cn, formatNumber } from "@/lib/utils";
import { monthName } from "./GazoblokKpis";

const NUM = "font-[var(--font-num)] tabular-nums";

/** 12 CSS bars of booked revenue; click picks the month the KPI strip shows. */
export function GazoblokRevenueChart({ months, selected, onSelect }: {
  months: GazoblokMonth[]; selected: number; onSelect: (i: number) => void;
}) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...months.map((m) => m.booked));
  const tipIdx = hover ?? selected;
  const tip = months[tipIdx];
  const last = months.length - 1;
  // Edge bars anchor the tooltip to their side so it never spills off a 412 px screen.
  const shift = tipIdx <= 1 ? "0%" : tipIdx >= last - 1 ? "-100%" : "-50%";

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-baseline justify-between gap-3 px-4 py-3 border-b border-border">
        <h2 className="text-base font-semibold">{t("Ойлик даромад", "Monthly revenue")}</h2>
        <span className="text-xs text-muted-foreground">{t("UZS · сўнгги 12 ой", "UZS · last 12 months")}</span>
      </header>
      <div className="px-4 pb-3 pt-24">
        <div className="relative">
          {tip && (
            <div
              className="pointer-events-none absolute bottom-full mb-2 z-10 w-max max-w-[260px] rounded-md border border-border-strong bg-card px-3 py-2 text-xs shadow-sm"
              style={{ left: `${((tipIdx + 0.5) / months.length) * 100}%`, transform: `translateX(${shift})` }}
            >
              <div className="font-semibold">{monthName(tip.key)} <span className={NUM}>{tip.year}</span></div>
              <div><span className={NUM}>{formatNumber(tip.booked, 0)}</span> UZS · <span className={NUM}>{formatNumber(tip.orders, 0)}</span> {t("та буюртма", "orders")}</div>
              <div className="text-muted-foreground"><span className={NUM}>{formatNumber(tip.blocks, 0)}</span> {t("та блок", "blocks")} · <span className={NUM}>{formatNumber(tip.volumeM3, 1)}</span> м³</div>
              <div className="text-success">{t("Тушган", "Collected")}: <span className={NUM}>{formatNumber(tip.collected, 0)}</span> UZS</div>
            </div>
          )}
          <div className="flex h-40 items-end gap-1 border-b border-border-strong" onMouseLeave={() => setHover(null)}>
            {months.map((m, i) => (
              <button
                key={m.key}
                type="button"
                aria-pressed={i === selected}
                aria-label={`${monthName(m.key)} ${m.year}: ${formatNumber(m.booked, 0)} UZS`}
                onClick={() => onSelect(i)}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="flex h-full flex-1 min-w-0 items-end rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span
                  className={cn("block w-full rounded-t-sm transition-colors",
                    i === selected ? "bg-primary" : hover === i ? "bg-foreground/30" : "bg-foreground/[.18]")}
                  style={{ height: max > 0 ? `${(m.booked / max) * 100}%` : "0%" }}
                />
              </button>
            ))}
          </div>
        </div>
        <div className="mt-1.5 flex gap-1 text-[10px] text-muted-foreground">
          {months.map((m, i) => (
            <span key={m.key} className={cn("flex-1 min-w-0 text-center truncate", i === selected && "text-foreground font-semibold")}>
              {m.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
