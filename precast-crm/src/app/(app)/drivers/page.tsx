"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Power, PowerOff } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { DriverFormDialog } from "@/components/dispatch/DriverFormDialog";
import { PhoneLink } from "@/components/PhoneLink";
import { formatDate, cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

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
  const t = useT();
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
            Хайдовчилар
            <span className="lang-en text-muted-foreground font-normal text-base">{" "}· Drivers</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "Етказиб бериш жойида мижозлардан нақд пул йиғадиган юк машина ҳайдовчилари.",
              "Truck drivers who collect cash from customers at the delivery site.",
            )}
          </p>
        </div>
        <Button onClick={() => setOpenForm(true)}>
          <Plus className="h-4 w-4 mr-2" /> {t("Ҳайдовчи қўшиш", "Add Driver")}
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>
        ) : drivers.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            {t("Ҳозирча ҳайдовчи йўқ — биринчисини қўшинг.", "No drivers yet — add your first one.")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2.5">Исм<span className="lang-en"> · Name</span></th>
                  <th className="text-left px-3 py-2.5">Тел<span className="lang-en"> · Phone</span></th>
                  <th className="text-right px-3 py-2.5">{t("Фаол жўнатишлар", "Active dispatches")}</th>
                  <th className="text-right px-3 py-2.5">{t("Тафовутлар (30 кун)", "Discrepancies (30d)")}</th>
                  <th className="text-left px-3 py-2.5">{t("Сўнгги жўнатиш", "Last dispatch")}</th>
                  <th className="text-left px-3 py-2.5">{t("Ҳолат", "Status")}</th>
                  <th className="px-3 py-2.5 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d, i) => {
                  const hasIssues = d.discrepancyCount30d > 0;
                  return (
                    <tr
                      key={d.id}
                      className={cn(
                        "border-b last:border-b-0 border-border/60 hover:bg-surface-hover transition-colors",
                        "border-l-[3px]",
                        !d.active
                          ? "border-l-border-strong opacity-60"
                          : hasIssues
                            ? "border-l-warning"
                            : "border-l-success",
                        i % 2 === 1 && "bg-muted/30",
                      )}
                    >
                      <td className="px-3 py-2.5 font-medium">
                        <Link
                          href={`/drivers/${d.id}`}
                          className="hover:underline hover:text-primary transition-colors"
                        >
                          {d.name}
                        </Link>
                        {d.notes && (
                          <div className="text-xs text-text-tertiary italic">{d.notes}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-text-tertiary">
                        <PhoneLink phone={d.phone} />
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {d.activeDispatchCount}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right font-mono",
                          hasIssues ? "text-destructive font-bold" : "text-text-tertiary",
                        )}
                      >
                        {d.discrepancyCount30d}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-text-tertiary">
                        {d.lastDispatchAt ? formatDate(d.lastDispatchAt) : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        {d.active ? (
                          <Chip variant="success">
                            <span>●</span>
                            <span>{t("Фаол", "Active")}</span>
                          </Chip>
                        ) : (
                          <Chip variant="neutral">{t("Нофаол", "Inactive")}</Chip>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              toggleActive.mutate({ id: d.id, active: !d.active })
                            }
                          >
                            {d.active ? (
                              <PowerOff className="h-3.5 w-3.5 mr-1" />
                            ) : (
                              <Power className="h-3.5 w-3.5 mr-1" />
                            )}
                            {d.active ? t("Ўчириш", "Deactivate") : t("Фаоллаштириш", "Activate")}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
