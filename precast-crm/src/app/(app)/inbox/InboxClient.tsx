"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { Check, Clock, Loader2, Lock, Send, MessageCircle, Trash2, Calculator, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MessageMedia } from "@/components/inbox/MediaRenderers";
import { ChatAvatar } from "@/components/inbox/ChatAvatar";
import { ImageViewerProvider, useImageViewer } from "@/components/inbox/ImageViewer";
import { formatDraftNumber } from "@/lib/draft-number";

interface ConversationSummary {
  id: string; displayName: string; username: string | null;
  lastMessageAt: string; lastSnippet: string; unread: boolean;
}
interface InboxMessage {
  id: string; direction: "INBOUND" | "OUTBOUND"; text: string | null;
  mediaKind: string | null; mediaPath: string | null; mediaName: string | null;
  mediaMeta: Record<string, unknown> | null; failed: boolean; createdAt: string;
  mediaGroupId: string | null;
}

type RenderItem =
  | { type: "single"; msg: InboxMessage }
  | { type: "album"; groupId: string; direction: "INBOUND" | "OUTBOUND"; items: InboxMessage[] };

function buildRenderItems(messages: InboxMessage[]): RenderItem[] {
  const renderItems: RenderItem[] = [];
  for (const msg of messages) {
    const gid = msg.mediaGroupId;
    const isAlbumable = gid && (msg.mediaKind === "IMAGE" || msg.mediaKind === "VIDEO");
    const last = renderItems[renderItems.length - 1];
    if (isAlbumable && last && last.type === "album" && last.groupId === gid && last.direction === msg.direction) {
      last.items.push(msg);
    } else if (isAlbumable) {
      renderItems.push({ type: "album", groupId: gid!, direction: msg.direction, items: [msg] });
    } else {
      renderItems.push({ type: "single", msg });
    }
  }
  return renderItems;
}

// Telegram theme colors are expressed as CSS variables (defined in globals.css)
// so they flip automatically with the app's dark mode. Use CSS var() strings
// in inline styles and Tailwind arbitrary-value classes.
const TG = {
  wallpaper: "var(--tg-wallpaper)",
  incoming: "var(--tg-bubble-in)",
  outgoing: "var(--tg-bubble-out)",
  accent: "var(--tg-accent)",
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

const AUTOLOCK_OPTIONS = [
  { value: 0,  label: "Ўчирилган · Off" },
  { value: 5,  label: "5 дақиқа · 5 min" },
  { value: 15, label: "15 дақиқа · 15 min" },
  { value: 30, label: "30 дақиқа · 30 min" },
  { value: 60, label: "1 соат · 1 hour" },
] as const;

function readAutolockMin(): number {
  if (typeof window === "undefined") return 15;
  const raw = localStorage.getItem("inbox.autolockMin");
  const parsed = parseInt(raw ?? "", 10);
  const valid = [0, 5, 15, 30, 60];
  return valid.includes(parsed) ? parsed : 15;
}

function Inbox() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);

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
    <div className="flex h-full flex-col gap-3">
      <style>{TELEGRAM_CSS}</style>
      <div className="flex shrink-0 items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">Хабарлар<span className="text-muted-foreground"> · Inbox</span></h1>
        <div className="flex items-center gap-1.5">
          {/* Settings: auto-lock timeout */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Созламалар · Settings">
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
                    {autolockMin === opt.value && <Check className="h-3.5 w-3.5 text-[color:var(--tg-accent)]" />}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Manual lock button */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            title="Қулфлаш · Lock"
            onClick={() => lock.mutate()}
            disabled={lock.isPending}
          >
            {lock.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border shadow-sm">
        {/* Left: conversation list */}
        <div className="flex w-[340px] shrink-0 flex-col border-r border-[color:var(--tg-divider)] bg-[var(--tg-panel)]">
          <div className="flex-1 overflow-y-auto">
            {(conversations ?? []).map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  activeId === c.id ? "bg-[var(--tg-list-selected)]" : "hover:bg-[var(--tg-list-hover)]",
                )}
              >
                <ChatAvatar name={c.displayName} size={50} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[15px] font-semibold text-[var(--tg-text)]">{c.displayName}</span>
                    <span className={cn("shrink-0 text-[12px]", c.unread ? "text-[color:var(--tg-accent)]" : "text-[color:var(--tg-text-dim)]")}>
                      {timeAgo(c.lastMessageAt)}
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] text-[color:var(--tg-text-dim)]">{snippet(c.lastSnippet)}</span>
                    {c.unread && (
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--tg-accent)]" />
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
        <div className="flex min-h-0 flex-1 flex-col">
          {activeId ? <Thread conversationId={activeId} onDeleted={() => setActiveId(null)} /> : <EmptyState />}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="tg-wallpaper flex flex-1 items-center justify-center"
      style={{ backgroundColor: "var(--tg-wallpaper)", backgroundImage: WALLPAPER_PATTERN }}
    >
      <span className="flex items-center gap-2 rounded-full bg-[var(--tg-pill-bg)] px-4 py-2 text-[13px] font-medium text-[color:var(--tg-pill-text)]">
        <MessageCircle className="h-4 w-4 opacity-70" />
        Суҳбатни танланг · Select a conversation
      </span>
    </div>
  );
}

function Thread({ conversationId, onDeleted }: { conversationId: string; onDeleted: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState(false);

  const del = useMutation({
    mutationFn: () => api(`/api/inbox/${conversationId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
      onDeleted();
    },
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  // The messages scroll container — for the jump-to-start / jump-to-end FABs.
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollToTop = () => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  const scrollToBottom = () =>
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });

  const { data } = useQuery({
    queryKey: ["inbox-thread", conversationId],
    queryFn: () => api<{ conversation: ConversationSummary; messages: InboxMessage[] }>(`/api/inbox/${conversationId}`),
  });

  // Quotes (Projects) calculated from this chat — the chat→quotes back-link.
  const { data: linkedQuotes } = useQuery({
    queryKey: ["inbox-quotes", conversationId],
    queryFn: () =>
      api<
        Array<{
          id: string;
          draftNumber: number | null;
          status: string;
          name: string | null;
          order: { id: string; orderNumber: string } | null;
        }>
      >(`/api/inbox/${conversationId}/projects`),
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
  const renderItems = buildRenderItems(messages);

  const threadImages = messages
    .filter((m) => m.mediaKind === "IMAGE" && m.mediaPath)
    .map((m) => m.mediaPath as string);

  return (
    <ImageViewerProvider images={threadImages}>
      {/* Chat header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[color:var(--tg-divider)] bg-[var(--tg-panel)] px-4 py-2.5">
        <ChatAvatar name={data?.conversation.displayName ?? "?"} size={42} />
        <div className="flex min-w-0 flex-col">
          <div className="truncate text-[15px] font-semibold text-[var(--tg-text)]">{data?.conversation.displayName}</div>
          <div className="truncate text-[13px] text-[color:var(--tg-text-dim)]">
            {data?.conversation.username ? `@${data.conversation.username}` : "online"}
          </div>
        </div>
        {/* Actions: Calculate-from-chat, then delete (two-step inline confirm) */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {!confirming && (
            <button
              type="button"
              onClick={() => router.push(`/calculations?fromConversation=${conversationId}`)}
              title="Бу чатдан ҳисоблаш · Calculate from this chat"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium text-[color:var(--tg-text-dim)] transition-colors hover:bg-[var(--tg-list-hover)] hover:text-[var(--tg-accent)]"
            >
              <Calculator className="h-4 w-4" />
              <span className="hidden sm:inline">Ҳисоблаш · Calculate</span>
            </button>
          )}
          {confirming ? (
            <>
              <span className="text-[13px] text-[color:var(--tg-text-dim)]">
                Ўчирилсинми? · Delete?
              </span>
              <button
                type="button"
                onClick={() => del.mutate()}
                disabled={del.isPending}
                className="flex items-center gap-1 rounded-md bg-destructive/10 px-2.5 py-1 text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-60"
              >
                {del.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Ҳа · Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={del.isPending}
                className="rounded-md px-2.5 py-1 text-[13px] text-[color:var(--tg-text-dim)] transition-colors hover:bg-[var(--tg-list-hover)] disabled:opacity-60"
              >
                Йўқ · No
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              title="Суҳбатни ўчириш · Delete chat"
              className="rounded-md p-1.5 text-[color:var(--tg-text-dim)] transition-colors hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Quotes calculated from this chat — links back to /projects. */}
      {linkedQuotes && linkedQuotes.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[color:var(--tg-divider)] bg-[var(--tg-panel)] px-4 py-1.5 text-[12px]">
          <span className="text-[color:var(--tg-text-dim)]">Бу чатдан · Quotes:</span>
          {linkedQuotes.map((q) => {
            // Ordered → order id, opens the Orders page. Still a draft → draft
            // id, opens the Projects page. Always a CRM-assigned unique id.
            const ordered = q.status === "ORDERED" && q.order;
            const href = ordered ? `/orders/${q.order!.id}` : `/projects/${q.id}`;
            const label = ordered
              ? q.order!.orderNumber
              : q.draftNumber
                ? formatDraftNumber(q.draftNumber)
                : q.id.slice(-5);
            return (
              <a
                key={q.id}
                href={href}
                className="rounded-full bg-[var(--tg-list-hover)] px-2 py-0.5 font-medium text-[var(--tg-accent)] hover:underline"
              >
                {label}
              </a>
            );
          })}
        </div>
      )}

      {/* Messages — Telegram wallpaper. Only this area scrolls; the header +
          quotes strip stay pinned (shrink-0 + the pane's min-h-0). */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          className="tg-wallpaper h-full overflow-y-auto px-4 py-4"
          style={{ backgroundColor: "var(--tg-wallpaper)", backgroundImage: WALLPAPER_PATTERN }}
        >
          <div className="flex flex-col">
          {renderItems.map((item, i) => {
            const prevItem = renderItems[i - 1];
            const nextItem = renderItems[i + 1];
            // Representative time and direction for this render item.
            const itemTime = item.type === "single" ? item.msg.createdAt : item.items[0].createdAt;
            const itemDir = item.type === "single" ? item.msg.direction : item.direction;
            const prevTime = prevItem ? (prevItem.type === "single" ? prevItem.msg.createdAt : prevItem.items[0].createdAt) : null;
            const nextTime = nextItem ? (nextItem.type === "single" ? nextItem.msg.createdAt : nextItem.items[0].createdAt) : null;
            const nextDir = nextItem ? (nextItem.type === "single" ? nextItem.msg.direction : nextItem.direction) : null;
            const showDate = !prevTime || !sameDay(prevTime, itemTime);
            const sameAsPrev = !!prevTime && prevItem!.type !== undefined &&
              (prevItem!.type === "single" ? prevItem!.msg.direction : prevItem!.direction) === itemDir &&
              !showDate;
            const sameAsNext = !!nextTime && nextDir === itemDir && sameDay(itemTime, nextTime);
            const hasTail = !sameAsNext;
            const key = item.type === "single" ? item.msg.id : item.groupId;
            return (
              <div key={key}>
                {showDate && <DateSeparator iso={itemTime} />}
                {item.type === "single" ? (
                  <Bubble msg={item.msg} groupedTop={sameAsPrev} hasTail={hasTail} />
                ) : item.items.length === 1 ? (
                  // Lone album member — render as a normal bubble
                  <Bubble msg={item.items[0]} groupedTop={sameAsPrev} hasTail={hasTail} />
                ) : (
                  <AlbumBubble album={item} groupedTop={sameAsPrev} hasTail={hasTail} />
                )}
              </div>
            );
          })}
            <div ref={bottomRef} />
          </div>
        </div>
        {/* Jump to start / end of the conversation (Telegram-style). */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={scrollToTop}
            title="Бошига · To start"
            aria-label="Scroll to start"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--tg-panel)] text-[color:var(--tg-text-dim)] shadow-md ring-1 ring-[color:var(--tg-divider)] transition-colors hover:text-[var(--tg-accent)]"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={scrollToBottom}
            title="Охирига · To end"
            aria-label="Scroll to end"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--tg-panel)] text-[color:var(--tg-text-dim)] shadow-md ring-1 ring-[color:var(--tg-divider)] transition-colors hover:text-[var(--tg-accent)]"
          >
            <ArrowDown className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => { e.preventDefault(); if (draft.trim()) reply.mutate(draft.trim()); }}
        className="flex shrink-0 items-end gap-2 border-t border-[color:var(--tg-divider)] bg-[var(--tg-panel)] px-4 py-2.5"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Жавоб ёзинг…"
          className="flex-1 rounded-[20px] border border-border bg-[var(--tg-input-bg)] px-4 py-2.5 text-sm text-[var(--tg-text)] outline-none transition-colors focus:border-[color:var(--tg-accent)] focus:bg-[var(--tg-panel)]"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={reply.isPending || !draft.trim()}
          className={cn(
            "flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-white transition-all",
            draft.trim() ? "scale-100 opacity-100" : "scale-95 opacity-50",
          )}
          style={{ background: "var(--tg-accent)" }}
        >
          {reply.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </form>
    </ImageViewerProvider>
  );
}

function Bubble({ msg, groupedTop, hasTail }: { msg: InboxMessage; groupedTop: boolean; hasTail: boolean }) {
  const outgoing = msg.direction === "OUTBOUND";
  // Media that fills the bubble edge-to-edge and overlays its own footer.
  const overlayMedia =
    !msg.text && (msg.mediaKind === "IMAGE" || msg.mediaKind === "VIDEO" || msg.mediaKind === "VIDEO_NOTE");

  const footer = (
    <span
      className={cn("flex select-none items-center gap-1 text-[11px] leading-none", overlayMedia ? "text-white" : msg.failed ? "text-destructive" : "")}
      style={overlayMedia || msg.failed ? undefined : { color: outgoing ? "var(--tg-meta-out)" : "var(--tg-text-dim)" }}
    >
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
          "relative max-w-[min(72%,600px)] text-[14px] leading-[1.35] text-[var(--tg-text)]",
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

function AlbumBubble({
  album,
  groupedTop,
  hasTail,
}: {
  album: Extract<RenderItem, { type: "album" }>;
  groupedTop: boolean;
  hasTail: boolean;
}) {
  const openViewer = useImageViewer();
  const outgoing = album.direction === "OUTBOUND";
  const items = album.items;
  const cols = items.length >= 5 ? 3 : 2;
  const gridClass = cols === 3 ? "grid-cols-3" : "grid-cols-2";
  // Use caption from any item that has text (first found).
  const caption = items.find((m) => m.text)?.text ?? null;
  // Footer timestamp from the last message in the album.
  const lastCreatedAt = items[items.length - 1].createdAt;

  const footer = (
    <span
      className="flex select-none items-center gap-1 text-[11px] leading-none text-white"
    >
      {clock(lastCreatedAt)}
      {outgoing && <SentCheck />}
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
          "relative overflow-hidden rounded-[14px]",
          hasTail && (outgoing ? "rounded-br-[5px]" : "rounded-bl-[5px]"),
        )}
        style={{
          width: 300,
          boxShadow: outgoing ? "0 1px 1px rgba(0,0,0,.06)" : "0 1px 2px rgba(0,0,0,.08)",
        }}
      >
        {/* Tail notch on the album bubble */}
        {hasTail && (
          <Tail outgoing={outgoing} color={outgoing ? TG.outgoing : TG.incoming} />
        )}

        {/* Image grid */}
        <div className={cn("grid gap-[2px]", gridClass)}>
          {items.map((item) => {
            const meta = item.mediaMeta ?? {};
            if (meta.unavailable || meta.oversize || !item.mediaPath) {
              return (
                <div
                  key={item.id}
                  className="aspect-square w-full bg-[color:var(--tg-divider)]"
                />
              );
            }
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openViewer(item.mediaPath!)}
                className="block w-full"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.mediaPath}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
              </button>
            );
          })}
        </div>

        {/* Caption + footer */}
        {(caption || true) && (
          <div
            className="flex flex-col px-2.5 py-1.5"
            style={{ background: outgoing ? TG.outgoing : TG.incoming }}
          >
            {caption && (
              <span className="whitespace-pre-wrap break-words text-[14px] leading-[1.35] text-[var(--tg-text)]">
                {caption}
              </span>
            )}
            {/* Scrim footer over the last image row */}
            <span className="mt-0.5 flex justify-end">{footer}</span>
          </div>
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
      <span className="rounded-full px-2.5 py-1 text-[12px] font-medium backdrop-blur-sm" style={{ background: "var(--tg-pill-bg)", color: "var(--tg-pill-text)" }}>
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
