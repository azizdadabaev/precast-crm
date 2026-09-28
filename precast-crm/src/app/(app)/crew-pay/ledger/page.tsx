"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Som, CrewError, newKey } from "@/components/crew-pay/shared";
import { fmtDay } from "@/lib/crew-pay/format";
import { todayTashkent } from "@/lib/crew-pay/rules";
import type { LedgerView, WorkersView } from "@/lib/crew-pay/views";
import type { LedgerType } from "@/lib/crew-pay/engine";

const TYPE_UZ: Record<LedgerType, string> = { ADVANCE: "Аванс", WEEKLY_PAY: "Иш ҳақи", CORRECTION: "Тузатиш" };
const METHOD_UZ = { CASH: "Нақд", CARD: "Карта", OFFSET: "Ҳисобга олиш", OTHER: "Бошқа" } as const;
type Method = keyof typeof METHOD_UZ;
const selectCls = "h-10 rounded-md border bg-background px-3 text-sm";

export default function CrewLedgerPage() {
  const qc = useQueryClient();
  const [filterWorker, setFilterWorker] = useState("");
  const [filterType, setFilterType] = useState("");
  const [form, setForm] = useState({ date: todayTashkent(), workerId: "", amount: "", reason: "", method: "CASH" as Method });
  const [key, setKey] = useState(newKey);

  const workers = useQuery<WorkersView>({ queryKey: ["crew-pay", "workers"], queryFn: () => api("/api/crew-pay/workers") });
  const ledger = useQuery<LedgerView>({
    queryKey: ["crew-pay", "ledger", filterWorker, filterType],
    queryFn: () => api(`/api/crew-pay/ledger?worker=${filterWorker}&type=${filterType}`),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["crew-pay"] });

  const add = useMutation({
    mutationFn: (confirmOverBalance: boolean) => api("/api/crew-pay/ledger", {
      method: "POST",
      json: { date: form.date, workerId: form.workerId, type: "ADVANCE", amount: Number(form.amount),
              method: form.method, reason: form.reason || null, clientKey: key, confirmOverBalance },
    }),
    onSuccess: () => { setForm((f) => ({ ...f, amount: "", reason: "" })); setKey(newKey()); refresh(); },
  });
  const submit = () => add.mutate(false, {
    onError: (e) => {
      if (e instanceof ApiError && e.status === 422 && e.message.includes("қарз") &&
          window.confirm(`${e.message}\n\nБарибир берилсинми?`)) add.mutate(true);
    },
  });

  const reverse = useMutation({
    mutationFn: (id: string) => api(`/api/crew-pay/ledger/${id}/reverse`, { method: "POST", json: { date: todayTashkent() } }),
    onSuccess: refresh,
  });
  const patch = useMutation({
    mutationFn: ({ id, ...body }: { id: string; signed?: boolean; reason?: string | null }) =>
      api(`/api/crew-pay/ledger/${id}`, { method: "PATCH", json: body }),
    onSuccess: refresh,
  });

  const active = workers.data?.workers.filter((w) => w.status === "ACTIVE") ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-3 space-y-3">
        <div className="font-semibold">Аванс бериш</div>
        <div className="grid gap-2 sm:grid-cols-5">
          <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <select className={selectCls} value={form.workerId} onChange={(e) => setForm({ ...form, workerId: e.target.value })}>
            <option value="">Ишчини танланг</option>
            {active.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <Input inputMode="numeric" placeholder="Сумма, сўм" className="font-mono tabular-nums" value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/\D/g, "") })} />
          <select className={selectCls} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as Method })}>
            {Object.entries(METHOD_UZ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <Input placeholder="Сабаб (масалан: Карта)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
        <Button disabled={!form.workerId || !form.amount || add.isPending} onClick={submit}>
          {add.isPending ? "Сақланмоқда…" : "Аванс бериш"}
        </Button>
        <CrewError error={add.error} />
      </div>

      <div className="flex flex-wrap gap-2">
        <select className={selectCls} value={filterWorker} onChange={(e) => setFilterWorker(e.target.value)}>
          <option value="">Ҳамма ишчилар</option>
          {workers.data?.workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select className={selectCls} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">Ҳамма турлар</option>
          {Object.entries(TYPE_UZ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <CrewError error={ledger.error ?? reverse.error ?? patch.error} />
      {ledger.data && (
        <>
          <div className="flex flex-wrap gap-4 text-sm">
            {(Object.keys(TYPE_UZ) as LedgerType[]).map((t) => (
              <span key={t}>{TYPE_UZ[t]}: <Som value={ledger.data.totals[t]} /></span>
            ))}
          </div>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">№</th><th className="px-3 py-2">Сана</th><th className="px-3 py-2">Ишчи</th>
                  <th className="px-3 py-2">Тур</th><th className="px-3 py-2 text-right">Сумма</th><th className="px-3 py-2">Усул</th>
                  <th className="px-3 py-2">Сабаб</th><th className="px-3 py-2">Имзо</th>
                  <th className="px-3 py-2 text-right">Қолдиқ</th><th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {ledger.data.entries.length === 0 && (
                  <tr><td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">Ҳали ёзув йўқ</td></tr>
                )}
                {ledger.data.entries.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="px-3 py-2 font-mono tabular-nums">{e.seq}</td>
                    <td className="px-3 py-2 font-mono tabular-nums">{fmtDay(e.date)}</td>
                    <td className="px-3 py-2 max-w-[160px] truncate">{e.workerName}</td>
                    <td className="px-3 py-2">{TYPE_UZ[e.type]}</td>
                    <td className="px-3 py-2 text-right"><Som value={e.amount} unit={false} /></td>
                    <td className="px-3 py-2">{METHOD_UZ[e.method]}</td>
                    <td className="px-3 py-2 max-w-[220px]">
                      <button className="truncate text-left hover:underline min-h-[44px]" title="Сабабни ўзгартириш"
                        onClick={() => { const r = window.prompt("Сабаб", e.reason ?? ""); if (r !== null) patch.mutate({ id: e.id, reason: r || null }); }}>
                        {e.reason || <span className="text-muted-foreground">—</span>}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <input type="checkbox" className="h-5 w-5" checked={e.signed} aria-label="Имзоланган"
                        onChange={() => patch.mutate({ id: e.id, signed: !e.signed })} />
                    </td>
                    <td className="px-3 py-2 text-right"><Som value={e.balanceAfter} unit={false} /></td>
                    <td className="px-3 py-2 text-right">
                      {e.type !== "CORRECTION" && (
                        <Button variant="ghost" size="sm" disabled={reverse.isPending}
                          onClick={() => window.confirm(`№${e.seq} қайтарилсинми? Қарама-қарши «Тузатиш» ёзуви қўшилади.`) && reverse.mutate(e.id)}>
                          Қайтариш
                        </Button>
                      )}
                    </td>
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
