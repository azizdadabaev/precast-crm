"use client";

import Link from "next/link";
import type { StockRow } from "@/lib/gazoblok-dashboard";
import { Chip } from "@/components/ui/chip";
import { useT } from "@/lib/i18n";
import { cn, formatNumber } from "@/lib/utils";

const NUM = "font-[var(--font-num)] tabular-nums";

/** Stock per size: on hand, still needed by open orders, and free. */
export function GazoblokStockTable({ stock }: { stock: StockRow[] }) {
  const t = useT();
  return (
    <section className="rounded-lg border border-border bg-card min-w-0">
      <header className="flex items-center justify-between gap-3 px-4 py-1.5 border-b border-border">
        <h2 className="text-base font-semibold">{t("Омбор", "Stock")}</h2>
        <Link href="/gazoblok/stock" className="inline-flex min-h-11 items-center text-sm text-primary hover:underline">
          {t("Омборга ўтиш", "Open stock")}
        </Link>
      </header>
      {stock.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{t("Фаол Газоблок ўлчами йўқ.", "No active Газоблок sizes yet.")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-medium">{t("Ўлчам, мм", "Size, mm")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("Омборда", "On hand")}</th>
                <th className="hidden sm:table-cell px-3 py-2 text-right font-medium">{t("Буюртмага керак", "Reserved")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("Бўш", "Free")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stock.map((s) => (
                <tr key={s.productId}>
                  <td className="px-4 py-2.5">
                    <span className={cn(NUM, "mr-2")}>{s.label}</span>
                    {s.state === "low" && <Chip variant="warning">{t("Кам", "Low")}</Chip>}
                    {s.state === "out" && <Chip variant="danger">{t("Тугаган", "Out")}</Chip>}
                  </td>
                  <td className={cn(NUM, "px-3 py-2.5 text-right", s.state === "out" && "text-destructive font-semibold")}>
                    {formatNumber(s.onHand, 0)}
                  </td>
                  <td className={cn(NUM, "hidden sm:table-cell px-3 py-2.5 text-right")}>{formatNumber(s.reserved, 0)}</td>
                  <td className={cn(NUM, "px-4 py-2.5 text-right",
                    s.state === "low" && "text-warning font-semibold", s.state === "out" && "text-destructive")}>
                    {formatNumber(s.free, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
