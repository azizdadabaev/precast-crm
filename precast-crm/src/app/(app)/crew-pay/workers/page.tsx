"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Som, CrewError, PromptDialog } from "@/components/crew-pay/shared";
import { fmtDay } from "@/lib/crew-pay/format";
import { todayTashkent } from "@/lib/crew-pay/rules";
import type { WorkerHistoryView, WorkersView } from "@/lib/crew-pay/views";

type Worker = WorkersView["workers"][number];
type Patch = { id: string; name?: string; phone?: string | null; notes?: string | null; joinedOn?: string; leftOn?: string | null };

function EditWorkerDialog({ worker, onClose, onSave, error, saving }: {
  worker: Worker | null; onClose: () => void; onSave: (p: Patch) => void; error: unknown; saving: boolean;
}) {
  const [f, setF] = useState({ name: "", phone: "", notes: "", joinedOn: "" });
  useEffect(() => {
    if (worker) setF({ name: worker.name, phone: worker.phone ?? "", notes: worker.notes ?? "", joinedOn: worker.joinedOn });
  }, [worker]);
  return (
    <Dialog open={worker != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{worker ? `${worker.code} — таҳрирлаш` : ""}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          if (worker) onSave({ id: worker.id, name: f.name.trim(), phone: f.phone.trim() || null, notes: f.notes.trim() || null, joinedOn: f.joinedOn });
        }}>
          <label className="block text-sm text-muted-foreground">Исми<Input className="mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="block text-sm text-muted-foreground">Телефон<Input className="mt-1" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
          <label className="block text-sm text-muted-foreground">Ишга келган сана<Input className="mt-1" type="date" value={f.joinedOn} onChange={(e) => setF({ ...f, joinedOn: e.target.value })} /></label>
          <label className="block text-sm text-muted-foreground">Изоҳ<Input className="mt-1" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
          <CrewError error={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Бекор қилиш</Button>
            <Button type="submit" disabled={f.name.trim().length < 2 || saving}>{saving ? "Сақланмоқда…" : "Сақлаш"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CrewWorkersPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", joinedOn: todayTashkent(), phone: "" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Worker | null>(null);
  const [leaving, setLeaving] = useState<Worker | null>(null);
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
    mutationFn: ({ id, ...body }: Patch) => api(`/api/crew-pay/workers/${id}`, { method: "PATCH", json: body }),
    onSuccess: () => { setEditing(null); refresh(); },
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
      <CrewError error={list.error ?? (editing ? null : update.error)} />
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
                <td className="px-3 py-2 whitespace-nowrap text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(w)}>Таҳрирлаш</Button>
                  {w.status === "ACTIVE" ? (
                    <Button variant="ghost" size="sm" onClick={() => setLeaving(w)}>Кетди</Button>
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
      <EditWorkerDialog worker={editing} onClose={() => setEditing(null)} onSave={(p) => update.mutate(p)}
        error={editing ? update.error : null} saving={update.isPending} />
      <PromptDialog open={leaving != null} title={leaving ? `${leaving.name} — ишдан кетди` : ""} label="Охирги иш куни"
        type="date" initial={todayTashkent()} minLength={10} confirmText="Сақлаш" onClose={() => setLeaving(null)}
        onSubmit={(d) => { if (leaving) update.mutate({ id: leaving.id, leftOn: d }); setLeaving(null); }} />
    </div>
  );
}
