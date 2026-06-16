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
import { useT } from "@/lib/i18n";

interface ExportResponse {
  text: string;
  exported: number;
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
  const t = useT();
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
          setError("error" in json ? json.error : t("Экспорт амалга ошмади", "Export failed"));
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
    setError(null);
    try {
      // Async Clipboard API only exists in secure contexts (HTTPS /
      // localhost). The droplet currently serves over plain HTTP on
      // an IP, so `navigator.clipboard` is `undefined` there and we'd
      // crash with "Cannot read properties of undefined (reading
      // 'writeText')". Fall back to the legacy document.execCommand
      // pattern, which still works under HTTP across every browser
      // we care about. Drop the fallback once Caddy is fronting a
      // real domain with TLS (see DEPLOYMENT.md Step 5).
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        // Off-screen but reachable; iOS Safari needs the element to
        // be in the DOM and `contenteditable` to allow selection.
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "0";
        ta.style.left = "0";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error("execCommand returned false");
      }
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 2000);
    } catch (e) {
      setError(`${t("Нусхалаб бўлмади:", "Couldn't copy:")} ${(e as Error).message}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Контактларни экспорт қилиш<span className="lang-en"> · Export Contacts</span></DialogTitle>
          <DialogDescription>
            {t(
              "Қуйидаги блокни WhatsApp, Telegram ёки бошқа мессенжерга жойлаштиринг.",
              "Paste the block below into WhatsApp, Telegram, or any messenger.",
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Status line */}
        <div className="flex items-center justify-between text-sm">
          {loading ? (
            <div className="flex items-center text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t("Экспорт тайёрланмоқда…", "Preparing export…")}
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
              {t("мижоз", "clients")}
            </div>
          ) : null}
        </div>

        {/* Editable text block */}
        <textarea
          className="w-full min-h-[220px] max-h-[60vh] resize-y rounded-md border border-input bg-background p-3 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={loading ? t("Юкланмоқда…", "Loading…") : t("Экспорт қилиш учун контакт йўқ", "No contacts to export")}
        />

        {/* Footer */}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("Ёпиш", "Close")}
          </Button>
          <Button
            size="sm"
            onClick={copyToClipboard}
            disabled={!text || loading}
            className={justCopied ? "bg-success hover:bg-success/90 text-success-foreground" : ""}
          >
            {justCopied ? (
              <>
                <Check className="h-4 w-4 mr-2" /> ✓ {t("Нусхаланди", "Copied")}
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" /> {t("Буфер хотирага нусхалаш", "Copy to clipboard")}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
