"use client";

import { useState, type RefObject } from "react";
import { MessageCircle, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

/**
 * Render the quote summary (a shared DOM region) to a PNG and send it
 * straight into the linked Telegram chat via /api/inbox/[id]/reply-photo —
 * closing the drawing→quote→chat loop without a download + drag-drop.
 *
 * Shown only when the project is linked to a conversation AND the viewer
 * has inbox.access; the endpoint enforces inbox.access server-side
 * regardless. Reuses the same html-to-image capture options as the
 * "Send/Save image" button so the output is identical.
 */
export function SendQuoteToChatButton({
  targetRef,
  conversationId,
  fileBase,
  disabled = false,
}: {
  targetRef: RefObject<HTMLElement>;
  conversationId: string;
  fileBase: string;
  disabled?: boolean;
}) {
  const t = useT();
  const [state, setState] = useState<null | "sending" | "sent">(null);

  async function send() {
    const node = targetRef.current;
    if (!node) return;
    setState("sending");
    try {
      const dims = {
        width: Math.max(node.scrollWidth, node.offsetWidth),
        height: Math.max(node.scrollHeight, node.offsetHeight),
      };
      const baseOpts = { backgroundColor: "#ffffff", pixelRatio: 3, cacheBust: true };
      const { toBlob } = await import("html-to-image");
      await toBlob(node, { ...baseOpts, ...dims }).catch(() => {}); // warm html-to-image's resource cache
      const blob = await toBlob(node, { ...baseOpts, ...dims });
      if (!blob) throw new Error(t("Расм яратилмади", "Could not render the image"));

      const form = new FormData();
      form.append("photo", blob, `${fileBase}.png`);
      form.append("caption", fileBase);

      const res = await fetch(`/api/inbox/${conversationId}/reply-photo`, {
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
    <Button
      variant="outline"
      size="sm"
      disabled={disabled || state === "sending"}
      onClick={send}
      title={t("Хулосани мижоз чатига расм сифатида юбориш", "Send the summary as an image to the customer's chat")}
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
  );
}
