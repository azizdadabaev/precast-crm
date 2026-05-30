"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/fetcher";
import { useT } from "@/lib/i18n";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const t = useT();
  const router = useRouter();
  const search = useSearchParams();
  const [loginName, setLoginName] = useState("");
  const [pin, setPin] = useState("");
  const initialError =
    search.get("error") === "disabled"
      ? "Аккаунт ўчирилган · Account is disabled. Contact your administrator."
      : null;
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api<{ redirectTo?: string }>("/api/auth/login", {
        method: "POST",
        json: { loginName, pin },
      });
      const next = search.get("next") || data?.redirectTo || "/dashboard";
      router.push(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Brand block — matches the sidebar logo mark + wordmark style */}
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="h-11 w-11 rounded-lg bg-primary grid place-items-center shrink-0">
            <svg width="22" height="22" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="2" width="6" height="6" rx="1.5" fill="white" />
              <rect x="10" y="2" width="6" height="6" rx="1.5" fill="white" fillOpacity=".5" />
              <rect x="2" y="10" width="6" height="6" rx="1.5" fill="white" fillOpacity=".5" />
              <rect x="10" y="10" width="6" height="6" rx="1.5" fill="white" />
            </svg>
          </div>
          <div>
            <div className="text-base font-extrabold tracking-tight text-foreground leading-tight">
              EtalonSlabs
            </div>
            <div className="text-[10px] font-medium uppercase tracking-widest text-text-tertiary leading-none">
              {t("Ишлаб чиқариш CRM", "Manufacturing CRM")}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="mb-5">
            <h1 className="text-xl font-bold tracking-tight">{t("Кириш", "Sign in")}</h1>
            <p className="text-sm text-text-tertiary">
              {t(
                "Хуш келибсиз — илтимос ҳисобингизга киринг.",
                "Welcome back — please sign in to your account.",
              )}
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="loginName">{t("Исм", "Name")}</Label>
              <Input
                id="loginName"
                type="text"
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                required
                autoComplete="username"
                placeholder={t("Масалан: Азиз", "e.g. Азиз")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pin">PIN</Label>
              <Input
                id="pin"
                type="text"
                inputMode="numeric"
                maxLength={4}
                pattern="\d{4}"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                required
                autoComplete="current-password"
                placeholder="••••"
                className="tracking-[0.5em] text-center text-lg font-mono"
              />
            </div>
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 px-3 py-2 rounded-md">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading || pin.length !== 4}>
              {loading ? t("Кирилмоқда…", "Signing in…") : t("Кириш", "Sign in")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
