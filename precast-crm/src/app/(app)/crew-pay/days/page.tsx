"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Som, WeekPicker, useCrewWeek, CrewError, weekFromQuery } from "@/components/crew-pay/shared";
import { fmtDay, fmtSom } from "@/lib/crew-pay/format";
import { todayTashkent } from "@/lib/crew-pay/rules";
import type { DaysView } from "@/lib/crew-pay/views";

type Row = DaysView["rows"][number];
const next = (v: number | undefined) => (v === 1 ? 0.5 : v === 0.5 ? undefined : 1);

function DayCard({ row, workers, closed: weekClosed, onSaved }: { row: Row; workers: DaysView["workers"]; closed: boolean; onSaved: () => void }) {
  const today = todayTashkent();
  const future = row.date > today;
  const closed = weekClosed || future;
  const employed = (w: DaysView["workers"][number]) => w.joinedOn <= row.date && (!w.leftOn || row.date <= w.leftOn);
  const [moulded, setMoulded] = useState(row.moulded == null ? "" : String(row.moulded));
  const [broken, setBroken] = useState(row.broken ? String(row.broken) : "");
  const [att, setAtt] = useState<Record<string, number>>(row.attendance);
  const [notes, setNotes] = useState(row.notes ?? "");
  useEffect(() => {
    setMoulded(row.moulded == null ? "" : String(row.moulded));
    setBroken(row.broken ? String(row.broken) : "");
    setAtt(row.attendance);
    setNotes(row.notes ?? "");
  }, [row]);

  const save = useMutation({
    mutationFn: (confirmNoAttendance: boolean) => api("/api/crew-pay/days", {
      method: "PUT",
      json: { date: row.date, moulded: moulded === "" ? null : Number(moulded), broken: broken === "" ? 0 : Number(broken),
              attendance: att, notes: notes || null, confirmNoAttendance },
    }),
    onSuccess: onSaved,
  });
  const submit = () => save.mutate(false, {
    onError: (e) => {
      if (e instanceof ApiError && e.message.includes("ҳеч ким") &&
          window.confirm(`${e.message}\n\nБарибир сақлансинми?`)) save.mutate(true);
    },
  });
  const dirty = moulded !== (row.moulded == null ? "" : String(row.moulded)) || broken !== (row.broken ? String(row.broken) : "") ||
    JSON.stringify(att) !== JSON.stringify(row.attendance) || notes !== (row.notes ?? "");

  return (
    <div className={cn("rounded-md border p-3 space-y-3", row.date === today && "border-primary")}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-semibold">{row.dayName} <span className="font-mono tabular-nums text-muted-foreground">{fmtDay(row.date)}</span>{future && <span className="ml-2 text-xs font-normal text-muted-foreground">ҳали келмаган</span>}</div>
        <div className="text-sm"><Som value={row.payValue} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted-foreground">Қолипланган
          <Input inputMode="numeric" disabled={closed} value={moulded} className="font-mono tabular-nums"
            onChange={(e) => setMoulded(e.target.value.replace(/\D/g, ""))} />
        </label>
        <label className="text-xs text-muted-foreground">Синган
          <Input inputMode="numeric" disabled={closed} value={broken} className="font-mono tabular-nums"
            onChange={(e) => setBroken(e.target.value.replace(/\D/g, ""))} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {workers.map((w) => {
          const v = att[w.id];
          return (
            <button key={w.id} type="button" disabled={closed || !employed(w)} title={employed(w) ? undefined : "Бу санада ишламаган"}
              onClick={() => setAtt((a) => { const n = { ...a }; const nv = next(a[w.id]); if (nv) n[w.id] = nv; else delete n[w.id]; return n; })}
              className={cn("min-h-[44px] rounded-full border px-3 text-sm disabled:opacity-50",
                v === 1 ? "bg-primary text-primary-foreground border-primary" : v === 0.5 ? "border-primary text-primary" : "text-muted-foreground")}>
              {w.name} <span className="font-mono">{v === 1 ? "1" : v === 0.5 ? "½" : "—"}</span>
            </button>
          );
        })}
        {!closed && workers.length > 0 && (
          <Button type="button" variant="ghost" size="sm" className="min-h-[44px]"
            onClick={() => setAtt(Object.fromEntries(workers.filter(employed).map((w) => [w.id, 1])))}>Ҳамма келди</Button>
        )}
      </div>
      <Input placeholder="Изоҳ" disabled={closed} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">сифатли {fmtSom(row.good)} · иш куни {String(row.crewDays).replace(".", ",")}</span>
        {!closed && <Button size="sm" disabled={!dirty || save.isPending} onClick={submit}>{save.isPending ? "Сақланмоқда…" : "Сақлаш"}</Button>}
      </div>
      <CrewError error={save.error} />
    </div>
  );
}

export default function CrewDaysPage() {
  const params = useSearchParams();
  const [week, setWeek] = useCrewWeek(weekFromQuery(params.get("week")));
  const qc = useQueryClient();
  const { data, error, isLoading } = useQuery<DaysView>({
    queryKey: ["crew-pay", "days", week],
    queryFn: () => api(`/api/crew-pay/days?week=${week}`),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["crew-pay"] });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <WeekPicker week={week} onChange={setWeek} />
        {data?.closed && <span className="flex items-center gap-1 text-sm text-muted-foreground"><Lock className="h-4 w-4" /> Ҳафта ёпилган</span>}
      </div>
      <CrewError error={error} />
      {isLoading && <p className="text-sm text-muted-foreground">Юкланмоқда…</p>}
      {data && (
        <>
          {data.workers.length === 0 && <p className="text-sm text-muted-foreground">Бу ҳафта ишлаётган ишчи йўқ — «Ишчилар»да қўшинг.</p>}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.rows.map((r) => <DayCard key={r.date} row={r} workers={data.workers} closed={data.closed} onSaved={refresh} />)}
          </div>
          <div className="flex flex-wrap gap-4 rounded-md border px-3 py-2 text-sm">
            <span>Ҳафта: қолипланган <b className="font-mono tabular-nums">{fmtSom(data.totals.moulded)}</b></span>
            <span>синган <b className="font-mono tabular-nums">{fmtSom(data.totals.broken)}</b></span>
            <span>сифатли <b className="font-mono tabular-nums">{fmtSom(data.totals.good)}</b></span>
            <span>ҳафта пули <Som value={data.totals.pot} /></span>
          </div>
        </>
      )}
    </div>
  );
}
