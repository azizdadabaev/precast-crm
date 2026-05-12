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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        json: { email, password },
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
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("Парол", "Password")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 px-3 py-2 rounded-md">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("Кирилмоқда…", "Signing in…") : t("Кириш", "Sign in")}
            </Button>
            <p className="text-[11px] font-mono text-text-tertiary text-center pt-2">
              {t("Стандарт уруғ:", "Default seed:")} admin@precast.local / admin123
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
