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
  const tiles = (q: { ordered: number; loaded: number; left: number; over: number }) => [
    { k: t("Буюртма", "Ordered"), v: num(q.ordered), c: "" },
    { k: t("Юкланди", "Loaded"), v: num(q.loaded), c: "" },
    { k: t("Қолди", "Left"), v: num(q.left), c: q.left > 0 ? "text-warning" : "text-muted-foreground" },
    { k: t("Ортиқча", "Over"), v: q.over > 0 ? `+${num(q.over)}` : "0", c: q.over > 0 ? "text-destructive" : "text-muted-foreground" },
  ];
  const Grid = ({ q }: { q: { ordered: number; loaded: number; left: number; over: number } }) => (
    <div className="mt-2 grid grid-cols-4 gap-2">
      {tiles(q).map((x) => (
        <div key={x.k} className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{x.k}</div>
          <div className={`font-mono tabular-nums font-semibold ${x.c}`}>{x.v}</div>
        </div>
      ))}
    </div>
  );
  return (
    <>
    {/* Phone: each size is a stacked row with a 4-number grid — no sideways scroll at 412 px. */}
    <ul className="sm:hidden divide-y divide-border/60 text-sm">
      {quantities.map((q) => (
        <li key={q.lineId} className="px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium break-words">{q.label}</span>
            <span className="font-mono tabular-nums font-semibold shrink-0">{num(prices[q.lineId]?.lineTotal ?? 0)}</span>
          </div>
          <div className="text-xs text-muted-foreground font-mono tabular-nums">
            {num(prices[q.lineId]?.unitPrice ?? 0)} UZS / {t("та", "pc")}
          </div>
          <Grid q={q} />
        </li>
      ))}
      <li className="px-4 py-3 bg-muted/30">
        <div className="font-semibold">{t("Жами", "Total")}</div>
        <Grid q={{ ordered: sum("ordered"), loaded: sum("loaded"), left: sum("left"), over: sum("over") }} />
      </li>
    </ul>
    <div className="hidden sm:block overflow-x-auto">
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
    </>
  );
}
