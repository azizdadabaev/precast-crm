"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { KpiCard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Som, WeekPicker, IssuesBanner, useCrewWeek, CrewError, STATUS_UZ } from "@/components/crew-pay/shared";
import { fmtPct, fmtSom } from "@/lib/crew-pay/format";
import type { OverviewView } from "@/lib/crew-pay/views";

export default function CrewPayOverviewPage() {
  const [week, setWeek] = useCrewWeek();
  const { data, error, isLoading } = useQuery<OverviewView>({
    queryKey: ["crew-pay", "overview", week],
    queryFn: () => api(`/api/crew-pay/overview?week=${week}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <WeekPicker week={week} onChange={setWeek} />
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/crew-pay/days">Бугунни киритиш</Link></Button>
          <Button asChild variant="outline"><Link href="/crew-pay/ledger">Аванс бериш</Link></Button>
          <Button asChild><Link href="/crew-pay/pay">Иш ҳақи</Link></Button>
        </div>
      </div>
      <CrewError error={error} />
      {isLoading && <p className="text-sm text-muted-foreground">Юкланмоқда…</p>}
      {data && (
        <>
          <IssuesBanner issues={data.issues} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard label="Сифатли блок" value={<span className="font-mono tabular-nums">{fmtSom(data.kpis.good)}</span>}
              caption={`${fmtSom(data.kpis.moulded)} та қолипланганидан`} />
            <KpiCard label="Бригада ишлади" value={<Som value={data.kpis.pot} />} caption="ҳафта пули, кунлар бўйича тақсимланади" />
            <KpiCard label="Иш кунлари" value={<span className="font-mono tabular-nums">{data.kpis.crewDays.toString().replace(".", ",")}</span>}
              caption={data.kpis.goodPerCrewDay == null ? "ҳали кун киритилмаган" : `бир иш кунига ${fmtSom(Math.trunc(data.kpis.goodPerCrewDay))} та блок`} />
            <KpiCard label="Брак" value={<span className="font-mono tabular-nums">{data.kpis.rejectRate == null ? "–" : fmtPct(data.kpis.rejectRate)}</span>}
              attention={data.kpis.rejectRate != null && data.kpis.rejectAlarm != null && data.kpis.rejectRate > data.kpis.rejectAlarm ? "warning" : "none"}
              caption={data.kpis.rejectAlarm == null ? undefined : `чегара ${fmtPct(data.kpis.rejectAlarm)}`} />
            <KpiCard label="Шу ҳафта аванс" value={<Som value={data.kpis.advancesSum} />} caption={`${data.kpis.advancesCount} та аванс`} />
            <KpiCard label="Бригадага қарзингиз" value={<Som value={data.kpis.owedToCrew} />} caption="ишлагани минус берилган пул" />
          </div>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Ишчи</th>
                  <th className="px-3 py-2 text-right">Кун</th>
                  <th className="px-3 py-2 text-right">Шу ҳафта ишлади</th>
                  <th className="px-3 py-2 text-right">Шу ҳафта аванс</th>
                  <th className="px-3 py-2 text-right">Ҳозирги қолдиқ</th>
                  <th className="px-3 py-2">Ҳолат</th>
                </tr>
              </thead>
              <tbody>
                {data.crew.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    Ишчилар йўқ — <Link className="underline" href="/crew-pay/workers">ишчи қўшинг</Link>
                  </td></tr>
                )}
                {data.crew.map((r) => (
                  <tr key={r.workerId} className="border-t">
                    <td className="px-3 py-2 max-w-[220px] truncate">{r.name}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{r.days.toString().replace(".", ",")}</td>
                    <td className="px-3 py-2 text-right"><Som value={r.earned} unit={false} /></td>
                    <td className="px-3 py-2 text-right"><Som value={r.advances} unit={false} /></td>
                    <td className="px-3 py-2 text-right"><Som value={r.owedNow} unit={false} /></td>
                    <td className="px-3 py-2"><Badge variant={STATUS_UZ[r.status].variant}>{STATUS_UZ[r.status].label}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
