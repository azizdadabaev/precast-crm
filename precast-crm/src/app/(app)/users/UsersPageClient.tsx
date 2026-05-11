"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Plus, Pencil } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { isUserCustomized, roleDisplayLabel } from "@/lib/permissions";
import { AddUserDialog } from "@/components/users/AddUserDialog";
import { EditUserDialog } from "@/components/users/EditUserDialog";
import type { AuthUser } from "@/lib/auth";
import type { ManagedUser } from "./types";

export function UsersPageClient({ currentUser }: { currentUser: AuthUser }) {
  const t = useT();
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useQuery<ManagedUser[]>({
    queryKey: ["users"],
    queryFn: () => api<ManagedUser[]>("/api/users"),
    refetchOnWindowFocus: false,
  });

  const canCreate = currentUser.permissions.includes("user.create");
  const canEdit = currentUser.permissions.includes("user.edit");

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ManagedUser | null>(null);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["users"] });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Фойдаланувчилар
            <span className="lang-en text-muted-foreground font-normal text-base">
              {" "}· Users
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "Ходим қўшинг, рухсатларни мослаштиринг, ҳисобларни ўчиринг.",
              "Add staff, customize permissions, disable accounts.",
            )}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t("Фойдаланувчи қўшиш", "Add user")}
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2.5">Исм<span className="lang-en"> · Name</span></th>
                <th className="text-left px-3 py-2.5">Email</th>
                <th className="text-left px-3 py-2.5">Шаблон<span className="lang-en"> · Template</span></th>
                <th className="text-right px-3 py-2.5">{t("Рухсат", "Perms")}</th>
                <th className="text-left px-3 py-2.5">{t("Ҳолат", "Status")}</th>
                <th className="text-left px-3 py-2.5">{t("Сўнгги кириш", "Last login")}</th>
                <th className="px-3 py-2.5 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    {t("Юкланмоқда…", "Loading…")}
                  </td>
                </tr>
              )}
              {!isLoading && users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    {t("Фойдаланувчилар йўқ", "No users")}
                  </td>
                </tr>
              )}
              {users.map((u, i) => {
                const customized = isUserCustomized({
                  role: u.role,
                  permissions: u.permissions,
                });
                const inactive = !u.isActive;
                return (
                  <tr
                    key={u.id}
                    className={cn(
                      "border-b last:border-b-0 border-border/60 hover:bg-surface-hover transition-colors",
                      "border-l-[3px]",
                      inactive ? "border-l-border-strong opacity-60" : "border-l-success",
                      i % 2 === 1 && "bg-muted/30",
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{u.name}</div>
                      {u.id === currentUser.id && (
                        <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
                          {t("сиз", "you")}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-text-tertiary">
                      {u.email}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Chip variant="default">{roleDisplayLabel(u.role)}</Chip>
                        {customized && (
                          <Chip variant="neutral">
                            <Pencil className="h-2.5 w-2.5" />
                            {t("Махсус", "Custom")}
                          </Chip>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-text-tertiary">
                      {u.permissions.length}
                    </td>
                    <td className="px-3 py-2.5">
                      {u.isActive ? (
                        <Chip variant="success">
                          <span>●</span>
                          <span>{t("Фаол", "Active")}</span>
                        </Chip>
                      ) : (
                        <Chip variant="neutral">{t("Ўчирилган", "Disabled")}</Chip>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono text-text-tertiary">
                      {u.lastLogin ? formatDate(new Date(u.lastLogin)) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditTarget(u)}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          {t("Таҳрирлаш", "Edit")}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {canCreate && (
        <AddUserDialog
          currentUser={currentUser}
          open={addOpen}
          onOpenChange={setAddOpen}
          onCreated={refresh}
        />
      )}

      {canEdit && (
        <EditUserDialog
          currentUser={currentUser}
          target={editTarget}
          open={!!editTarget}
          onOpenChange={(open) => {
            if (!open) setEditTarget(null);
          }}
          onUpdated={refresh}
        />
      )}
    </div>
  );
}
