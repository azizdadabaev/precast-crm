"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { Loader2, Lock, Send, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MessageMedia } from "@/components/inbox/MediaRenderers";
import { ChatAvatar } from "@/components/inbox/ChatAvatar";

interface ConversationSummary {
  id: string; displayName: string; username: string | null;
  lastMessageAt: string; lastSnippet: string; unread: boolean;
}
interface InboxMessage {
  id: string; direction: "INBOUND" | "OUTBOUND"; text: string | null;
  mediaKind: string | null; mediaPath: string | null; mediaName: string | null;
  mediaMeta: Record<string, unknown> | null; failed: boolean; createdAt: string;
}

// Telegram light-theme palette.
const TG = {
  wallpaper: "#e6ebee",
  incoming: "#ffffff",
  outgoing: "#effdde",
  accent: "#3390ec",
  headerBg: "#ffffff",
  panelBg: "#ffffff",
  listSelected: "#ededed",
};

export function InboxClient() {
  const qc = useQueryClient();

  // ── Lock gate ──────────────────────────────────────────────────
  const { data: unlockState, isLoading: unlockLoading } = useQuery({
    queryKey: ["inbox-unlock"],
    queryFn: () => api<{ unlocked: boolean }>("/api/inbox/unlock"),
    retry: false,
  });

  if (unlockLoading) return <Centered><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></Centered>;
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
        className="flex w-full max-w-xs flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 shadow-sm"
      >
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: TG.accent }}
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
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-center text-sm outline-none focus:border-[#3390ec] focus:ring-1 focus:ring-[#3390ec]"
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

  const active = (conversations ?? []).find((c) => c.id === activeId) ?? null;

  return (
    <div className="flex h-full flex-col gap-3">
      <style>{TELEGRAM_CSS}</style>
      <h1 className="shrink-0 text-xl font-bold tracking-tight">Хабарлар<span className="text-muted-foreground"> · Inbox</span></h1>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border shadow-sm">
        {/* Left: conversation list */}
        <div className="flex w-[340px] shrink-0 flex-col border-r border-border bg-white">
          <div className="flex-1 overflow-y-auto">
            {(conversations ?? []).map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  activeId === c.id ? "bg-[#ededed]" : "hover:bg-[#f5f5f5]",
                )}
              >
                <ChatAvatar name={c.displayName} size={50} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[15px] font-semibold text-[#0f1419]">{c.displayName}</span>
                    <span className={cn("shrink-0 text-[12px]", c.unread ? "text-[#3390ec]" : "text-[#8696a3]")}>
                      {timeAgo(c.lastMessageAt)}
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] text-[#8696a3]">{snippet(c.lastSnippet)}</span>
                    {c.unread && (
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#3390ec]" />
                    )}
                  </span>
                </span>
              </button>
            ))}
            {conversations && conversations.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">Ҳозирча хабарлар йўқ · No messages yet</div>
            )}
          </div>
        </div>

        {/* Right: thread */}
        <div className="flex flex-1 flex-col">
          {active ? <Thread conversationId={active.id} /> : <EmptyState />}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-1 items-center justify-center"
      style={{ background: TG.wallpaper, backgroundImage: WALLPAPER_PATTERN }}
    >
      <span className="flex items-center gap-2 rounded-full bg-black/[0.07] px-4 py-2 text-[13px] font-medium text-[#4b5b67]">
        <MessageCircle className="h-4 w-4 opacity-70" />
        Суҳбатни танланг · Select a conversation
      </span>
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

  const messages = data?.messages ?? [];

  return (
    <>
      {/* Chat header */}
      <div className="flex items-center gap-3 border-b border-border bg-white px-4 py-2.5">
        <ChatAvatar name={data?.conversation.displayName ?? "?"} size={42} />
        <div className="flex min-w-0 flex-col">
          <div className="truncate text-[15px] font-semibold text-[#0f1419]">{data?.conversation.displayName}</div>
          <div className="truncate text-[13px] text-[#8696a3]">
            {data?.conversation.username ? `@${data.conversation.username}` : "online"}
          </div>
        </div>
      </div>

      {/* Messages — Telegram wallpaper */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{ background: TG.wallpaper, backgroundImage: WALLPAPER_PATTERN }}
      >
        <div className="mx-auto flex max-w-[760px] flex-col">
          {messages.map((msg, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const showDate = !prev || !sameDay(prev.createdAt, msg.createdAt);
            const sameAsPrev = !!prev && prev.direction === msg.direction && !showDate;
            const sameAsNext = !!next && next.direction === msg.direction && sameDay(msg.createdAt, next.createdAt);
            // The tail goes on the LAST bubble of a same-sender group.
            const hasTail = !sameAsNext;
            return (
              <div key={msg.id}>
                {showDate && <DateSeparator iso={msg.createdAt} />}
                <Bubble
                  msg={msg}
                  groupedTop={sameAsPrev}
                  hasTail={hasTail}
                />
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => { e.preventDefault(); if (draft.trim()) reply.mutate(draft.trim()); }}
        className="flex items-end gap-2 border-t border-border bg-white px-4 py-2.5"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Жавоб ёзинг…"
          className="flex-1 rounded-[20px] border border-border bg-[#f5f6f8] px-4 py-2.5 text-sm outline-none transition-colors focus:border-[#3390ec] focus:bg-white"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={reply.isPending || !draft.trim()}
          className={cn(
            "flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-white transition-all",
            draft.trim() ? "scale-100 opacity-100" : "scale-95 opacity-50",
          )}
          style={{ background: TG.accent }}
        >
          {reply.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </form>
    </>
  );
}

function Bubble({ msg, groupedTop, hasTail }: { msg: InboxMessage; groupedTop: boolean; hasTail: boolean }) {
  const outgoing = msg.direction === "OUTBOUND";
  // Media that fills the bubble edge-to-edge and overlays its own footer.
  const overlayMedia =
    !msg.text && (msg.mediaKind === "IMAGE" || msg.mediaKind === "VIDEO" || msg.mediaKind === "VIDEO_NOTE");

  const footer = (
    <span className={cn("flex select-none items-center gap-1 text-[11px] leading-none", overlayMedia ? "text-white" : msg.failed ? "text-destructive" : outgoing ? "text-[#5fae7e]" : "text-[#8696a3]")}>
      {clock(msg.createdAt)}
      {outgoing && !msg.failed && <SentCheck />}
      {msg.failed && <span className="font-semibold">! · юборилмади</span>}
    </span>
  );

  return (
    <div
      className={cn(
        "flex tg-msg-in",
        outgoing ? "justify-end" : "justify-start",
        groupedTop ? "mt-[2px]" : "mt-[10px]",
      )}
    >
      <div
        className={cn(
          "relative max-w-[min(82%,460px)] text-[14px] leading-[1.35] text-[#0f1419]",
          overlayMedia ? "overflow-hidden" : "px-2.5 py-1.5",
          // rounded corners — tighten the tail corner on the tailed bubble
          "rounded-[16px]",
          hasTail && (outgoing ? "rounded-br-[5px]" : "rounded-bl-[5px]"),
          msg.failed && "ring-1 ring-destructive/60",
        )}
        style={{
          background: overlayMedia ? "transparent" : outgoing ? TG.outgoing : TG.incoming,
          boxShadow: overlayMedia ? "none" : outgoing ? "0 1px 1px rgba(0,0,0,.06)" : "0 1px 2px rgba(0,0,0,.08)",
        }}
      >
        {/* Tail notch */}
        {hasTail && !overlayMedia && (
          <Tail outgoing={outgoing} color={outgoing ? TG.outgoing : TG.incoming} />
        )}

        {overlayMedia ? (
          <MessageMedia
            mediaKind={msg.mediaKind}
            mediaPath={msg.mediaPath}
            mediaName={msg.mediaName}
            mediaMeta={msg.mediaMeta}
            messageId={msg.id}
            outgoing={outgoing}
            footer={footer}
          />
        ) : msg.mediaKind ? (
          // Media (player / document / location) + optional caption, with
          // the footer on its own right-aligned line beneath.
          <div className="flex flex-col">
            <MessageMedia
              mediaKind={msg.mediaKind}
              mediaPath={msg.mediaPath}
              mediaName={msg.mediaName}
              mediaMeta={msg.mediaMeta}
              messageId={msg.id}
              outgoing={outgoing}
            />
            {msg.text && <span className="mt-1 whitespace-pre-wrap break-words">{msg.text}</span>}
            <span className="mt-1 flex justify-end">{footer}</span>
          </div>
        ) : (
          // Text-only: float the footer first so the timestamp tucks to
          // the bottom-right and the text wraps around it (Telegram style).
          <>
            <span className="float-right ml-2 mt-1 translate-y-0.5">{footer}</span>
            <span className="whitespace-pre-wrap break-words">{msg.text}</span>
          </>
        )}
      </div>
    </div>
  );
}

// The little bubble tail — a CSS triangle that bridges the tightened
// corner back to a point, matching Telegram's notch.
function Tail({ outgoing, color }: { outgoing: boolean; color: string }) {
  return (
    <span
      aria-hidden
      className="absolute bottom-0"
      style={{
        [outgoing ? "right" : "left"]: -6,
        width: 12,
        height: 16,
        background: color,
        WebkitMaskImage: outgoing ? TAIL_MASK_RIGHT : TAIL_MASK_LEFT,
        maskImage: outgoing ? TAIL_MASK_RIGHT : TAIL_MASK_LEFT,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
      } as React.CSSProperties}
    />
  );
}

// Single tick = "sent". The Telegram Bot API gives no delivery/read
// receipts for business messages, so we deliberately do NOT show the
// double-check (which means "read" in Telegram) — that would be a lie.
function SentCheck() {
  return (
    <svg width="13" height="11" viewBox="0 0 13 11" fill="none" className="inline-block" role="img" aria-label="Юборилди · Sent">
      <title>Юборилди · Sent</title>
      <path d="M1 5.8 L4.4 9 L11.5 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DateSeparator({ iso }: { iso: string }) {
  return (
    <div className="my-3 flex justify-center">
      <span className="rounded-full bg-black/[0.07] px-2.5 py-1 text-[12px] font-medium text-[#4b5b67] backdrop-blur-sm">
        {dateLabel(iso)}
      </span>
    </div>
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

function sameDay(a: string, b: string): boolean {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function dateLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (sameDay(iso, today.toISOString())) return "Bugun · Today";
  if (sameDay(iso, yesterday.toISOString())) return "Kecha · Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// Snippet hints — surface the media kind when the snippet looks empty
// or is a bare placeholder, matching Telegram's "🖼 Photo" list hints.
function snippet(s: string): string {
  return s && s.trim() ? s : "Хабар · Message";
}

/* ── Telegram chat wallpaper ──────────────────────────────────────────
   A faint repeating doodle over a soft blue-gray base. The pattern is a
   low-opacity inline SVG data-URI so bubbles always pop above it. */
const WALLPAPER_SVG = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'>
    <g fill='none' stroke='#9fb0bd' stroke-width='2' stroke-linecap='round' opacity='0.18'>
      <circle cx='24' cy='24' r='9'/>
      <path d='M70 18 q10 8 0 18 q-10 8 0 18'/>
      <path d='M96 70 l8 8 m0 -8 l-8 8'/>
      <circle cx='30' cy='90' r='6'/>
      <path d='M58 78 h20 m-10 -10 v20'/>
      <path d='M10 60 q12 -10 24 0 t24 0'/>
      <rect x='86' y='14' width='16' height='16' rx='4'/>
    </g>
  </svg>`,
);
const WALLPAPER_PATTERN = `url("data:image/svg+xml,${WALLPAPER_SVG}")`;

/* ── Bubble tail masks (SVG shapes carving the notch) ─────────────── */
const TAIL_RIGHT_SVG = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='12' height='16' viewBox='0 0 12 16'><path d='M0 0 C0 8 0 12 8 16 C2 16 0 14 0 10 Z' fill='black'/></svg>`,
);
const TAIL_LEFT_SVG = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='12' height='16' viewBox='0 0 12 16'><path d='M12 0 C12 8 12 12 4 16 C10 16 12 14 12 10 Z' fill='black'/></svg>`,
);
const TAIL_MASK_RIGHT = `url("data:image/svg+xml,${TAIL_RIGHT_SVG}")`;
const TAIL_MASK_LEFT = `url("data:image/svg+xml,${TAIL_LEFT_SVG}")`;

/* ── Message entrance animation ───────────────────────────────────── */
const TELEGRAM_CSS = `
@keyframes tg-pop {
  from { opacity: 0; transform: translateY(6px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.tg-msg-in { animation: tg-pop 180ms cubic-bezier(0.22, 1, 0.36, 1); }
@media (prefers-reduced-motion: reduce) { .tg-msg-in { animation: none; } }
`;
