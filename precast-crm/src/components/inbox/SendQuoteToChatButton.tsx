"use client";

import { useState, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Loader2, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/fetcher";
import { ChatAvatar } from "@/components/inbox/ChatAvatar";
import { matchesSearch } from "@/lib/search-fold";
import { useT } from "@/lib/i18n";

type Conversation = {
  id: string;
  displayName: string;
  username: string | null;
  lastSnippet: string;
  lastMessageAt: string;
  unread: boolean;
};

/**
 * Render the quote summary (a shared DOM region) to a PNG and send it into a
 * Telegram chat via /api/inbox/[id]/reply-photo.
 *
 * If `conversationId` is set (the project/order is chat-linked) it sends there
 * directly. Otherwise it opens a picker listing all inbox conversations so the
 * operator can choose where to send. Shown only to inbox.access users; the
 * endpoint enforces inbox.access server-side regardless.
 */
export function SendQuoteToChatButton({
  targetRef,
  conversationId,
  fileBase,
  caption,
  onSent,
  disabled = false,
}: {
  targetRef: RefObject<HTMLElement>;
  /** When set, send straight to this chat; when null/undefined, open the picker. */
  conversationId?: string | null;
  fileBase: string;
  caption?: string;
  /** Called with the destination id after a successful send (e.g. to link the
   *  order/project to a chat picked from the dialog). */
  onSent?: (conversationId: string) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [state, setState] = useState<null | "sending" | "sent">(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Set when the picker is opened because the linked chat was unreachable
  // (vs. opened manually for an unlinked draft) — shown atop the picker.
  const [pickerNotice, setPickerNotice] = useState<string | null>(null);

  async function renderBlob(): Promise<Blob> {
    const node = targetRef.current;
    if (!node) throw new Error(t("Расм яратилмади", "Could not render the image"));
    const dims = {
      width: Math.max(node.scrollWidth, node.offsetWidth),
      height: Math.max(node.scrollHeight, node.offsetHeight),
    };
    const baseOpts = { backgroundColor: "#ffffff", pixelRatio: 3, cacheBust: true };
    const { toBlob } = await import("html-to-image");
    await toBlob(node, { ...baseOpts, ...dims }).catch(() => {}); // warm html-to-image's resource cache
    const blob = await toBlob(node, { ...baseOpts, ...dims });
    if (!blob) throw new Error(t("Расм яратилмади", "Could not render the image"));
    return blob;
  }

  async function sendTo(convId: string) {
    setState("sending");
    try {
      const blob = await renderBlob();
      const form = new FormData();
      form.append("photo", blob, `${fileBase}.png`);
      form.append("caption", caption || fileBase);
      const res = await fetch(`/api/inbox/${convId}/reply-photo`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const text = await res.text();
      const payload = text ? JSON.parse(text) : {};
      if (!res.ok || payload?.ok === false) {
        // The destination chat is unreachable (link lost / blocked). Don't
        // dead-end on an alert — open the picker so the operator can re-target.
        if (payload?.details?.peerInvalid === true) {
          setState(null);
          setPickerNotice(
            t(
              "Боғланган чат топилмади. Бошқа чат танланг:",
              "The linked chat is unreachable. Pick another chat:",
            ),
          );
          setPickerOpen(true);
          return;
        }
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }
      setState("sent");
      setPickerOpen(false);
      setPickerNotice(null);
      onSent?.(convId);
      setTimeout(() => setState(null), 2500);
    } catch (err) {
      setState(null);
      alert(
        `${t("Чатга юбориб бўлмади", "Couldn't send to chat")}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || state === "sending"}
        onClick={() =>
          conversationId
            ? void sendTo(conversationId)
            : (setPickerNotice(null), setPickerOpen(true))
        }
        title={t("Хулосани мижоз чатига расм сифатида юбориш", "Send the summary as an image to a chat")}
      >
        {state === "sending" ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : state === "sent" ? (
          <Check className="h-4 w-4 mr-2 text-success" />
        ) : (
          <MessageCircle className="h-4 w-4 mr-2" />
        )}
        {state === "sent" ? t("Юборилди", "Sent") : t("Чатга юбориш", "Send to chat")}
      </Button>

      {pickerOpen && (
        <ChatPickerDialog
          sending={state === "sending"}
          notice={pickerNotice}
          onPick={(id) => void sendTo(id)}
          onClose={() => {
            setPickerOpen(false);
            setPickerNotice(null);
          }}
        />
      )}
    </>
  );
}

/** Reusable: lists all inbox conversations so the operator can pick a send
 *  target. Used by the quote-image and drawing-PDF send buttons. */
export function ChatPickerDialog({
  sending,
  notice,
  onPick,
  onClose,
}: {
  sending: boolean;
  /** Optional banner shown above the list, e.g. why the picker auto-opened. */
  notice?: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const { data, isLoading } = useQuery<{ conversations: Conversation[]; counts: Record<string, number> }>({
    queryKey: ["inbox-conversations"],
    queryFn: () => api("/api/inbox"),
  });
  const chats = data?.conversations;
  // Script-insensitive (Cyrillic/Latin) substring search across name, username
  // and last snippet — same cross-alphabet behaviour as the address search.
  const filtered = chats?.filter((c) =>
    matchesSearch(`${c.displayName} ${c.username ?? ""} ${c.lastSnippet ?? ""}`, query),
  );

  return (
    <Dialog open onOpenChange={(v) => !v && !sending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Қайси чатга юборилсин?", "Send to which chat?")}</DialogTitle>
        </DialogHeader>
        {notice && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {notice}
          </div>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Чат қидириш…", "Search chats…")}
            className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm outline-none focus:border-ring"
          />
        </div>
        <div className="-mx-2 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {t("Юкланмоқда…", "Loading…")}
            </div>
          ) : !chats || chats.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {t("Чатлар йўқ", "No chats yet")}
            </div>
          ) : !filtered || filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {t("Натижа йўқ", "No matches")}
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={sending}
                onClick={() => onPick(c.id)}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted disabled:opacity-60"
              >
                <ChatAvatar name={c.displayName} size={38} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{c.displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {c.lastSnippet || (c.username ? `@${c.username}` : "")}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
        {sending && (
          <div className="flex items-center justify-center gap-2 pt-1 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("Юборилмоқда…", "Sending…")}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
