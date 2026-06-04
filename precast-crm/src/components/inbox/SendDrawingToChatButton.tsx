"use client";

import { useState } from "react";
import { Send, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { ChatPickerDialog } from "@/components/inbox/SendQuoteToChatButton";

/**
 * Send a generated Blender PDF (a DrawingRequest) into a Telegram chat. If the
 * project/order is chat-linked it sends directly; otherwise it opens the chat
 * picker. The PDF is read + forwarded server-side by its drawing id (no client
 * upload) via /api/inbox/[id]/reply-document. Shown only to inbox.access users.
 */
export function SendDrawingToChatButton({
  drawingId,
  conversationId,
  onSent,
  disabled = false,
}: {
  drawingId: string;
  /** When set, send straight to this chat; when null/undefined, open the picker. */
  conversationId?: string | null;
  /** Called with the destination id after a successful send (e.g. to link). */
  onSent?: (conversationId: string) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [state, setState] = useState<null | "sending" | "sent">(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function sendTo(convId: string) {
    setState("sending");
    try {
      const res = await fetch(`/api/inbox/${convId}/reply-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drawingId }),
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
        `${t("PDFни юбориб бўлмади", "Couldn't send the PDF")}: ${
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
        title={t("PDFни чатга юбориш", "Send the PDF to a chat")}
      >
        {state === "sending" ? (
          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        ) : state === "sent" ? (
          <Check className="h-3.5 w-3.5 mr-1.5 text-success" />
        ) : (
          <Send className="h-3.5 w-3.5 mr-1.5" />
        )}
        {state === "sent" ? t("Юборилди", "Sent") : t("PDF юбориш", "Send PDF")}
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
