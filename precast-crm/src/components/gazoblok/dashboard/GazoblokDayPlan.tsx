"use client";

import Link from "next/link";
import type { PlanDay } from "@/lib/gazoblok-dashboard";
import { useT } from "@/lib/i18n";
import { formatNumber } from "@/lib/utils";

const NUM = "font-[var(--font-num)] tabular-nums";

/** "2026-11-10" → "10.11.2026". */
function ddmmyyyy(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d}.${m}.${y}`;
}

/** Open orders scheduled in the next 7 days, one order on its scheduled day. */
export function GazoblokDayPlan({ plan, unscheduledOpen }: { plan: PlanDay[]; unscheduledOpen: number }) {
  const t = useT();
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="px-4 py-3 border-b border-border">
        <h2 className="text-base font-semibold">{t("Келгуси 7 кун", "Next 7 days")}</h2>
      </header>
      {plan.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{t("Режалаштирилган буюртма йўқ", "No scheduled orders")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {plan.map((d) => {
            const left = d.orders.reduce((s, o) => s + o.blocksLeft, 0);
            return (
              <li key={d.date} className="px-4 py-2.5">
                <div className="text-sm">
                  <span className={`${NUM} font-semibold`}>{ddmmyyyy(d.date)}</span>
                  <span className="text-muted-foreground">
                    {" · "}<span className={NUM}>{formatNumber(d.orders.length, 0)}</span> {t("та буюртма", "orders")}
                    {" · "}<span className={NUM}>{formatNumber(left, 0)}</span> {t("та блок қолди", "blocks left")}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4">
                  {d.orders.map((o) => (
                    <Link key={o.id} href={`/gazoblok/orders/${o.id}`}
                      className="inline-flex min-h-11 md:min-h-0 md:py-0.5 items-center gap-1.5 text-xs hover:underline">
                      <span className={`${NUM} text-primary`}>{o.orderNumber}</span>
                      <span className="text-muted-foreground break-words">{o.clientName} · <span className={NUM}>{formatNumber(o.blocksLeft, 0)}</span> {t("та", "pcs")}</span>
                    </Link>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {unscheduledOpen > 0 && (
        <footer className="px-4 py-2.5 border-t border-border text-xs text-muted-foreground">
          {t("Санасиз", "No date")}: <span className={NUM}>{formatNumber(unscheduledOpen, 0)}</span> {t("та очиқ буюртма", "open orders")}
        </footer>
      )}
    </section>
  );
}
