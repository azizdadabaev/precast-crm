"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/fetcher";
import { useT } from "@/lib/i18n";

export function ChangePasswordClient({
  mustChange,
  userName,
}: {
  mustChange: boolean;
  userName: string;
}) {
  const t = useT();
  const router = useRouter();
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPwd.length < 8) {
      setError(t("Янги парол камида 8 белги бўлиши керак", "New password must be at least 8 chars"));
      return;
    }
    if (newPwd !== confirmPwd) {
      setError(t("Пароллар мос келмайди", "Passwords do not match"));
      return;
    }
    setBusy(true);
    try {
      await api("/api/users/me/password", {
        method: "POST",
        json: { currentPassword: currentPwd, newPassword: newPwd },
      });
      setSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 800);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto pt-6">
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="mb-5">
          <h1 className="text-xl font-bold tracking-tight">
            {mustChange ? "Паролни ўзгартиринг" : "Паролингизни янгиланг"}
            <span className="lang-en text-muted-foreground font-normal text-base">
              {" "}· {mustChange ? "Change password" : "Update password"}
            </span>
          </h1>
          <p className="text-sm text-text-tertiary">
            {mustChange
              ? t(
                  `${userName}, давом этишдан олдин дастлабки паролни ўзгартиринг.`,
                  `${userName}, please change your initial password before continuing.`,
                )
              : t(
                  `${userName}, янги паролни киритинг ва тасдиқланг.`,
                  `${userName}, enter and confirm a new password.`,
                )}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {!mustChange && (
            <div className="space-y-1.5">
              <Label htmlFor="cur">Жорий парол<span className="lang-en"> · Current password</span></Label>
              <Input
                id="cur"
                type="password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="new">Янги парол<span className="lang-en"> · New password</span></Label>
            <Input
              id="new"
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <div className="text-xs text-text-tertiary">
              Камида 8 белги<span className="lang-en">{" "}· At least 8 chars.</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">
              Тасдиқланг<span className="lang-en"> · Confirm new password</span>
            </Label>
            <Input
              id="confirm"
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 px-3 py-2 rounded-md">
              {error}
            </div>
          )}
          {success && (
            <div className="text-sm text-success bg-success/10 border border-success/30 px-3 py-2 rounded-md">
              ✓ Янгиланди<span className="lang-en"> · Password updated</span>
            </div>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={busy || success}
          >
            {busy
              ? t("Сақланмоқда…", "Saving…")
              : success
                ? t("Янгиланди ✓", "Updated ✓")
                : <>Сақлаш<span className="lang-en"> · Save</span></>}
          </Button>
        </form>
      </div>
    </div>
  );
}
