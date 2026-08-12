"use client";

import { useState } from "react";
import { MessageCircle, Search, Send, X, Instagram as InstagramIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatAvatar } from "@/components/inbox/ChatAvatar";
import { matchesSearch } from "@/lib/search-fold";
import type { ConversationSummary } from "./inbox-types";
import { snippet, timeAgo } from "./inbox-utils";

// Channel chrome for the multi-channel inbox (Telegram today, Instagram now,
// WhatsApp later). Tabs appear automatically for any channel present in the list.
// Icons are monochrome: Campsite spends colour on meaning (resolved / alert /
// highlight) only, so the channel is carried by the glyph, not a brand hue.
const CHANNEL_META: Record<string, { label: string; icon: LucideIcon }> = {
  TELEGRAM:  { label: "Telegram",  icon: Send },
  INSTAGRAM: { label: "Instagram", icon: InstagramIcon },
  WHATSAPP:  { label: "WhatsApp",  icon: MessageCircle },
};

// Multi-channel switcher (header). Telegram + Instagram always offered; any
// future channel (WhatsApp…) joins automatically once it has conversations.
// Legacy rows default to TELEGRAM. Counts are REAL DB totals (server groupBy),
// not the length of the capped list — so they don't stall at 99 past 100 chats.
export function ChannelTabs({
  channelFilter,
  onChange,
  counts,
}: {
  channelFilter: string;
  onChange: (channel: string) => void;
  counts: Record<string, number>;
}) {
  const channelCounts: Record<string, number> = counts;
  const channelTabs = Array.from(new Set(["TELEGRAM", "INSTAGRAM", ...Object.keys(channelCounts)]));
  return (
    <div className="flex items-center gap-1 rounded-[var(--inbox-r-pill)] border border-[color:var(--inbox-border)] bg-[var(--inbox-surface-2)] p-1">
      <button
        type="button"
        onClick={() => onChange("ALL")}
        className={cn(
          "rounded-[var(--inbox-r-pill)] px-3 py-1 text-[13px] font-medium transition-colors",
          channelFilter === "ALL"
            ? "bg-[var(--inbox-panel)] text-[var(--inbox-ink)] shadow-[var(--inbox-shadow-sm)]"
            : "text-[color:var(--inbox-steel)] hover:text-[var(--inbox-ink)]",
        )}
      >
        Ҳаммаси
      </button>
      {channelTabs.map((ch) => {
        const meta = CHANNEL_META[ch];
        const Icon = meta?.icon ?? MessageCircle;
        const count = channelCounts[ch] ?? 0;
        return (
          <button
            key={ch}
            type="button"
            onClick={() => onChange(ch)}
            className={cn(
              "flex items-center gap-1.5 rounded-[var(--inbox-r-pill)] px-3 py-1 text-[13px] font-medium transition-colors",
              channelFilter === ch
                ? "bg-[var(--inbox-panel)] text-[var(--inbox-ink)] shadow-[var(--inbox-shadow-sm)]"
                : "text-[color:var(--inbox-steel)] hover:text-[var(--inbox-ink)]",
            )}
          >
            <Icon className="h-4 w-4" />
            {meta?.label ?? ch}
            <span className="tabular-nums text-[11px] text-[color:var(--inbox-silver)]">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ConversationList({
  conversations,
  channelFilter,
  activeId,
  onSelect,
}: {
  conversations: ConversationSummary[] | undefined;
  channelFilter: string;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const [convSearch, setConvSearch] = useState("");
  // Channel tab + a script-insensitive (Cyrillic/Latin) search across name,
  // username and last snippet — the same cross-alphabet matching as addresses.
  const visibleConversations = (conversations ?? []).filter(
    (c) =>
      (channelFilter === "ALL" || (c.channel ?? "TELEGRAM") === channelFilter) &&
      matchesSearch(`${c.displayName} ${c.username ?? ""} ${c.lastSnippet ?? ""}`, convSearch),
  );

  return (
    <div className="flex w-[340px] shrink-0 flex-col border-r border-[color:var(--inbox-border)] bg-[var(--inbox-panel)]">
      {/* Search — script-insensitive (Cyrillic/Latin) over name + snippet. */}
      <div className="relative shrink-0 border-b border-[color:var(--inbox-border)] p-2">
        <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--inbox-steel)]" />
        <input
          value={convSearch}
          onChange={(e) => setConvSearch(e.target.value)}
          placeholder="Қидириш · Search"
          className="w-full rounded-[var(--inbox-r-input)] border border-[color:var(--inbox-border)] bg-[var(--inbox-input-bg)] py-2 pl-10 pr-9 text-[15px] text-[var(--inbox-ink)] outline-none transition-colors placeholder:text-[color:var(--inbox-silver)] focus:border-[color:var(--inbox-steel)] focus:bg-[var(--inbox-panel)]"
        />
        {convSearch && (
          <button
            type="button"
            onClick={() => setConvSearch("")}
            title="Тозалаш · Clear"
            className="absolute right-5 top-1/2 -translate-y-1/2 text-[color:var(--inbox-steel)] transition-colors hover:text-[var(--inbox-ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {visibleConversations.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
              activeId === c.id ? "bg-[var(--inbox-selected)]" : "hover:bg-[var(--inbox-hover)]",
            )}
          >
            <ChatAvatar name={c.displayName} size={44} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  {(() => {
                    const meta = CHANNEL_META[c.channel ?? "TELEGRAM"];
                    const Icon = meta?.icon ?? MessageCircle;
                    return <Icon className="h-4 w-4 shrink-0 text-[color:var(--inbox-steel)]" aria-label={meta?.label} />;
                  })()}
                  <span className="truncate text-[15px] font-medium leading-[1.4] text-[var(--inbox-ink)]">{c.displayName}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[11px] leading-[1.4] tabular-nums",
                    c.unread ? "font-medium text-[color:var(--inbox-ink)]" : "text-[color:var(--inbox-silver)]",
                  )}
                >
                  {timeAgo(c.lastMessageAt)}
                </span>
              </span>
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] leading-[1.4] text-[color:var(--inbox-steel)]">{snippet(c.lastSnippet)}</span>
                {/* Unread is a state, not a category — it reads as Ink, never a hue. */}
                {c.unread && (
                  <span className="h-2 w-2 shrink-0 rounded-[var(--inbox-r-pill)] bg-[var(--inbox-ink)]" />
                )}
              </span>
            </span>
          </button>
        ))}
        {conversations && visibleConversations.length === 0 && (
          <div className="p-6 text-center text-[13px] text-[color:var(--inbox-steel)]">
            {convSearch.trim()
              ? "Қидирув бўйича натижа йўқ · No matches"
              : channelFilter === "ALL"
                ? "Ҳозирча хабарлар йўқ · No messages yet"
                : `Бу каналда ҳозирча суҳбат йўқ · No ${CHANNEL_META[channelFilter]?.label ?? channelFilter} conversations yet`}
          </div>
        )}
      </div>
    </div>
  );
}
