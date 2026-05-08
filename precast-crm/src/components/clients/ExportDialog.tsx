"use client";

import { useEffect, useState } from "react";
import { Copy, Check, AlertCircle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ExportResponse {
  text: string;
  exported: number;
  excluded: number;
}

interface Props {
  open: boolean;
  /** Selected client IDs the operator wants to export. */
  ids: string[];
  onClose: () => void;
}

/**
 * Loads the formatted export text from the server when opened, shows it
 * in an editable textarea, and offers a 1-click copy to clipboard.
 *
 * The textarea is editable on purpose — operators sometimes prune lines
 * (e.g. drop a client whose address they realize is wrong) before
 * sending. Pre-formatting server-side keeps the privacy gate on the
 * server even when the user edits client-side.
 */
export function ExportDialog({ open, ids, onClose }: Props) {
  const [data, setData] = useState<ExportResponse | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  // Fetch the export text whenever the dialog opens with a fresh selection.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setData(null);
    setText("");
    setJustCopied(false);

    fetch("/api/clients/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
      .then(async (res) => {
        const json = (await res.json()) as
          | { ok: true; data: ExportResponse }
          | { ok: false; error: string };
        if (!alive) return;
        if (!res.ok || !json.ok) {
          setError("error" in json ? json.error : "Export failed");
          return;
        }
        setData(json.data);
        setText(json.data.text);
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [open, ids]);

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(text);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 2000);
    } catch (e) {
      setError(`Couldn't copy: ${(e as Error).message}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Контактларни экспорт қилиш · Export Contacts</DialogTitle>
          <DialogDescription>
            Paste the block below into WhatsApp, Telegram, or any messenger.
          </DialogDescription>
        </DialogHeader>

        {/* Status line */}
        <div className="flex items-center justify-between text-sm">
          {loading ? (
            <div className="flex items-center text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Preparing export…
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : data ? (
            <div className="text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">
                {data.exported}
              </span>{" "}
              клиент · clients
            </div>
          ) : null}
          {data && data.excluded > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              <AlertCircle className="h-3 w-3" />
              <span>
                {data.excluded} client{data.excluded === 1 ? "" : "s"} excluded
                (no consent on file)
              </span>
            </div>
          )}
        </div>

        {/* Editable text block */}
        <textarea
          className="w-full min-h-[220px] max-h-[60vh] resize-y rounded-md border border-input bg-background p-3 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={loading ? "Loading…" : "No contacts to export"}
        />

        {/* Footer */}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            size="sm"
            onClick={copyToClipboard}
            disabled={!text || loading}
            className={justCopied ? "bg-emerald-600 hover:bg-emerald-700" : ""}
          >
            {justCopied ? (
              <>
                <Check className="h-4 w-4 mr-2" /> ✓ Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" /> Copy to clipboard
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
