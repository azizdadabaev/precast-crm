"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/fetcher";

export function ChangePasswordClient({
  mustChange,
  userName,
}: {
  mustChange: boolean;
  userName: string;
}) {
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
      setError("New password must be at least 8 chars");
      return;
    }
    if (newPwd !== confirmPwd) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await api("/api/users/me/password", {
        method: "POST",
        json: { currentPassword: currentPwd, newPassword: newPwd },
      });
      setSuccess(true);
      // Brief beat so the user sees the success state, then go home.
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
      <Card>
        <CardHeader>
          <CardTitle>
            {mustChange
              ? "Паролни ўзгартиринг · Change your password"
              : "Паролингизни янгиланг · Update password"}
          </CardTitle>
          <CardDescription>
            {mustChange
              ? `${userName}, илтимос дастлабки паролни ўзгартиринг · ${userName}, please change your initial password before continuing.`
              : `${userName}, ёзинг ва тасдиқланг · enter and confirm a new password.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {!mustChange && (
              <div className="space-y-1.5">
                <Label htmlFor="cur">Жорий парол · Current password</Label>
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
              <Label htmlFor="new">Янги парол · New password</Label>
              <Input
                id="new"
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <div className="text-xs text-muted-foreground">
                Камида 8 белги · At least 8 chars.
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">
                Тасдиқланг · Confirm new password
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
              <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {error}
              </div>
            )}
            {success && (
              <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-md">
                ✅ Янгиланди · Password updated
              </div>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={busy || success}
            >
              {busy
                ? "Сақланмоқда…"
                : success
                  ? "Янгиланди ✓"
                  : "Сақлаш · Save"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
