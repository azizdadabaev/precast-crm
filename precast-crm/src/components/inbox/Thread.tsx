"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { ArrowDown, ArrowUp, Bot, Calculator, Loader2, MessageCircle, Send, Trash2 } from "lucide-react";
import { VoiceRecorder } from "@/components/inbox/VoiceRecorder";
import { AttachFileButton } from "@/components/inbox/AttachFileButton";
import { ChatAvatar } from "@/components/inbox/ChatAvatar";
import { ImageViewerProvider } from "@/components/inbox/ImageViewer";
import { formatDraftNumber } from "@/lib/draft-number";
import type { ConversationSummary, InboxMessage } from "./inbox-types";
import { WALLPAPER_PATTERN } from "./inbox-style";
import { buildRenderItems, sameDay } from "./inbox-utils";
import { AlbumBubble, Bubble, DateSeparator } from "./Bubbles";
import { GhostDraft } from "./GhostDraft";

export function EmptyState() {
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

export function Thread({ conversationId, onDeleted }: { conversationId: string; onDeleted: () => void }) {
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

  // Hand the chat back to the AI (or take it over). The only path back to
  // AI_HANDLING once a chat escalated / an order was placed.
  const aiToggle = useMutation({
    mutationFn: (handling: boolean) =>
      api(`/api/inbox/${conversationId}/ai`, { method: "POST", json: { handling } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox-thread", conversationId] });
      qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
      // The toggle clears any pending "needs attention" proposal server-side;
      // refetch so the ghost card disappears right away.
      qc.invalidateQueries({ queryKey: ["agent-proposal", conversationId] });
    },
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  // The messages scroll container — for the jump-to-start / jump-to-end FABs.
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollToTop = () => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  const scrollToBottom = () =>
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  // Position-aware FAB visibility: hide ⬆ at the very top, ⬇ at the very
  // bottom, both when there's nothing to scroll.
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(true);
  const updateScrollPos = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtTop(el.scrollTop <= 8);
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 8);
  };

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    const id = setTimeout(updateScrollPos, 120);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.messages.length]);

  // Keep the jump-arrow visibility honest. Media (voice, the location card,
  // images) loads AFTER the first render and grows the content, so a one-shot
  // check leaves the arrows stuck (both hidden). A ResizeObserver on the
  // scroller and its content recomputes on every size change; window-resize
  // and chat-switch are covered too.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollPos();
    const ro = new ResizeObserver(() => updateScrollPos());
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    window.addEventListener("resize", updateScrollPos);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateScrollPos);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

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

  // Delete a message we sent — for everyone (Telegram + CRM). Scoped to
  // OUTBOUND server-side; the trash only shows on our own bubbles.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const deleteMsg = useMutation({
    mutationFn: (messageId: string) =>
      api(`/api/inbox/${conversationId}/messages/${messageId}`, { method: "DELETE" }),
    onSuccess: () => {
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["inbox-thread", conversationId] });
      qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
    },
    onError: (err) => {
      setPendingDelete(null);
      alert(err instanceof Error ? err.message : "Delete failed");
    },
  });

  const aiOn = data?.conversation.aiState === "AI_HANDLING" && !data.conversation.aiPaused;
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
        {/* Actions: AI handoff toggle, Calculate-from-chat, then delete (two-step inline confirm) */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {!confirming && data?.conversation && (
            <button
              type="button"
              disabled={aiToggle.isPending}
              onClick={() => aiToggle.mutate(!aiOn)}
              title={aiOn ? "AI bu chatni boshqaryapti — qo'lda olish uchun bosing" : "AI ga qaytarish · Resume AI"}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors ${
                aiOn
                  ? "text-emerald-600 hover:bg-[var(--tg-list-hover)]"
                  : "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20"
              }`}
            >
              {aiToggle.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
              <span className="hidden sm:inline">{aiOn ? "AI ✓" : "Resume AI"}</span>
            </button>
          )}
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

      {/* Messages — only this area scrolls (flex-1 + min-h-0 inside the
          height-bounded pane); header, quotes strip and composer stay pinned. */}
      <div
        ref={scrollRef}
        onScroll={updateScrollPos}
        className="tg-wallpaper min-h-0 flex-1 overflow-y-auto px-4 py-4"
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
                  <Bubble msg={item.msg} groupedTop={sameAsPrev} hasTail={hasTail} onDelete={setPendingDelete} />
                ) : item.items.length === 1 ? (
                  // Lone album member — render as a normal bubble
                  <Bubble msg={item.items[0]} groupedTop={sameAsPrev} hasTail={hasTail} onDelete={setPendingDelete} />
                ) : (
                  <AlbumBubble album={item} groupedTop={sameAsPrev} hasTail={hasTail} />
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Jump to start / end — fixed over the messages, above the composer. */}
      <div className="pointer-events-none absolute bottom-[4.75rem] right-4 z-10 flex flex-col gap-2">
        {!atTop && (
          <button
            type="button"
            onClick={scrollToTop}
            title="Бошига · To start"
            aria-label="Scroll to start"
            className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-[var(--tg-panel)] text-[color:var(--tg-text-dim)] shadow-md ring-1 ring-[color:var(--tg-divider)] transition-colors hover:text-[var(--tg-accent)]"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        )}
        {!atBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            title="Охирига · To end"
            aria-label="Scroll to end"
            className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-[var(--tg-panel)] text-[color:var(--tg-text-dim)] shadow-md ring-1 ring-[color:var(--tg-divider)] transition-colors hover:text-[var(--tg-accent)]"
          >
            <ArrowDown className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* AI ghost-draft (Plan 09 Slice B) — the agent's latest proposal for this
          chat, read-only in Shadow. Send/Edit arrives with Suggest mode (Slice C). */}
      <GhostDraft conversationId={conversationId} />

      {/* Composer */}
      <form
        onSubmit={(e) => { e.preventDefault(); if (draft.trim()) reply.mutate(draft.trim()); }}
        className="relative flex shrink-0 items-end gap-2 border-t border-[color:var(--tg-divider)] bg-[var(--tg-panel)] px-4 py-2.5"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Жавоб ёзинг…"
          className="flex-1 rounded-[20px] border border-border bg-[var(--tg-input-bg)] px-4 py-2.5 text-sm text-[var(--tg-text)] outline-none transition-colors focus:border-[color:var(--tg-accent)] focus:bg-[var(--tg-panel)]"
        />
        <AttachFileButton
          conversationId={conversationId}
          onSent={() => {
            qc.invalidateQueries({ queryKey: ["inbox-thread", conversationId] });
            qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
          }}
        />
        {draft.trim() ? (
          <button
            type="submit"
            aria-label="Send"
            disabled={reply.isPending}
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-white transition-all"
            style={{ background: "var(--tg-accent)" }}
          >
            {reply.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        ) : (
          <VoiceRecorder
            conversationId={conversationId}
            onSent={() => {
              qc.invalidateQueries({ queryKey: ["inbox-thread", conversationId] });
              qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
            }}
          />
        )}
      </form>

      {pendingDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !deleteMsg.isPending && setPendingDelete(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-[var(--tg-panel)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[15px] font-semibold text-[var(--tg-text)]">
              Хабарни ўчириш · Delete message
            </div>
            <p className="mt-1.5 text-[13px] text-[color:var(--tg-text-dim)]">
              Бу хабар ҳамма учун ўчирилади, қайтариб бўлмайди · It will be deleted for everyone and can&apos;t be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleteMsg.isPending}
                onClick={() => setPendingDelete(null)}
                className="rounded-lg px-3 py-1.5 text-[13px] text-[color:var(--tg-text-dim)] transition-colors hover:bg-[var(--tg-list-hover)] disabled:opacity-60"
              >
                Бекор · Cancel
              </button>
              <button
                type="button"
                disabled={deleteMsg.isPending}
                onClick={() => deleteMsg.mutate(pendingDelete)}
                className="flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-destructive/90 disabled:opacity-60"
              >
                {deleteMsg.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Ўчириш · Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </ImageViewerProvider>
  );
}
