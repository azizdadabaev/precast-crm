"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Power, PowerOff } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { DriverFormDialog } from "@/components/dispatch/DriverFormDialog";
import { formatPhone } from "@/lib/phone";
import { formatDate } from "@/lib/utils";

interface Driver {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  activeDispatchCount: number;
  discrepancyCount30d: number;
  lastDispatchAt: string | null;
}

interface Me {
  role: "ADMIN" | "OWNER" | "SALES" | "ENGINEER" | "OPERATOR";
}

export default function DriversPage() {
  const qc = useQueryClient();
  const [openForm, setOpenForm] = useState(false);

  const { data: me } = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => api("/api/auth/me"),
  });
  const isAdmin = me?.role === "ADMIN" || me?.role === "OWNER";

  const { data: drivers = [], isLoading } = useQuery<Driver[]>({
    queryKey: ["drivers"],
    queryFn: () => api("/api/drivers"),
  });

  const createDriver = useMutation({
    mutationFn: (payload: { name: string; phone: string; notes: string | null }) =>
      api("/api/drivers", { method: "POST", json: payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drivers"] }),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api(`/api/drivers/${id}/deactivate`, { method: "PATCH", json: { active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drivers"] }),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Хайдовчилар <span className="text-muted-foreground font-normal text-base">· Drivers</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Truck drivers who collect cash from customers at the delivery site.
          </p>
        </div>
        <Button onClick={() => setOpenForm(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Driver
        </Button>
      </div>

      <div className="rounded-lg border bg-background overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-muted-foreground">Loading…</div>
        ) : drivers.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">No drivers yet — add your first one.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Исм · Name</th>
                <th className="text-left px-3 py-2">Тел · Phone</th>
                <th className="text-center px-3 py-2">Active dispatches</th>
                <th className="text-center px-3 py-2">Discrepancies (30d)</th>
                <th className="text-left px-3 py-2">Last dispatch</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="px-3 py-2 w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {drivers.map((d) => (
                <tr key={d.id} className={`hover:bg-muted/20 ${!d.active ? "opacity-60" : ""}`}>
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/drivers/${d.id}`} className="hover:underline">
                      {d.name}
                    </Link>
                    {d.notes && <div className="text-xs text-muted-foreground italic">{d.notes}</div>}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-xs">{formatPhone(d.phone)}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{d.activeDispatchCount}</td>
                  <td className={`px-3 py-2 text-center tabular-nums ${d.discrepancyCount30d > 0 ? "text-rose-700 font-semibold" : ""}`}>
                    {d.discrepancyCount30d}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {d.lastDispatchAt ? formatDate(d.lastDispatchAt) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider rounded px-2 py-0.5 ${d.active ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>
                      {d.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleActive.mutate({ id: d.id, active: !d.active })}
                      >
                        {d.active ? <PowerOff className="h-3.5 w-3.5 mr-1" /> : <Power className="h-3.5 w-3.5 mr-1" />}
                        {d.active ? "Deactivate" : "Activate"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <DriverFormDialog
        open={openForm}
        onClose={() => setOpenForm(false)}
        onSubmit={async (p) => {
          await createDriver.mutateAsync(p);
        }}
      />
    </div>
  );
}
