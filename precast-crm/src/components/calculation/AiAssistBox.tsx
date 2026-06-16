"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { useT } from "@/lib/i18n";
import { Sparkles, Loader2, ImagePlus, ChevronRight, ChevronDown } from "lucide-react";
import type { ExtractedRoom } from "@/lib/agent/llm/provider";

interface ExtractResponse {
  rooms: ExtractedRoom[];
  confidence: "high" | "low";
  note?: string;
  isPlanLike?: boolean;
}

export function AiAssistBox({
  onRooms,
}: {
  onRooms: (rooms: ExtractedRoom[], meta: { confidence: "high" | "low"; note?: string }) => void;
}) {
  const t = useT();
  const { data: me } = useQuery<{ permissions: string[] }>({
    queryKey: ["me"],
    queryFn: () => api("/api/auth/me"),
  });
  const allowed = me?.permissions?.includes("calculator.aiAssist") ?? false;

  // Collapsed by default — the box is an occasional helper, so it shouldn't
  // push the client bar + table down on every visit. Click the header to expand.
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!allowed) return null;

  async function run(body: { text: string } | { imageBase64: string; imageMime: string }) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await api<ExtractResponse>("/api/calculations/ai-extract", { method: "POST", json: body });
      if (!res.rooms.length) {
        setInfo(
          res.note ??
            t("Ўлчамларни ўқий олмадим — қўлда киритинг", "Couldn't read dimensions — please enter them manually"),
        );
        return;
      }
      onRooms(res.rooms, { confidence: res.confidence, note: res.note });
      setText("");
      setInfo(
        t(`AI ${res.rooms.length} та хона қўшди — текширинг`, `AI added ${res.rooms.length} rooms — please check`) +
          (res.confidence === "low" && res.note ? ` · ${res.note}` : ""),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onPickImage(file: File) {
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const imageBase64 = btoa(binary);
    await run({ imageBase64, imageMime: file.type || "image/jpeg" });
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {t("AI ёрдамчи", "AI assist")}
        {expanded ? (
          <ChevronDown className="ml-auto h-4 w-4" />
        ) : (
          <ChevronRight className="ml-auto h-4 w-4" />
        )}
      </button>
      {expanded && (
      <>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        disabled={busy}
        placeholder={t(
          "Хона ўлчамларини шу ерга ёзинг ёки расм юкланг…",
          "Paste room dimensions here, or upload an image…",
        )}
        className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={() => run({ text: text.trim() })}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {t("Ўқиш", "Parse")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          {t("Расм", "Image")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onPickImage(f);
            e.target.value = "";
          }}
        />
      </div>
      {info && <p className="text-xs text-muted-foreground">{info}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      </>
      )}
    </div>
  );
}
