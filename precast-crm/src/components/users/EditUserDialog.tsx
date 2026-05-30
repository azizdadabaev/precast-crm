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
import { useT } from "@/lib/i18n";
import type { AuthUser } from "@/lib/auth";
import type { ManagedUser } from "@/app/(app)/users/types";

function generatePin(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 10000).padStart(4, "0");
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
  const t = useT();
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<Set<Action>>(new Set());
  const [active, setActive] = useState(true);
  const [resetPin, setResetPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetCopied, setResetCopied] = useState(false);

  const canEditPermissions = currentUser.permissions.includes("user.editPermissions");
  const canDisable = currentUser.permissions.includes("user.disable");
  const lockedActions: ReadonlySet<Action> | undefined =
    currentUser.role === "OWNER"
      ? undefined
      : new Set<Action>(["user.disable", "user.editPermissions"]);

  useEffect(() => {
    if (target) {
      setName(target.name);
      setPerms(new Set(target.permissions as Action[]));
      setActive(target.isActive);
      setResetPin(null);
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
      if (resetPin) {
        body.resetPin = resetPin;
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
            Фойдаланувчини таҳрирлаш<span className="lang-en"> · Edit user</span>
          </DialogTitle>
          <DialogDescription>
            {target.loginName ?? target.name}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          <section className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-name">Исм<span className="lang-en"> · Name</span></Label>
                <Input
                  id="edit-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Логин исми<span className="lang-en"> · Login name</span></Label>
                <Input
                  value={target.loginName ?? "—"}
                  readOnly
                  className="bg-muted/30 font-mono text-sm"
                />
                <div className="text-xs text-muted-foreground">
                  Исм ўзгарса автоматик янгиланади
                  <span className="lang-en"> · Auto-updated when name changes.</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Шаблон<span className="lang-en"> · Template</span></Label>
                <Input
                  value={roleDisplayLabel(target.role)}
                  readOnly
                  className="bg-muted/30"
                />
                <div className="text-xs text-muted-foreground">
                  Шаблон ўзгартирилмайди — рухсатларни қўлда мослаштиринг
                  <span className="lang-en"> · Template is read-only — adjust permissions manually.</span>
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
                  Фаол<span className="lang-en"> · Active</span>{" "}
                  <span className="text-muted-foreground">
                    (Ўчирилган ҳисоблар кириш қилолмайди
                    <span className="lang-en"> · Disabled accounts cannot log in</span>)
                  </span>
                </span>
              </Label>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">
                Рухсатлар<span className="lang-en"> · Permissions</span>
              </h3>
              {customized ? (
                <span className="text-xs px-2 py-0.5 rounded bg-warning/10 text-warning border border-warning/30">
                  ✏ Шаблондан фарқ қилади<span className="lang-en"> · Differs from {target.role} template</span>
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded bg-success/10 text-success border border-success/30">
                  ✓ {target.role} шаблонига мос<span className="lang-en"> · Matches {target.role} template</span>
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
                Сизга рухсатларни ўзгартириш мумкин эмас
                <span className="lang-en"> · You don&apos;t have permission to edit permissions (requires user.editPermissions).</span>
              </div>
            )}
          </section>

          <section className="space-y-2 rounded-md border border-border bg-card p-3">
            <Label className="text-sm font-semibold">
              PIN кодни тиклаш<span className="lang-en"> · Reset PIN</span>
            </Label>
            {resetPin ? (
              <div className="flex items-center gap-2">
                <code className="font-mono text-base tracking-widest bg-muted px-2 py-1 rounded">
                  {resetPin}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(resetPin).then(
                      () => setResetCopied(true),
                      () => undefined,
                    );
                    setTimeout(() => setResetCopied(false), 1500);
                  }}
                >
                  {resetCopied ? t("✓ Нусхаланди", "✓ Copied") : t("Нусхалаш", "Copy")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setResetPin(null)}
                >
                  Бекор<span className="lang-en"> · Clear</span>
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setResetPin(generatePin())}
              >
                Янги PIN яратиш<span className="lang-en"> · Generate new PIN</span>
              </Button>
            )}
            <div className="text-xs text-muted-foreground">
              Янги PIN сақлаш фойдаланувчини биринчи киришда уни ўзгартиришга мажбур қилади
              <span className="lang-en"> · Saving with a new PIN forces the user to change it on next login.</span>
            </div>
          </section>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-border mt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Бекор қилиш<span className="lang-en"> · Cancel</span>
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy
              ? t("Сақланмоқда…", "Saving…")
              : <>Сақлаш<span className="lang-en"> · Save</span></>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
