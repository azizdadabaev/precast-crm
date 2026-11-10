"use client";

import Link from "next/link";
import type { GazoblokOverload } from "@/lib/gazoblok-dashboard";
import { useT } from "@/lib/i18n";
import { formatNumber } from "@/lib/utils";

const NUM = "font-[var(--font-num)] tabular-nums";

/** Unpaid over-load per selling operator — who to ask where the leftover money is. */
export function GazoblokOverloadTable({ overload }: { overload: GazoblokOverload }) {
  const t = useT();
  return (
    <section className="rounded-lg border border-border bg-card min-w-0">
      <header className="px-4 py-3 border-b border-border">
        <h2 className="text-base font-semibold">{t("Ортиқча юклаш: кимдан сўраш керак", "Over-load: who to ask")}</h2>
      </header>
      {overload.operators.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{t("Ортиқча юклаш қарзи йўқ", "No over-load debt")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-medium">{t("Сотувчи оператор", "Selling operator")}</th>
                <th className="hidden sm:table-cell px-3 py-2 text-right font-medium">{t("Буюртма", "Orders")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("Ортиқча", "Extra")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("Тўланмаган, UZS", "Unpaid, UZS")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {overload.operators.map((op) => (
                <tr key={op.operatorId ?? "legacy"} className="align-top">
                  <td className="px-4 py-2.5">
                    <div className="font-semibold break-words">{op.name ?? t("Номаълум (эски буюртма)", "Unknown (old order)")}</div>
                    <div className="flex flex-wrap gap-x-3">
                      {op.orders.map((o) => (
                        <Link key={o.id} href={`/gazoblok/orders/${o.id}`}
                          className={`${NUM} inline-flex min-h-11 md:min-h-0 items-center text-xs text-primary hover:underline`}>
                          {o.orderNumber}
                        </Link>
                      ))}
                    </div>
                  </td>
                  <td className={`${NUM} hidden sm:table-cell px-3 py-2.5 text-right`}>{formatNumber(op.orders.length, 0)}</td>
                  <td className={`${NUM} px-3 py-2.5 text-right`}>+{formatNumber(op.extraBlocks, 0)}</td>
                  <td className={`${NUM} px-4 py-2.5 text-right font-semibold text-destructive`}>{formatNumber(op.unpaid, 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border-strong font-semibold">
              <tr>
                <td className="px-4 py-2.5">{t("Жами", "Total")}</td>
                <td className={`${NUM} hidden sm:table-cell px-3 py-2.5 text-right`}>{formatNumber(overload.orders, 0)}</td>
                <td className={`${NUM} px-3 py-2.5 text-right`}>+{formatNumber(overload.extraBlocks, 0)}</td>
                <td className={`${NUM} px-4 py-2.5 text-right text-destructive`}>{formatNumber(overload.total, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
