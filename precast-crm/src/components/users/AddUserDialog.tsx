"use client";

import { useState } from "react";
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
import { Select } from "@/components/ui/select";
import { api } from "@/lib/fetcher";
import {
  ACTIONS,
  getDefaultPermissionsForRole,
  type Action,
} from "@/lib/permissions";
import { PermissionsChecklist } from "./PermissionsChecklist";
import { useT } from "@/lib/i18n";
import type { AuthUser } from "@/lib/auth";

const ROLE_OPTIONS: Array<{ value: string; uz: string; en: string }> = [
  { value: "OWNER",      uz: "Эгаси",          en: "Owner" },
  { value: "ADMIN",      uz: "Администратор",  en: "Admin" },
  { value: "SALES",      uz: "Сотув",          en: "Sales" },
  { value: "INVENTORY",  uz: "Омбор",          en: "Inventory" },
  { value: "DRIVER",     uz: "Ҳайдовчи",       en: "Driver" },
  { value: "ACCOUNTANT", uz: "Бухгалтер",      en: "Accountant" },
  { value: "CUSTOM",     uz: "Махсус (стандартсиз)", en: "Custom (no defaults)" },
];

function generatePin(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 10000).padStart(4, "0");
}

export function AddUserDialog({
  currentUser,
  open,
  onOpenChange,
  onCreated,
}: {
  currentUser: AuthUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [pin, setPin] = useState(() => generatePin());
  const [role, setRole] = useState("SALES");
  const [perms, setPerms] = useState<Set<Action>>(
    () => new Set(getDefaultPermissionsForRole("SALES")),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ pin: string; loginName: string } | null>(null);

  const lockedActions: ReadonlySet<Action> | undefined =
    currentUser.role === "OWNER"
      ? undefined
      : new Set<Action>(["user.disable", "user.editPermissions"]);

  function changeRole(nextRole: string) {
    setRole(nextRole);
    setPerms(new Set(getDefaultPermissionsForRole(nextRole) as Action[]));
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const result = await api<{ loginName: string }>("/api/users", {
        method: "POST",
        json: {
          name: name.trim(),
          pin,
          role,
          permissions: Array.from(perms),
        },
      });
      setCreated({ pin, loginName: result?.loginName ?? name.trim() });
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setName("");
    setPin(generatePin());
    setRole("SALES");
    setPerms(new Set(getDefaultPermissionsForRole("SALES") as Action[]));
    setError(null);
    setCreated(null);
  }

  function close(open: boolean) {
    if (!open) reset();
    onOpenChange(open);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Янги фойдаланувчи<span className="lang-en"> · New user</span>
          </DialogTitle>
          <DialogDescription>
            Шаблонни танлаб, рухсатларни мослаштиринг
            <span className="lang-en"> · Pick a template, then customize permissions.</span>
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <CreatedScreen
            pin={created.pin}
            loginName={created.loginName}
            onClose={() => close(false)}
          />
        ) : (
          <div className="flex-1 overflow-y-auto space-y-5 pr-1">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                A. Маълумот<span className="lang-en"> · Basic info</span>
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="user-name">Исм<span className="lang-en"> · Name</span></Label>
                  <Input
                    id="user-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder={t("Тўлиқ исм", "Full name")}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="user-pin">
                    Дастлабки PIN<span className="lang-en"> · Initial PIN</span>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="user-pin"
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      required
                      className="tracking-[0.5em] text-center text-lg font-mono"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPin(generatePin())}
                    >
                      Янгилаш<span className="lang-en"> · Regenerate</span>
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Фойдаланувчи биринчи киришда ўзгартиради
                    <span className="lang-en"> · User changes this on first login.</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                B. Шаблон<span className="lang-en"> · Template</span>
              </h3>
              <Select
                value={role}
                onChange={(e) => changeRole(e.target.value)}
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.uz}{t("", ` · ${opt.en}`)}
                  </option>
                ))}
              </Select>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                C. Рухсатлар<span className="lang-en"> · Permissions</span>
              </h3>
              <PermissionsChecklist
                selected={perms}
                onChange={setPerms}
                lockedActions={lockedActions}
              />
            </section>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {error}
              </div>
            )}
          </div>
        )}

        {!created && (
          <div className="flex justify-end gap-2 pt-3 border-t border-border mt-3">
            <Button variant="outline" onClick={() => close(false)}>
              Бекор қилиш<span className="lang-en"> · Cancel</span>
            </Button>
            <Button onClick={submit} disabled={busy || !name.trim() || pin.length !== 4}>
              {busy
                ? t("Қўшилмоқда…", "Adding…")
                : t(
                    `${perms.size} та рухсат бериб қўшиш`,
                    `Add with ${perms.size} permissions`,
                  )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreatedScreen({
  pin,
  loginName,
  onClose,
}: {
  pin: string;
  loginName: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4 py-2">
      <div className="rounded-md border border-success/30 bg-success/10 p-4 text-success">
        <div className="font-medium">
          ✓ Фойдаланувчи яратилди<span className="lang-en"> · User created</span>
        </div>
        <div className="mt-2 text-sm">
          Логин исми: <code className="text-sm font-mono bg-card px-2 py-0.5 rounded">{loginName}</code>
        </div>
        <div className="mt-1 text-sm">
          PIN: <code className="text-base font-mono bg-card px-2 py-0.5 rounded tracking-widest">{pin}</code>
        </div>
        <div className="mt-3 text-xs text-success/80">
          Бу PIN кейин кўрсатилмайди — ҳозир нусхалаб олинг
          <span className="lang-en"> · This PIN won&apos;t be shown again — copy it now.</span>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            navigator.clipboard.writeText(`${loginName} / ${pin}`).then(
              () => setCopied(true),
              () => undefined,
            );
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied
            ? <>Нусхаланди ✓<span className="lang-en"> · Copied</span></>
            : <>Нусхалаш<span className="lang-en"> · Copy login + PIN</span></>}
        </Button>
        <Button onClick={onClose}>Ёпиш<span className="lang-en"> · Close</span></Button>
      </div>
    </div>
  );
}

void ACTIONS;
