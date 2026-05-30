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
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4}$/.test(newPin)) {
      setError(t("PIN 4 та рақамдан иборат бўлиши керак", "PIN must be exactly 4 digits"));
      return;
    }
    setBusy(true);
    try {
      await api("/api/users/me/password", {
        method: "POST",
        json: { currentPin, newPin },
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
            {mustChange ? "PIN кодни ўзгартиринг" : "PIN кодингизни янгиланг"}
            <span className="lang-en text-muted-foreground font-normal text-base">
              {" "}· {mustChange ? "Change PIN" : "Update PIN"}
            </span>
          </h1>
          <p className="text-sm text-text-tertiary">
            {mustChange
              ? t(
                  `${userName}, давом этишдан олдин янги PIN код ўрнатинг.`,
                  `${userName}, please set a new PIN before continuing.`,
                )
              : t(
                  `${userName}, янги 4 хонали PIN кодни киритинг.`,
                  `${userName}, enter a new 4-digit PIN.`,
                )}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {!mustChange && (
            <div className="space-y-1.5">
              <Label htmlFor="cur">Жорий PIN<span className="lang-en"> · Current PIN</span></Label>
              <Input
                id="cur"
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                required
                autoComplete="current-password"
                placeholder="••••"
                className="tracking-[0.5em] text-center text-lg font-mono"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="new">Янги PIN<span className="lang-en"> · New PIN</span></Label>
            <Input
              id="new"
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              required
              autoComplete="new-password"
              placeholder="••••"
              className="tracking-[0.5em] text-center text-lg font-mono"
            />
            <div className="text-xs text-text-tertiary">
              4 та рақам<span className="lang-en">{" "}· Exactly 4 digits.</span>
            </div>
          </div>
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 px-3 py-2 rounded-md">
              {error}
            </div>
          )}
          {success && (
            <div className="text-sm text-success bg-success/10 border border-success/30 px-3 py-2 rounded-md">
              ✓ Янгиланди<span className="lang-en"> · PIN updated</span>
            </div>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={busy || success || newPin.length !== 4}
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
