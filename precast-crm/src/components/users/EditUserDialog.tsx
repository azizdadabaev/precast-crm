"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/fetcher";
import {
  isUserCustomized,
  roleDisplayLabel,
  type Action,
} from "@/lib/permissions";
import { PermissionsChecklist } from "./PermissionsChecklist";
import type { AuthUser } from "@/lib/auth";
import type { ManagedUser } from "@/app/(app)/users/types";

function generatePassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  for (const n of arr) out += chars[n % chars.length];
  return out;
}

export function EditUserDialog({
  currentUser,
  target,
  open,
  onOpenChange,
  onUpdated,
}: {
  currentUser: AuthUser;
  target: ManagedUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}) {
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<Set<Action>>(new Set());
  const [active, setActive] = useState(true);
  const [resetPwd, setResetPwd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetCopied, setResetCopied] = useState(false);

  // Authority gates — these match the server-side checks. The dialog
  // shows / hides controls based on what the actor can actually do,
  // so the UX doesn't pretend to allow what'll be 403'd.
  const canEditPermissions = currentUser.permissions.includes(
    "user.editPermissions",
  );
  const canDisable = currentUser.permissions.includes("user.disable");
  // Non-OWNER can't grant the OWNER-only flags even if they have
  // editPermissions. The server enforces too.
  const lockedActions: ReadonlySet<Action> | undefined =
    currentUser.role === "OWNER"
      ? undefined
      : new Set<Action>(["user.disable", "user.editPermissions"]);

  useEffect(() => {
    if (target) {
      setName(target.name);
      setPerms(new Set(target.permissions as Action[]));
      setActive(target.isActive);
      setResetPwd(null);
      setError(null);
    }
  }, [target]);

  if (!target) return null;

  const customized = isUserCustomized({
    role: target.role,
    permissions: Array.from(perms),
  });
  const isSelf = currentUser.id === target.id;

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = {};
      if (name !== target?.name) body.name = name;
      if (canEditPermissions) {
        body.permissions = Array.from(perms);
      }
      if (canDisable && !isSelf && active !== target?.isActive) {
        body.isActive = active;
      }
      if (resetPwd) {
        body.resetPassword = resetPwd;
      }
      await api(`/api/users/${target?.id}`, {
        method: "PATCH",
        json: body,
      });
      onUpdated();
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Фойдаланувчини таҳрирлаш · Edit user
          </DialogTitle>
          <DialogDescription>
            {target.email}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          <section className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-name">Исм · Name</Label>
                <Input
                  id="edit-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Шаблон · Template</Label>
                <Input
                  value={roleDisplayLabel(target.role)}
                  readOnly
                  className="bg-muted/30"
                />
                <div className="text-xs text-muted-foreground">
                  Шаблон ўзгартирилмайди — рухсатларни қўлда мослаштиринг ·
                  Template is read-only — adjust permissions manually.
                </div>
              </div>
            </div>
          </section>

          {canDisable && !isSelf && (
            <section className="space-y-2">
              <Label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm">
                  Фаол · Active{" "}
                  <span className="text-muted-foreground">
                    (Ўчирилган ҳисоблар кириш қилолмайди · Disabled accounts
                    cannot log in)
                  </span>
                </span>
              </Label>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">
                Рухсатлар · Permissions
              </h3>
              {customized ? (
                <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-900">
                  ✏ Шаблондан фарқ қилади · Differs from {target.role} template
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-900">
                  ✓ {target.role} шаблонига мос · Matches {target.role} template
                </span>
              )}
            </div>
            <PermissionsChecklist
              selected={perms}
              onChange={setPerms}
              disabled={!canEditPermissions}
              lockedActions={lockedActions}
            />
            {!canEditPermissions && (
              <div className="text-xs text-muted-foreground">
                Сизга рухсатларни ўзгартириш мумкин эмас · You don&apos;t have
                permission to edit permissions (requires user.editPermissions).
              </div>
            )}
          </section>

          <section className="space-y-2 rounded-md border bg-card p-3">
            <Label className="text-sm font-semibold">
              Паролни тиклаш · Reset password
            </Label>
            {resetPwd ? (
              <div className="flex items-center gap-2">
                <code className="font-mono text-sm bg-muted px-2 py-1 rounded">
                  {resetPwd}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(resetPwd).then(
                      () => setResetCopied(true),
                      () => undefined,
                    );
                    setTimeout(() => setResetCopied(false), 1500);
                  }}
                >
                  {resetCopied ? "✓ Copied" : "Copy"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setResetPwd(null)}
                >
                  Бекор · Clear
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setResetPwd(generatePassword())}
              >
                Янги парол яратиш · Generate new password
              </Button>
            )}
            <div className="text-xs text-muted-foreground">
              Янги паролни сақлаш фойдаланувчини биринчи киришда уни
              ўзгартиришга мажбур қилади · Saving with a new password forces
              the user to change it on next login.
            </div>
          </section>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t mt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Бекор қилиш · Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Сақланмоқда…" : "Сақлаш · Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
