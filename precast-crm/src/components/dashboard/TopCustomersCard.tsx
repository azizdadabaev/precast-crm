"use client";

import { useRouter } from "next/navigation";
import { InfoCard } from "./InfoCard";
import { formatNumber } from "@/lib/utils";
import type { DashboardData } from "./types";

interface Props {
  data: DashboardData["topCustomers"];
}

export function TopCustomersCard({ data }: Props) {
  const router = useRouter();
  if (data.length === 0) {
    return (
      <InfoCard title="ЭНГ ЯХШИ · Top 5 customers">
        <div className="flex-1 grid place-items-center text-sm text-[var(--ds-text-light)]">
          Маълумот етарли эмас · Not enough data
        </div>
      </InfoCard>
    );
  }
  return (
    <InfoCard title="ЭНГ ЯХШИ · Top 5 customers">
      <ol className="space-y-2 flex-1">
        {data.map((c, i) => (
          <li
            key={c.id}
            className="flex items-center justify-between gap-3 cursor-pointer hover:bg-[var(--ds-bg-light)] p-2 rounded transition-colors"
            onClick={() => router.push(`/clients/${c.id}`)}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="ds-rank-badge">{i + 1}</span>
              <span className="truncate text-[var(--ds-text-dark)] font-medium">
                {c.name}
              </span>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[var(--ds-text-dark)] font-bold tabular-nums">
                {formatNumber(c.totalRevenue, 0)}
              </div>
              <div className="text-xs text-[var(--ds-text-light)]">
                {c.orderCount} та буюртма
              </div>
            </div>
          </li>
        ))}
      </ol>
    </InfoCard>
  );
}
