"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { FlaskConical, Loader2, X } from "lucide-react";

// Owner test tool: inject a customer message and run the agent on the real
// webhook path (no Telegram). Reuses the open chat for multi-turn, or spins up a
// fresh simulated conversation.
export function SimulateModal({
  activeId,
  onClose,
  onDone,
}: {
  activeId: string | null;
  onClose: () => void;
  onDone: (conversationId: string) => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ base64: string; mime: string; name: string } | null>(null);
  const [audio, setAudio] = useState<{ base64: string; mime: string; name: string } | null>(null);
  const [intoCurrent, setIntoCurrent] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  const sim = useMutation({
    mutationFn: () => {
      const conversationId = activeId && intoCurrent ? activeId : undefined;
      // An attached image tests the floor-plan vision path; otherwise plain text.
      const json = image
        ? { imageBase64: image.base64, imageMime: image.mime, conversationId }
        : audio
          ? { audioBase64: audio.base64, audioMime: audio.mime, conversationId }
          : { text: text.trim(), conversationId };
      return api<{ conversationId: string; ranAgent: boolean; proposal: unknown; note?: string }>(
        "/api/agent/simulate-inbound",
        { method: "POST", json },
      );
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
      qc.invalidateQueries({ queryKey: ["inbox-thread", res.conversationId] });
      qc.invalidateQueries({ queryKey: ["agent-proposal", res.conversationId] });
      onDone(res.conversationId);
      if (res.note) setNote(res.note); // gate blocked / no key — keep open, explain
      else onClose(); // proposal landed — close; it shows as the ghost-draft
    },
    onError: (e: Error) => setNote(e.message),
  });

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={() => !sim.isPending && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl bg-[var(--tg-panel)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--tg-text)]">
            <FlaskConical className="h-4 w-4 text-[var(--tg-accent)]" />
            Хабарни синаш · Simulate inbound
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[color:var(--tg-text-dim)] transition-colors hover:bg-[var(--tg-list-hover)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-[12px] text-[color:var(--tg-text-dim)]">
          Мижоз хабарини ёзинг — AI агент Shadow режимида жавоб таклиф қилади (мижозга ҳеч нима юборилмайди) · Type a
          customer message; the AI proposes a reply in Shadow (nothing is sent to a customer).
        </p>
        <textarea
          autoFocus
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="масалан: 4x5 хона нархи қанча? · e.g. how much for a 4x5 room?"
          className="mt-3 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[color:var(--tg-accent)]"
        />
        <label className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[color:var(--tg-text-dim)]">
          <span>📐 Чизма расм · Floor-plan image (vision):</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="text-[11px]"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) { setImage(null); return; }
              const reader = new FileReader();
              reader.onload = () => {
                const r = String(reader.result);
                setImage({ base64: r.includes(",") ? r.slice(r.indexOf(",") + 1) : r, mime: f.type || "image/jpeg", name: f.name });
              };
              reader.readAsDataURL(f);
            }}
          />
          {image && <span className="text-[var(--tg-accent)]">📎 {image.name} · расм юборилади · image will be sent</span>}
        </label>
        <label className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[color:var(--tg-text-dim)]">
          <span>🎤 Овоз · Voice note (transcription):</span>
          <input
            type="file"
            accept="audio/ogg,audio/mpeg,audio/mp4,audio/wav,audio/webm"
            className="text-[11px]"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) { setAudio(null); return; }
              const reader = new FileReader();
              reader.onload = () => {
                const r = String(reader.result);
                setAudio({ base64: r.includes(",") ? r.slice(r.indexOf(",") + 1) : r, mime: f.type || "audio/ogg", name: f.name });
              };
              reader.readAsDataURL(f);
            }}
          />
          {audio && <span className="text-[var(--tg-accent)]">📎 {audio.name} · овоз юборилади · audio will be sent</span>}
        </label>
        {activeId && (
          <label className="mt-2 flex items-center gap-2 text-[13px] text-[color:var(--tg-text-dim)]">
            <input type="checkbox" checked={intoCurrent} onChange={(e) => setIntoCurrent(e.target.checked)} />
            Очиқ суҳбатга қўшиш · Add to the open chat
          </label>
        )}
        {note && (
          <div className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400">
            {note}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={sim.isPending}
            className="rounded-lg px-3 py-1.5 text-[13px] text-[color:var(--tg-text-dim)] transition-colors hover:bg-[var(--tg-list-hover)] disabled:opacity-60"
          >
            Бекор · Cancel
          </button>
          <button
            type="button"
            onClick={() => { setNote(null); sim.mutate(); }}
            disabled={sim.isPending || (!text.trim() && !image && !audio)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-white transition-colors disabled:opacity-60"
            style={{ background: "var(--tg-accent)" }}
          >
            {sim.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
            Юбориш · Run
          </button>
        </div>
      </div>
    </div>
  );
}
