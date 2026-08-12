"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { Check, Clock, Loader2, Lock, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { ConversationSummary } from "@/components/inbox/inbox-types";
import { INBOX_CSS } from "@/components/inbox/inbox-style";
import { readAutolockMin } from "@/components/inbox/inbox-utils";
import { Centered } from "@/components/inbox/Bubbles";
import { LockScreen } from "@/components/inbox/LockScreen";
import { ChannelTabs, ConversationList } from "@/components/inbox/ConversationList";
import { EmptyState, Thread } from "@/components/inbox/Thread";
import { SimulateModal } from "@/components/inbox/SimulateModal";

export function InboxClient() {
  const qc = useQueryClient();

  // ── Lock gate ──────────────────────────────────────────────────
  const { data: unlockState, isLoading: unlockLoading } = useQuery({
    queryKey: ["inbox-unlock"],
    queryFn: () => api<{ unlocked: boolean }>("/api/inbox/unlock"),
    retry: false,
  });

  if (unlockLoading) return <Centered><Loader2 className="h-5 w-5 animate-spin text-[color:var(--inbox-steel)]" /></Centered>;
  if (!unlockState?.unlocked) return <LockScreen onUnlocked={() => qc.invalidateQueries({ queryKey: ["inbox-unlock"] })} />;

  return <Inbox />;
}

// The shared shell buttons (simulate / settings / lock): pill, 1px border,
// achromatic. Overrides the app-wide outline variant so the Inbox chrome
// reads from the --inbox-* tokens like everything else on this screen.
const CHROME_BUTTON =
  "h-8 rounded-[var(--inbox-r-pill)] border-[color:var(--inbox-border)] bg-[var(--inbox-panel)] text-[13px] font-medium text-[var(--inbox-ink)] shadow-[var(--inbox-shadow-sm)] hover:bg-[var(--inbox-hover)] hover:text-[var(--inbox-ink)]";

const AUTOLOCK_OPTIONS = [
  { value: 0,  label: "Ўчирилган · Off" },
  { value: 5,  label: "5 дақиқа · 5 min" },
  { value: 15, label: "15 дақиқа · 15 min" },
  { value: 30, label: "30 дақиқа · 30 min" },
  { value: 60, label: "1 соат · 1 hour" },
] as const;

function Inbox() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [simOpen, setSimOpen] = useState(false);

  // Deep-link support: /inbox?c=<id> opens that conversation (e.g. the
  // "Open chat" button on a linked project/order). Read from the URL on mount —
  // client-only, so it needs no useSearchParams Suspense boundary on this page.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c");
    if (c) setActiveId(c);
  }, []);

  // ── Auto-lock ────────────────────────────────────────────────────
  const [autolockMin, setAutolockMinState] = useState<number>(() => readAutolockMin());
  function setAutolockMin(v: number) {
    setAutolockMinState(v);
    if (typeof window !== "undefined") localStorage.setItem("inbox.autolockMin", String(v));
  }

  // ── Lock mutation ────────────────────────────────────────────────
  const lock = useMutation({
    mutationFn: () => api("/api/inbox/lock", { method: "POST" }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["inbox-unlock"] }),
  });

  // Keep a stable ref so the idle effect never goes stale on re-renders.
  const lockRef = useRef(lock);
  lockRef.current = lock;

  // ── Idle timer effect ────────────────────────────────────────────
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (autolockMin === 0) return;
    const delay = autolockMin * 60_000;

    function resetTimer() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => lockRef.current.mutate(), delay);
    }

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer(); // start the initial countdown

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [autolockMin]);

  const { data } = useQuery({
    queryKey: ["inbox-conversations"],
    queryFn: () => api<{ conversations: ConversationSummary[]; counts: Record<string, number> }>("/api/inbox"),
    refetchInterval: 60_000,
  });
  const conversations = data?.conversations;

  const [channelFilter, setChannelFilter] = useState<string>("ALL");

  // Live updates: invalidate the list + the open thread on any inbox event.
  useEffect(() => {
    const es = new EventSource("/api/inbox/stream");
    es.onmessage = () => {
      qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
      qc.invalidateQueries({ queryKey: ["inbox-thread"] });
      qc.invalidateQueries({ queryKey: ["agent-proposal"] });
    };
    es.onerror = () => { /* browser auto-reconnects */ };
    return () => es.close();
  }, [qc]);

  return (
    // `inbox-campsite` scopes Inter + tabular-nums + the Campsite body scale to
    // this subtree; every child inherits it, so no other screen's type changes.
    <div className="inbox-campsite flex h-full flex-col gap-4">
      <style>{INBOX_CSS}</style>
      <div className="flex shrink-0 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <h1 className="text-[22px] font-medium leading-[1.4] text-[var(--inbox-ink)]">
            Хабарлар<span className="text-[color:var(--inbox-silver)]"> · Inbox</span>
          </h1>
          {/* Channel switcher — always visible; the conversation list filters live. */}
          <ChannelTabs channelFilter={channelFilter} onChange={setChannelFilter} counts={data?.counts ?? {}} />
        </div>
        <div className="flex items-center gap-2">
          {/* Simulate an inbound customer message (owner test tool — Plan 09
              Slice B). Runs the agent on the real webhook path with no Telegram. */}
          <Button
            variant="outline"
            size="sm"
            className={CHROME_BUTTON + " gap-1.5 px-3"}
            title="Хабарни синаб кўриш · Simulate an inbound message"
            onClick={() => setSimOpen(true)}
          >
            <FlaskConical className="h-4 w-4" />
            <span className="hidden sm:inline">Синаш · Simulate</span>
          </Button>

          {/* Settings: auto-lock timeout */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className={CHROME_BUTTON + " w-8 p-0"} title="Созламалар · Settings">
                <Clock className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Автоқулф · Auto-lock</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {AUTOLOCK_OPTIONS.map((opt) => (
                <DropdownMenuItem key={opt.value} onClick={() => setAutolockMin(opt.value)}>
                  <span className="flex flex-1 items-center justify-between">
                    {opt.label}
                    {autolockMin === opt.value && <Check className="h-4 w-4 text-[color:var(--inbox-ink)]" />}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Manual lock button */}
          <Button
            variant="outline"
            size="sm"
            className={CHROME_BUTTON + " w-8 p-0"}
            title="Қулфлаш · Lock"
            onClick={() => lock.mutate()}
            disabled={lock.isPending}
          >
            {lock.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-[var(--inbox-r-card)] border border-[color:var(--inbox-border)] bg-[var(--inbox-panel)] shadow-[var(--inbox-shadow-sm)]">
        {/* Left: conversation list */}
        <ConversationList
          conversations={conversations}
          channelFilter={channelFilter}
          activeId={activeId}
          onSelect={setActiveId}
        />

        {/* Right: thread */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          {activeId ? <Thread conversationId={activeId} onDeleted={() => setActiveId(null)} /> : <EmptyState />}
        </div>
      </div>

      {simOpen && (
        <SimulateModal
          activeId={activeId}
          onClose={() => setSimOpen(false)}
          onDone={(id) => setActiveId(id)}
        />
      )}
    </div>
  );
}
