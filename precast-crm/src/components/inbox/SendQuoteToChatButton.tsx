"use client";

import { useState, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/fetcher";
import { ChatAvatar } from "@/components/inbox/ChatAvatar";
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
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }
      setState("sent");
      setPickerOpen(false);
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
        onClick={() => (conversationId ? void sendTo(conversationId) : setPickerOpen(true))}
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
          onPick={(id) => void sendTo(id)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}

/** Reusable: lists all inbox conversations so the operator can pick a send
 *  target. Used by the quote-image and drawing-PDF send buttons. */
export function ChatPickerDialog({
  sending,
  onPick,
  onClose,
}: {
  sending: boolean;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const { data: chats, isLoading } = useQuery<Conversation[]>({
    queryKey: ["inbox-conversations"],
    queryFn: () => api("/api/inbox"),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && !sending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Қайси чатга юборилсин?", "Send to which chat?")}</DialogTitle>
        </DialogHeader>
        <div className="-mx-2 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {t("Юкланмоқда…", "Loading…")}
            </div>
          ) : !chats || chats.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {t("Чатлар йўқ", "No chats yet")}
            </div>
          ) : (
            chats.map((c) => (
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
