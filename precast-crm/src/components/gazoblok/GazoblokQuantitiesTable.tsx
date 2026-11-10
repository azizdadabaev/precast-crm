"use client";

/**
 * Per size: ordered / loaded / left / over — the strict picture the owner asked for
 * ("how many loaded, how many left, how many ordered", 2026-11-10).
 */
import { useT } from "@/lib/i18n";
import { formatNumber } from "@/lib/utils";
import type { LineQty } from "@/lib/gazoblok-quantities";

export function GazoblokQuantitiesTable({
  quantities,
  prices,
}: {
  quantities: LineQty[];
  prices: Record<string, { unitPrice: number; lineTotal: number }>;
}) {
  const t = useT();
  const sum = (k: "ordered" | "loaded" | "left" | "over") => quantities.reduce((s, q) => s + q[k], 0);
  const num = (n: number) => formatNumber(n, 0);
  const cell = "px-3 py-2.5 text-right font-mono tabular-nums";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[560px]">
        <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2.5">{t("Ўлчам", "Size")}</th>
            <th className="text-right px-3 py-2.5">{t("Нарх", "Price")}</th>
            <th className="text-right px-3 py-2.5">{t("Буюртма", "Ordered")}</th>
            <th className="text-right px-3 py-2.5">{t("Юкланди", "Loaded")}</th>
            <th className="text-right px-3 py-2.5">{t("Қолди", "Left")}</th>
            <th className="text-right px-3 py-2.5">{t("Ортиқча", "Over")}</th>
            <th className="text-right px-3 py-2.5">{t("Сумма", "Total")}</th>
          </tr>
        </thead>
        <tbody>
          {quantities.map((q, i) => (
            <tr key={q.lineId} className={"border-b last:border-b-0 border-border/60 " + (i % 2 === 1 ? "bg-muted/30" : "")}>
              <td className="px-3 py-2.5 font-medium">{q.label}</td>
              <td className={cell}>{num(prices[q.lineId]?.unitPrice ?? 0)}</td>
              <td className={cell}>{num(q.ordered)}</td>
              <td className={cell}>{num(q.loaded)}</td>
              <td className={`${cell} ${q.left > 0 ? "text-warning font-semibold" : "text-muted-foreground"}`}>{num(q.left)}</td>
              <td className={`${cell} ${q.over > 0 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                {q.over > 0 ? `+${num(q.over)}` : "0"}
              </td>
              <td className={`${cell} font-semibold`}>{num(prices[q.lineId]?.lineTotal ?? 0)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-border-strong bg-muted/30 text-sm font-semibold">
          <tr>
            <td className="px-3 py-2.5">{t("Жами", "Total")}</td>
            <td />
            <td className={cell}>{num(sum("ordered"))}</td>
            <td className={cell}>{num(sum("loaded"))}</td>
            <td className={`${cell} ${sum("left") > 0 ? "text-warning" : ""}`}>{num(sum("left"))}</td>
            <td className={`${cell} ${sum("over") > 0 ? "text-destructive" : ""}`}>{sum("over") > 0 ? `+${num(sum("over"))}` : "0"}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
