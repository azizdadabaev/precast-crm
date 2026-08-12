"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Centered } from "./Bubbles";

export function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => api("/api/inbox/unlock", { method: "POST", json: { password } }),
    onSuccess: onUnlocked,
    onError: (e: Error) => setError(e.message),
  });
  return (
    <Centered>
      <form
        onSubmit={(e) => { e.preventDefault(); setError(null); m.mutate(); }}
        className="flex w-full max-w-xs flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 shadow-sm"
      >
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--tg-accent)]"
        >
          <Lock className="h-7 w-7 text-white" />
        </div>
        <div className="text-center">
          <div className="font-semibold">Хабарлар қулфланган</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Кириш учун паролни киритинг · Enter the password to open the inbox.
          </p>
        </div>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-center text-sm outline-none focus:border-[color:var(--tg-accent)] focus:ring-1 focus:ring-[color:var(--tg-accent)]"
          placeholder="••••••••"
        />
        {error && <span className="text-xs text-destructive">{error}</span>}
        <Button type="submit" size="sm" className="w-full" disabled={m.isPending || !password}>
          {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Очиш · Unlock"}
        </Button>
      </form>
    </Centered>
  );
}
