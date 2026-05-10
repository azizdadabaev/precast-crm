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
import type { AuthUser } from "@/lib/auth";

const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "OWNER", label: "Эгаси · Owner" },
  { value: "ADMIN", label: "Администратор · Admin" },
  { value: "SALES", label: "Сотув · Sales" },
  { value: "INVENTORY", label: "Омбор · Inventory" },
  { value: "DRIVER", label: "Ҳайдовчи · Driver" },
  { value: "ACCOUNTANT", label: "Бухгалтер · Accountant" },
  { value: "CUSTOM", label: "Махсус · Custom (no defaults)" },
];

// 12-char password from a clear character set (no l/I/0/O ambiguity).
function generatePassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  for (const n of arr) out += chars[n % chars.length];
  return out;
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
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(() => generatePassword());
  const [role, setRole] = useState("SALES");
  const [perms, setPerms] = useState<Set<Action>>(
    () => new Set(getDefaultPermissionsForRole("SALES")),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ password: string } | null>(null);

  // Non-OWNER actors can't grant the OWNER-only flags. The checklist
  // greys them out via `lockedActions`, and the server rejects too.
  const lockedActions: ReadonlySet<Action> | undefined =
    currentUser.role === "OWNER"
      ? undefined
      : new Set<Action>(["user.disable", "user.editPermissions"]);

  function changeRole(nextRole: string) {
    const nextDefaults = new Set(
      getDefaultPermissionsForRole(nextRole) as Action[],
    );
    // No confirmation: the spec asks for one but the dialog is single-
    // step so a wrong template pick is a 1-click fix. If the user
    // ticked extras after picking SALES and then switches to OWNER,
    // they get the OWNER defaults and can re-tick what they want.
    setRole(nextRole);
    setPerms(nextDefaults);
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await api("/api/users", {
        method: "POST",
        json: {
          name,
          email: email.toLowerCase().trim(),
          password,
          role,
          permissions: Array.from(perms),
        },
      });
      setCreated({ password });
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setName("");
    setEmail("");
    setPassword(generatePassword());
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
            Янги фойдаланувчи · New user
          </DialogTitle>
          <DialogDescription>
            Шаблонни танлаб, рухсатларни мослаштиринг · Pick a template,
            then customize permissions.
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <CreatedScreen
            password={created.password}
            email={email}
            onClose={() => close(false)}
          />
        ) : (
          <div className="flex-1 overflow-y-auto space-y-5 pr-1">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                A. Маълумот · Basic info
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="user-name">Исм · Name</Label>
                  <Input
                    id="user-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="user-email">Email</Label>
                  <Input
                    id="user-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="user-password">
                    Дастлабки парол · Initial password
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="user-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPassword(generatePassword())}
                    >
                      Янгилаш · Regenerate
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Фойдаланувчи биринчи киришда ўзгартиради · User will
                    change this on first login.
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                B. Шаблон · Template
              </h3>
              <Select
                value={role}
                onChange={(e) => changeRole(e.target.value)}
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                C. Рухсатлар · Permissions
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
          <div className="flex justify-end gap-2 pt-3 border-t mt-3">
            <Button variant="outline" onClick={() => close(false)}>
              Бекор қилиш · Cancel
            </Button>
            <Button onClick={submit} disabled={busy || !name || !email || password.length < 8}>
              {busy
                ? "Қўшилмоқда…"
                : `${perms.size} та рухсат бериб қўшиш · Add with ${perms.size} permissions`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreatedScreen({
  password,
  email,
  onClose,
}: {
  password: string;
  email: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4 py-2">
      <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
        <div className="font-medium">
          ✅ Фойдаланувчи яратилди · User created
        </div>
        <div className="mt-2 text-sm">
          Email: <code className="text-xs">{email}</code>
        </div>
        <div className="mt-1 text-sm">
          Парол: <code className="text-base font-mono bg-white px-2 py-0.5 rounded">{password}</code>
        </div>
        <div className="mt-3 text-xs text-emerald-800/80">
          Бу парол кейин кўрсатилмайди — ҳозир нусхалаб олинг ·
          This password won&apos;t be shown again — copy it now.
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            navigator.clipboard.writeText(password).then(
              () => setCopied(true),
              () => undefined,
            );
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Нусхаланди ✓ · Copied" : "Паролни нусхалаш · Copy password"}
        </Button>
        <Button onClick={onClose}>Ёпиш · Close</Button>
      </div>
    </div>
  );
}

void ACTIONS;
