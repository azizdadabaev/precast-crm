"use client";

import type { GazoblokDashboard } from "@/lib/gazoblok-dashboard";
import { useT } from "@/lib/i18n";
import { cn, formatNumber } from "@/lib/utils";

type Money = NonNullable<GazoblokDashboard["money"]>;

/** Full Uzbek month names for the KPI label and the chart tooltip (index 0 = January). */
export const MONTH_UZ_FULL = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

/** "2026-11" → "Ноябрь". */
export function monthName(key: string): string {
  return MONTH_UZ_FULL[Number(key.slice(5, 7)) - 1] ?? key;
}

const NUM = "font-[var(--font-num)] tabular-nums";

function Cell({ label, value, tone, sub }: {
  label: string; value: number; tone?: "pos" | "neg"; sub: React.ReactNode;
}) {
  return (
    <div className="bg-card p-4 min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn(NUM, "mt-1 text-xl md:text-2xl font-semibold break-words",
        tone === "pos" && "text-success", tone === "neg" && "text-destructive")}>
        {formatNumber(value, 0)}
        <span className="ml-1 text-xs font-normal text-muted-foreground">UZS</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

/** Four money cells for the month picked on the chart (dashboard.view only). */
export function GazoblokKpis({ money, monthIdx }: { money: Money; monthIdx: number }) {
  const t = useT();
  const m = money.months[monthIdx];
  const operators = money.overload.operators.length;
  return (
    // gap-px over a border-coloured ground draws the inner hairlines for both 2×2 and 1×4.
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-lg border border-border bg-border">
      <Cell
        label={`${t("Даромад", "Revenue")}, ${m ? monthName(m.key).toLowerCase() : "—"}`}
        value={m?.booked ?? 0}
        sub={<><span className={NUM}>{formatNumber(m?.orders ?? 0, 0)}</span> {t("та буюртма", "orders")}</>}
      />
      <Cell
        label={t("Тушган пул", "Collected")}
        value={m?.collected ?? 0}
        tone="pos"
        sub={
          <>
            {t("тасдиқланган тўловлар", "confirmed payments")}
            {money.unconfirmed.total > 0 && (
              <div className="text-warning">
                +<span className={NUM}>{formatNumber(money.unconfirmed.total, 0)}</span> UZS{" "}
                {t("тасдиқланмаган", "unconfirmed")}
              </div>
            )}
          </>
        }
      />
      <Cell
        label={t("Қарздорлик", "Receivables")}
        value={money.receivables.total}
        sub={<><span className={NUM}>{formatNumber(money.receivables.orders, 0)}</span> {t("та очиқ буюртма", "open orders")}</>}
      />
      <Cell
        label={t("Ортиқча юклаш қарзи", "Over-load debt")}
        value={money.overload.total}
        tone="neg"
        sub={<><span className={NUM}>{formatNumber(operators, 0)}</span> {t("та оператор", "operators")}</>}
      />
    </div>
  );
}
