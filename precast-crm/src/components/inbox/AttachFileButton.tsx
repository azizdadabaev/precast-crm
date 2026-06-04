"use client";

import { useRef, useState } from "react";
import { Paperclip, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";

// Mirror the server cap (Telegram Bot API sendDocument limit).
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * Paperclip button for the inbox composer: pick any file (PDF, video, doc, …)
 * and send it into the chat as a Telegram document via
 * /api/inbox/[id]/reply-file. Shown to inbox.access users (the whole composer
 * is already gated).
 */
export function AttachFileButton({
  conversationId,
  onSent,
}: {
  conversationId: string;
  /** Called after the upload resolves (success or persisted-failure) to refetch the thread. */
  onSent?: () => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again later
    if (!file) return;
    if (file.size === 0) {
      alert(t("Бўш файл", "Empty file"));
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      alert(t("Файл катта (макс 50 МБ)", "File too large (max 50 MB)"));
      return;
    }
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/inbox/${conversationId}/reply-file`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const text = await res.text();
      const payload = text ? JSON.parse(text) : {};
      if (!res.ok || payload?.ok === false) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      alert(
        `${t("Файлни юбориб бўлмади", "Couldn't send the file")}${
          err instanceof Error ? `: ${err.message}` : ""
        }`,
      );
    } finally {
      // Refetch either way: a 502 still persisted a failed bubble to show.
      onSent?.();
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={sending}
        aria-label={t("Файл бириктириш", "Attach file")}
        title={t("Файл юбориш", "Send a file")}
        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-[color:var(--tg-text-dim)] transition-colors hover:text-[var(--tg-accent)] disabled:opacity-50"
      >
        {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
      </button>
      <input ref={inputRef} type="file" hidden onChange={onPick} />
    </>
  );
}
