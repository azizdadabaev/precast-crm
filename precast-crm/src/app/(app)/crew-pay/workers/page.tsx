"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Som, CrewError } from "@/components/crew-pay/shared";
import { fmtDay } from "@/lib/crew-pay/format";
import { todayTashkent } from "@/lib/crew-pay/rules";
import type { WorkerHistoryView, WorkersView } from "@/lib/crew-pay/views";

export default function CrewWorkersPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", joinedOn: todayTashkent(), phone: "" });
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useQuery<WorkersView>({ queryKey: ["crew-pay", "workers"], queryFn: () => api("/api/crew-pay/workers") });
  const history = useQuery<WorkerHistoryView>({
    queryKey: ["crew-pay", "worker", openId], enabled: !!openId,
    queryFn: () => api(`/api/crew-pay/workers/${openId}`),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["crew-pay"] });
  const add = useMutation({
    mutationFn: () => api("/api/crew-pay/workers", { method: "POST", json: { name: form.name, joinedOn: form.joinedOn, phone: form.phone || null } }),
    onSuccess: () => { setForm({ name: "", joinedOn: todayTashkent(), phone: "" }); refresh(); },
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; leftOn?: string | null; name?: string; phone?: string | null }) =>
      api(`/api/crew-pay/workers/${id}`, { method: "PATCH", json: body }),
    onSuccess: refresh,
  });

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-3 space-y-2">
        <div className="font-semibold">Ишчи қўшиш <span className="text-muted-foreground font-normal">({list.data?.nextCode})</span></div>
        <div className="grid gap-2 sm:grid-cols-4">
          <Input placeholder="Исми" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input type="date" value={form.joinedOn} onChange={(e) => setForm({ ...form, joinedOn: e.target.value })} />
          <Input placeholder="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Button disabled={form.name.trim().length < 2 || add.isPending} onClick={() => add.mutate()}>Қўшиш</Button>
        </div>
        <CrewError error={add.error} />
      </div>
      <CrewError error={list.error ?? update.error} />
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr><th className="px-3 py-2">Код</th><th className="px-3 py-2">Исми</th><th className="px-3 py-2">Ҳолат</th>
              <th className="px-3 py-2">Келган</th><th className="px-3 py-2">Кетган</th><th className="px-3 py-2">Телефон</th>
              <th className="px-3 py-2 text-right">Қолдиқ</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody>
            {list.data?.workers.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Ҳали ишчи йўқ — юқорида қўшинг</td></tr>
            )}
            {list.data?.workers.map((w) => (
              <tr key={w.id} className="border-t">
                <td className="px-3 py-2 font-mono">{w.code}</td>
                <td className="px-3 py-2 max-w-[200px] truncate">
                  <button className="underline-offset-2 hover:underline min-h-[44px]" onClick={() => setOpenId(openId === w.id ? null : w.id)}>{w.name}</button>
                </td>
                <td className="px-3 py-2"><Badge variant={w.status === "ACTIVE" ? "success" : "secondary"}>{w.status === "ACTIVE" ? "Ишламоқда" : "Кетган"}</Badge></td>
                <td className="px-3 py-2 font-mono tabular-nums">{fmtDay(w.joinedOn)}</td>
                <td className="px-3 py-2 font-mono tabular-nums">{w.leftOn ? fmtDay(w.leftOn) : "—"}</td>
                <td className="px-3 py-2">{w.phone ?? "—"}</td>
                <td className="px-3 py-2 text-right"><Som value={w.owedNow} unit={false} /></td>
                <td className="px-3 py-2 text-right">
                  {w.status === "ACTIVE" ? (
                    <Button variant="ghost" size="sm" onClick={() => {
                      const d = window.prompt("Охирги иш куни (YYYY-MM-DD)", todayTashkent());
                      if (d) update.mutate({ id: w.id, leftOn: d });
                    }}>Кетди</Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => update.mutate({ id: w.id, leftOn: null })}>Қайтарди</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {openId && history.data && (
        <div className="rounded-md border p-3 space-y-2">
          <div className="font-semibold">{history.data.worker.name} — ҳафталар бўйича</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th className="py-1">Ҳафта</th><th className="py-1 text-right">Кун</th><th className="py-1 text-right">Ишлади</th>
                  <th className="py-1 text-right">Аванс</th><th className="py-1 text-right">Тузатиш</th><th className="py-1 text-right">Тўланди</th>
                  <th className="py-1 text-right">Ҳафта охирида</th></tr>
              </thead>
              <tbody>
                {history.data.weeks.map((h) => (
                  <tr key={h.weekStart} className="border-t">
                    <td className="py-1 font-mono tabular-nums">{fmtDay(h.weekStart)}</td>
                    <td className="py-1 text-right font-mono tabular-nums">{String(h.days).replace(".", ",")}</td>
                    <td className="py-1 text-right"><Som value={h.earned} unit={false} /></td>
                    <td className="py-1 text-right"><Som value={h.advances} unit={false} /></td>
                    <td className="py-1 text-right"><Som value={h.corrections} unit={false} /></td>
                    <td className="py-1 text-right"><Som value={h.paid} unit={false} /></td>
                    <td className="py-1 text-right"><Som value={h.endBalance} unit={false} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
