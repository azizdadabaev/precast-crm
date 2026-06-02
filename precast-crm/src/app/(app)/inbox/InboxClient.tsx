"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { Loader2, Lock, Send, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MessageMedia } from "@/components/inbox/MediaRenderers";

interface ConversationSummary {
  id: string; displayName: string; username: string | null;
  lastMessageAt: string; lastSnippet: string; unread: boolean;
}
interface InboxMessage {
  id: string; direction: "INBOUND" | "OUTBOUND"; text: string | null;
  mediaKind: string | null; mediaPath: string | null; mediaName: string | null;
  mediaMeta: Record<string, unknown> | null; failed: boolean; createdAt: string;
}

export function InboxClient() {
  const qc = useQueryClient();

  // ── Lock gate ──────────────────────────────────────────────────
  const { data: unlockState, isLoading: unlockLoading } = useQuery({
    queryKey: ["inbox-unlock"],
    queryFn: () => api<{ unlocked: boolean }>("/api/inbox/unlock"),
    retry: false,
  });

  if (unlockLoading) return <Centered><Loader2 className="h-5 w-5 animate-spin" /></Centered>;
  if (!unlockState?.unlocked) return <LockScreen onUnlocked={() => qc.invalidateQueries({ queryKey: ["inbox-unlock"] })} />;

  return <Inbox />;
}

function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
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
        className="flex w-full max-w-xs flex-col gap-3 rounded-xl border border-border p-6"
      >
        <div className="flex items-center gap-2 font-semibold"><Lock className="h-4 w-4" /> Хабарлар қулфланган</div>
        <p className="text-xs text-muted-foreground">Кириш учун паролни киритинг · Enter the password to open the inbox.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="••••••••"
        />
        {error && <span className="text-xs text-destructive">{error}</span>}
        <Button type="submit" size="sm" disabled={m.isPending || !password}>
          {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Очиш · Unlock"}
        </Button>
      </form>
    </Centered>
  );
}

function Inbox() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: conversations } = useQuery({
    queryKey: ["inbox-conversations"],
    queryFn: () => api<ConversationSummary[]>("/api/inbox"),
    refetchInterval: 60_000,
  });

  // Live updates: invalidate the list + the open thread on any inbox event.
  useEffect(() => {
    const es = new EventSource("/api/inbox/stream");
    es.onmessage = () => {
      qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
      qc.invalidateQueries({ queryKey: ["inbox-thread"] });
    };
    es.onerror = () => { /* browser auto-reconnects */ };
    return () => es.close();
  }, [qc]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold tracking-tight">Хабарлар<span className="text-muted-foreground"> · Inbox</span></h1>
      <div className="flex h-[calc(100vh-180px)] overflow-hidden rounded-xl border border-border">
        {/* Left: conversation list */}
        <div className="w-[320px] shrink-0 overflow-y-auto border-r border-border">
          {(conversations ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={cn(
                "flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left hover:bg-muted",
                activeId === c.id && "bg-muted",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-medium">
                  {c.unread && <span className="h-2 w-2 rounded-full bg-primary" />}
                  {c.displayName}
                </span>
                <span className="text-[10px] text-muted-foreground">{timeAgo(c.lastMessageAt)}</span>
              </div>
              <span className="truncate text-xs text-muted-foreground">{c.lastSnippet}</span>
            </button>
          ))}
          {conversations && conversations.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">Ҳозирча хабарлар йўқ · No messages yet</div>
          )}
        </div>

        {/* Right: thread */}
        <div className="flex flex-1 flex-col">
          {activeId ? <Thread conversationId={activeId} /> : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              <span className="flex flex-col items-center gap-2"><MessageCircle className="h-6 w-6" /> Суҳбатни танланг · Select a conversation</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Thread({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["inbox-thread", conversationId],
    queryFn: () => api<{ conversation: ConversationSummary; messages: InboxMessage[] }>(`/api/inbox/${conversationId}`),
  });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [data?.messages.length]);

  const reply = useMutation({
    mutationFn: (text: string) => api(`/api/inbox/${conversationId}/reply`, { method: "POST", json: { text } }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["inbox-thread", conversationId] });
      qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
    },
    onError: () => {
      // A 502 means the send failed but the server still persisted a
      // failed bubble. Refetch immediately so the red retry bubble shows
      // without waiting for the SSE round-trip. Keep the draft so the
      // operator can resend.
      qc.invalidateQueries({ queryKey: ["inbox-thread", conversationId] });
    },
  });

  return (
    <>
      <div className="border-b border-border px-4 py-3">
        <div className="font-semibold">{data?.conversation.displayName}</div>
        {data?.conversation.username && <div className="text-xs text-muted-foreground">@{data.conversation.username}</div>}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {(data?.messages ?? []).map((msg) => (
          <div key={msg.id} className={cn("flex", msg.direction === "OUTBOUND" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[70%] rounded-2xl px-3 py-2 text-sm",
              msg.direction === "OUTBOUND" ? "bg-primary text-primary-foreground" : "bg-muted",
              msg.failed && "border border-destructive",
            )}>
              <MessageMedia mediaKind={msg.mediaKind} mediaPath={msg.mediaPath} mediaName={msg.mediaName} mediaMeta={msg.mediaMeta} />
              {msg.text && <div className={cn(msg.mediaKind && "mt-1")}>{msg.text}</div>}
              <div className="mt-0.5 flex items-center gap-1 text-[10px] opacity-60">
                {clock(msg.createdAt)}
                {msg.failed && <span className="text-destructive">· юборилмади</span>}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); if (draft.trim()) reply.mutate(draft.trim()); }}
        className="flex items-center gap-2 border-t border-border p-3"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Жавоб ёзинг…"
          className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm"
        />
        <Button type="submit" size="sm" disabled={reply.isPending || !draft.trim()}>
          {reply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-[60vh] items-center justify-center">{children}</div>;
}
function clock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
