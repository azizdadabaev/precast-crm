"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { CrewError, Som, STATUS_UZ } from "@/components/crew-pay/shared";
import { fmtDay } from "@/lib/crew-pay/format";
import type { PayslipView } from "@/lib/crew-pay/views";

export default function PayslipPage({ params }: { params: { week: string; workerId: string } }) {
  const { data, error } = useQuery<PayslipView>({
    queryKey: ["crew-pay", "payslip", params.week, params.workerId],
    queryFn: () => api(`/api/crew-pay/payslip/${params.week}/${params.workerId}`),
  });
  if (error) return <CrewError error={error} />;
  if (!data) return <p className="text-sm text-muted-foreground">Юкланмоқда…</p>;
  const r = data.row;
  const line = (label: string, v: number, bold = false) => (
    <div key={label} className={`flex justify-between border-b py-1 ${bold ? "font-semibold" : ""}`}><span>{label}</span><Som value={v} /></div>
  );
  return (
    <div className="mx-auto max-w-[640px] space-y-4 bg-background p-6 text-sm print:p-0">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xl font-bold">Иш ҳақи варақаси</div>
          <div className="text-muted-foreground">EtalonSlabs · 10 см блок бригадаси</div>
        </div>
        <Button className="print:hidden" onClick={() => window.print()}>Чоп этиш</Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>Ишчи: <b>{data.worker.name}</b> <span className="text-muted-foreground">({data.worker.code})</span></div>
        <div className="text-right font-mono tabular-nums">{fmtDay(data.weekStart)} – {fmtDay(data.weekEnd)}.{data.weekStart.slice(0, 4)}</div>
      </div>
      <div>
        <div className="flex justify-between border-b py-1"><span>Ишлаган кунлари</span><span className="font-mono tabular-nums">{String(r.days).replace(".", ",")}</span></div>
        {line("Шу ҳафта ишлади", r.earned)}
        {line("Олдинги қолдиқ", r.broughtForward)}
        {data.advances.map((e) => line(`Аванс ${fmtDay(e.date)}${e.reason ? ` · ${e.reason}` : ""} (№${e.seq})`, -e.amount))}
        {data.corrections.map((e) => line(`Тузатиш ${fmtDay(e.date)}${e.reason ? ` · ${e.reason}` : ""} (№${e.seq})`, -e.amount))}
        {line("Жами тегишли", r.due)}
        {line("ТЎЛАШ КЕРАК", r.toPay, true)}
        {line("Тўланди", r.paid)}
        {line("Кейинги ҳафтага қолдиқ", r.carriedForward, true)}
        <div className="py-1 text-muted-foreground">Ҳолат: {STATUS_UZ[r.status].label}</div>
      </div>
      <div className="grid grid-cols-2 gap-8 pt-10">
        <div className="border-t pt-1 text-center text-muted-foreground">Ишчи имзоси</div>
        <div className="border-t pt-1 text-center text-muted-foreground">Раҳбар имзоси</div>
      </div>
    </div>
  );
}
