"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

interface Props {
  orderId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function LoadTruckDialog({ orderId, open, onClose, onSuccess }: Props) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function pickFile(f: File) {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError(null);
  }

  async function submit() {
    if (!file) { setError(t("Расм юклаш керак", "Photo is required")); return; }
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/orders/${orderId}/load`, { method: "POST", body: fd });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Upload failed");
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-background rounded-lg border shadow-xl w-full max-w-sm space-y-4 p-5">
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Юкланди<span className="lang-en"> · Load truck</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("Юкланган машина расмини юкланг.", "Upload a photo of the loaded truck.")}
        </p>

        <div
          className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
            preview ? "border-border" : "border-primary/30 hover:border-primary/60"
          }`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) pickFile(f);
          }}
        >
          {preview ? (
            <img src={preview} alt="preview" className="max-h-48 mx-auto rounded object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-2 py-4 text-muted-foreground">
              <Camera className="h-8 w-8" />
              <span className="text-sm">{t("Расм танланг ёки ташланг", "Click or drop photo here")}</span>
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
        />

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            {t("Бекор", "Cancel")}
          </Button>
          <Button size="sm" onClick={submit} disabled={!file || loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {t("Юклаш", "Save photo")}
          </Button>
        </div>
      </div>
    </div>
  );
}
