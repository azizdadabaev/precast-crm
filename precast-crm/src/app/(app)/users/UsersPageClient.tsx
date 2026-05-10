"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { isUserCustomized, roleDisplayLabel } from "@/lib/permissions";
import { AddUserDialog } from "@/components/users/AddUserDialog";
import { EditUserDialog } from "@/components/users/EditUserDialog";
import type { AuthUser } from "@/lib/auth";
import type { ManagedUser } from "./types";

export function UsersPageClient({ currentUser }: { currentUser: AuthUser }) {
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Фойдаланувчилар · Users
          </h1>
          <p className="text-sm text-muted-foreground">
            Ходимларни қўшинг, рухсатларни мослаштиринг ва ҳисобларни ўчиринг ·
            Add staff, customize permissions, disable accounts.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Янги фойдаланувчи · Add user
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-left">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Исм · Name</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Шаблон · Template</th>
                  <th className="px-4 py-2.5 font-medium">Рухсатлар · Perms</th>
                  <th className="px-4 py-2.5 font-medium">Ҳолати · Status</th>
                  <th className="px-4 py-2.5 font-medium">
                    Охирги кириш · Last login
                  </th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      Юкланмоқда…
                    </td>
                  </tr>
                )}
                {!isLoading && users.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      Ҳеч ким йўқ · No users
                    </td>
                  </tr>
                )}
                {users.map((u) => {
                  const customized = isUserCustomized({
                    role: u.role,
                    permissions: u.permissions,
                  });
                  return (
                    <tr
                      key={u.id}
                      className={`border-b last:border-0 ${
                        u.isActive ? "" : "opacity-50"
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{u.name}</div>
                        {u.id === currentUser.id ? (
                          <div className="text-xs text-muted-foreground">
                            (you)
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">
                        {u.email}
                      </td>
                      <td className="px-4 py-2.5">
                        <span>{roleDisplayLabel(u.role)}</span>
                        {customized ? (
                          <Badge variant="outline" className="ml-2">
                            ✏ Махсус
                          </Badge>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {u.permissions.length}
                      </td>
                      <td className="px-4 py-2.5">
                        {u.isActive ? (
                          <span className="text-emerald-700">
                            Фаол · Active
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            Ўчирилган · Disabled
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {u.lastLogin ? formatDate(new Date(u.lastLogin)) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditTarget(u)}
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1" />
                            Edit
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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
