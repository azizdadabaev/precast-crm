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
        className="flex w-full max-w-xs flex-col items-center gap-4 rounded-[var(--inbox-r-card)] border border-[color:var(--inbox-border)] bg-[var(--inbox-panel)] p-4 shadow-[var(--inbox-shadow-sm)]"
      >
        <div
          className="flex h-12 w-12 items-center justify-center rounded-[var(--inbox-r-pill)] bg-[var(--inbox-accent)]"
        >
          <Lock className="h-5 w-5 text-[color:var(--inbox-accent-contrast)]" />
        </div>
        <div className="text-center">
          <div className="text-[15px] font-medium text-[var(--inbox-ink)]">Хабарлар қулфланган</div>
          <p className="mt-1 text-[11px] leading-[1.4] text-[color:var(--inbox-steel)]">
            Кириш учун паролни киритинг · Enter the password to open the inbox.
          </p>
        </div>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-[var(--inbox-r-input)] border border-[color:var(--inbox-border)] bg-[var(--inbox-input-bg)] px-3 py-2 text-center text-[15px] text-[var(--inbox-ink)] outline-none transition-colors placeholder:text-[color:var(--inbox-silver)] focus:border-[color:var(--inbox-focus-ring)] focus:bg-[var(--inbox-panel)]"
          placeholder="••••••••"
        />
        {error && <span className="text-[11px] leading-[1.4] text-[color:var(--inbox-alert)]">{error}</span>}
        <Button
          type="submit"
          size="sm"
          className="w-full rounded-[var(--inbox-r-pill)] bg-[var(--inbox-accent)] text-[13px] font-medium text-[color:var(--inbox-accent-contrast)] hover:opacity-90 hover:bg-[var(--inbox-accent)]"
          disabled={m.isPending || !password}
        >
          {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Очиш · Unlock"}
        </Button>
      </form>
    </Centered>
  );
}
