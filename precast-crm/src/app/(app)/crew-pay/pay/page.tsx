"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Som, WeekPicker, CrewError, STATUS_UZ, newKey } from "@/components/crew-pay/shared";
import { fmtDay, fmtPct, fmtSom } from "@/lib/crew-pay/format";
import type { PayView } from "@/lib/crew-pay/views";
import type { IsoDate, PayRow } from "@/lib/crew-pay/engine";

type Data = PayView & { paymentDate: IsoDate };
type Draft = { workerId: string; name: string; amount: string; method: "CASH" | "CARD" | "OFFSET" | "OTHER"; clientKey: string };

export default function CrewPayDayPage() {
  const qc = useQueryClient();
  const [week, setWeek] = useState<IsoDate | "default">("default");
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const { data, error, isLoading } = useQuery<Data>({
    queryKey: ["crew-pay", "pay", week],
    queryFn: () => api(`/api/crew-pay/pay-weeks/${week}`),
  });
  useEffect(() => { if (data && week === "default") setWeek(data.weekStart); }, [data, week]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["crew-pay"] });

  const pay = useMutation({
    mutationFn: (d: Draft[]) => api(`/api/crew-pay/pay-weeks/${data!.weekStart}/pay`, {
      method: "POST",
      json: { payments: d.map((x) => ({ workerId: x.workerId, amount: Number(x.amount || 0), method: x.method, clientKey: x.clientKey })) },
    }),
    onSuccess: () => { setDrafts(null); refresh(); },
  });
  const close = useMutation({ mutationFn: () => api(`/api/crew-pay/pay-weeks/${data!.weekStart}/close`, { method: "POST" }), onSuccess: refresh });
  const reopen = useMutation({
    mutationFn: (reason: string) => api(`/api/crew-pay/pay-weeks/${data!.weekStart}/reopen`, { method: "POST", json: { reason } }),
    onSuccess: refresh,
  });

  const openPay = (rows: PayRow[]) => setDrafts(rows.filter((r) => r.stillToPay > 0).map((r) => ({
    workerId: r.workerId, name: r.name, amount: String(r.stillToPay), method: "CASH", clientKey: newKey(),
  })));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {data && <WeekPicker week={data.weekStart} onChange={setWeek} />}
        {data && (data.closed ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-sm text-muted-foreground"><Lock className="h-4 w-4" /> Ҳафта ёпилган</span>
            <Button variant="outline" onClick={() => { const r = window.prompt("Нима учун қайта очилмоқда?"); if (r) reopen.mutate(r); }}>Қайта очиш</Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button disabled={!data.rows.some((r) => r.stillToPay > 0)} onClick={() => openPay(data.rows)}>Ҳаммасига тўлаш</Button>
            <Button variant="outline" disabled={data.blockers.length > 0 || close.isPending}
              onClick={() => window.confirm("Ҳафта ёпилсинми? Кейин бу ҳафтанинг кунлари ва кассаси ўзгармайди.") && close.mutate()}>
              Ҳафтани ёпиш
            </Button>
          </div>
        ))}
      </div>
      <CrewError error={error ?? close.error ?? reopen.error} />
      {isLoading && <p className="text-sm text-muted-foreground">Юкланмоқда…</p>}
      {data && data.blockers.length > 0 && !data.closed && (
        <div className="rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive">
          Ҳафтани ёпишдан олдин тузатинг: {data.blockers.map((b) => b.message).join("; ")}
        </div>
      )}
      {data && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Ишчи</th><th className="px-3 py-2 text-right">Кун</th>
                <th className="px-3 py-2 text-right">Ишлади</th><th className="px-3 py-2 text-right">Олдинги қолдиқ</th>
                <th className="px-3 py-2 text-right">Аванс</th><th className="px-3 py-2 text-right">Тузатиш</th>
                <th className="px-3 py-2 text-right">ТЎЛАШ КЕРАК</th><th className="px-3 py-2 text-right">Тўланди</th>
                <th className="px-3 py-2 text-right">Қолган қолдиқ</th><th className="px-3 py-2">Ҳолат</th><th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-muted-foreground">Бу ҳафта учун маълумот йўқ</td></tr>
              )}
              {data.rows.map((r) => (
                <tr key={r.workerId} className="border-t">
                  <td className="px-3 py-2 max-w-[160px] truncate">{r.name}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{String(r.days).replace(".", ",")}
                    {r.sharePct != null && <span className="text-xs text-muted-foreground"> · {fmtPct(r.sharePct)}</span>}</td>
                  <td className="px-3 py-2 text-right"><Som value={r.earned} unit={false} /></td>
                  <td className="px-3 py-2 text-right"><Som value={r.broughtForward} unit={false} /></td>
                  <td className="px-3 py-2 text-right"><Som value={r.advances} unit={false} /></td>
                  <td className="px-3 py-2 text-right"><Som value={r.corrections} unit={false} /></td>
                  <td className="px-3 py-2 text-right font-semibold"><Som value={r.toPay} unit={false} /></td>
                  <td className="px-3 py-2 text-right"><Som value={r.paid} unit={false} /></td>
                  <td className="px-3 py-2 text-right"><Som value={r.carriedForward} unit={false} /></td>
                  <td className="px-3 py-2"><Badge variant={STATUS_UZ[r.status].variant}>{STATUS_UZ[r.status].label}</Badge></td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">
                    {!data.closed && r.stillToPay > 0 && <Button size="sm" onClick={() => openPay([r])}>Тўлаш</Button>}
                    <Button asChild variant="ghost" size="sm"><Link href={`/crew-pay/payslip/${data.weekStart}/${r.workerId}`} target="_blank">Варақа</Link></Button>
                  </td>
                </tr>
              ))}
              {data.rows.length > 0 && (
                <tr className="border-t bg-muted/30 font-semibold">
                  <td className="px-3 py-2">Жами</td><td />
                  <td className="px-3 py-2 text-right"><Som value={data.totals.earned} unit={false} /></td><td />
                  <td className="px-3 py-2 text-right"><Som value={data.totals.advances} unit={false} /></td>
                  <td className="px-3 py-2 text-right"><Som value={data.totals.corrections} unit={false} /></td>
                  <td className="px-3 py-2 text-right"><Som value={data.totals.toPay} unit={false} /></td>
                  <td className="px-3 py-2 text-right"><Som value={data.totals.paid} unit={false} /></td>
                  <td className="px-3 py-2 text-right"><Som value={data.totals.carriedForward} unit={false} /></td><td /><td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {data && <p className="text-xs text-muted-foreground">Эски қарзни ушлаб қолиш чегараси шу ҳафта: {fmtPct(data.debtCap)}. Тўлов {fmtDay(data.paymentDate)} сана билан ёзилади.</p>}

      <Dialog open={drafts != null} onOpenChange={(o) => !o && setDrafts(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Иш ҳақини тўлаш</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {drafts?.map((d, k) => (
              <div key={d.workerId} className="grid grid-cols-[1fr_140px_120px] items-center gap-2">
                <span className="truncate">{d.name}</span>
                <Input inputMode="numeric" className="font-mono tabular-nums text-right" value={d.amount}
                  onChange={(e) => setDrafts((all) => all!.map((x, i) => (i === k ? { ...x, amount: e.target.value.replace(/\D/g, "") } : x)))} />
                <select className="h-10 rounded-md border bg-background px-2 text-sm" value={d.method}
                  onChange={(e) => setDrafts((all) => all!.map((x, i) => (i === k ? { ...x, method: e.target.value as Draft["method"] } : x)))}>
                  <option value="CASH">Нақд</option><option value="CARD">Карта</option>
                  <option value="OFFSET">Ҳисобга олиш</option><option value="OTHER">Бошқа</option>
                </select>
              </div>
            ))}
            <div className="text-right text-sm">Жами: <b className="font-mono tabular-nums">{fmtSom(drafts?.reduce((t, d) => t + Number(d.amount || 0), 0) ?? 0)}</b> сўм</div>
            <CrewError error={pay.error} />
            <Button className="w-full" disabled={pay.isPending} onClick={() => drafts && pay.mutate(drafts)}>
              {pay.isPending ? "Сақланмоқда…" : "Тўланди деб ёзиш"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
