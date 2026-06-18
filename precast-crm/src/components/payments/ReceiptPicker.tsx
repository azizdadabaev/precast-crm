"use client";

import { useRef, useState } from "react";
import { Paperclip, Loader2, X } from "lucide-react";
import { ImageViewerProvider, useImageViewer } from "@/components/inbox/ImageViewer";
import { useT } from "@/lib/i18n";
import { isHeic, prepareImageForUpload } from "@/lib/image/prepare-upload";

/**
 * Inline receipt picker for the payment dialogs. A "📎 Чек · Receipt" button
 * opens a hidden multi-file image input; each picked file is POSTed to
 * /api/payments/upload-receipt and the returned URLs are collected in the
 * parent's `urls` state. Picked receipts render as removable 64px thumbnails.
 *
 * Controlled: the parent owns `urls` (so it can include them in its submit)
 * and is told of changes via `onChange`.
 */
export function ReceiptPicker({
  urls,
  onChange,
  disabled,
}: {
  urls: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(files: FileList | null) {
    const picked = Array.from(files ?? []).filter((f) => f.type.startsWith("image/") || isHeic(f));
    if (picked.length === 0) return;
    setUploading(true);
    setError(null);
    const added: string[] = [];
    try {
      for (const file of picked) {
        const prepared = await prepareImageForUpload(file);
        const fd = new FormData();
        fd.append("file", prepared);
        // Raw fetch (not api()) — multipart must set its own boundary header.
        const res = await fetch("/api/payments/upload-receipt", {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        const json = (await res.json()) as { ok?: boolean; data?: { url?: string }; error?: string };
        if (!res.ok || !json.data?.url) {
          throw new Error(json.error || `HTTP ${res.status}`);
        }
        added.push(json.data.url);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (added.length) onChange([...urls, ...added]);
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => fileRef.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm transition-colors hover:bg-muted/30 disabled:opacity-50"
      >
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Paperclip className="h-3.5 w-3.5" />
        )}
        Чек<span className="lang-en"> · Receipt</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        hidden
        onChange={(e) => {
          void onPick(e.target.files);
          e.target.value = "";
        }}
      />

      {urls.length > 0 && (
        <ImageViewerProvider images={urls}>
          <RemovableThumbs
            urls={urls}
            onRemove={(url) => onChange(urls.filter((u) => u !== url))}
            disabled={disabled || uploading}
          />
        </ImageViewerProvider>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function RemovableThumbs({
  urls,
  onRemove,
  disabled,
}: {
  urls: string[];
  onRemove: (url: string) => void;
  disabled?: boolean;
}) {
  const open = useImageViewer();
  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((url) => (
        <div key={url} className="group relative h-16 w-16">
          <button
            type="button"
            onClick={() => open(url)}
            className="h-16 w-16 overflow-hidden rounded-lg ring-1 ring-border transition hover:ring-primary"
            aria-label="Open receipt"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-full w-full object-cover" />
          </button>
          {!disabled && (
            <button
              type="button"
              onClick={() => onRemove(url)}
              aria-label="Remove receipt"
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white shadow"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
