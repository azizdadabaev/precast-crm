"use client";

import { useState, type RefObject } from "react";
import {
  Send,
  Image as ImageIcon,
  Download,
  Copy,
  Share2,
  Loader2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n";

interface ShareCalculationButtonProps {
  /** Ref to the DOM node that will be rendered into the image. */
  targetRef: RefObject<HTMLElement>;
  /** Base filename without extension — e.g. "Order-2026-05-0005". */
  fileBase: string;
  /** Optional: disable when there's nothing to capture (e.g. zero calcs). */
  disabled?: boolean;
}

/**
 * "Send Calculation" action — turns a DOM region into a PNG/JPEG and
 * lets the operator download, copy, or share it. Used on order and
 * project detail pages to ship a one-screen summary to the customer
 * via WhatsApp/Telegram without screenshots.
 *
 * Behavior choices:
 *  - PNG defaults to 2× pixel ratio for legible numbers on phone screens.
 *  - JPEG renders at 0.92 quality, white background (JPEG doesn't have
 *    transparency, so we force a solid bg to avoid black corners).
 *  - Copy uses the async Clipboard API (PNG only — browsers don't
 *    accept JPEG via clipboard.write for security/MIME reasons).
 *  - Share uses the Web Share Level 2 file API; the menu item hides on
 *    desktops that don't expose `navigator.canShare({ files })`.
 */
export function ShareCalculationButton({
  targetRef,
  fileBase,
  disabled = false,
}: ShareCalculationButtonProps) {
  const t = useT();
  const [busy, setBusy] = useState<null | "png" | "jpeg" | "copy" | "share">(null);
  const [copied, setCopied] = useState(false);

  // The header card uses oklch CSS variables (`bg-background`) which
  // some browsers' rendering of foreignObject-based serialization can
  // skip — passing an explicit white backgroundColor avoids gray /
  // transparent patches on the captured image.
  //
  // We don't pass width/height here because html-to-image's default
  // (offsetWidth/Height) is correct for our static cards. We override
  // them per call via `withNode` so callers can pass scrollHeight
  // when the captured area might overflow (e.g. a long calc table).
  const baseOpts = {
    backgroundColor: "#ffffff",
    pixelRatio: 2,
    cacheBust: true,
  };

  /**
   * Run `fn` against the target DOM node with explicit width/height
   * derived from the node's full scroll extent — this prevents the
   * captured image from clipping the bottom of the shareable area
   * when the inner content is taller than its computed offsetHeight
   * (seen on cards with `overflow-hidden` wrapping a long child).
   */
  async function withNode<T>(
    fn: (node: HTMLElement, dims: { width: number; height: number }) => Promise<T>,
  ): Promise<T | null> {
    const node = targetRef.current;
    if (!node) return null;
    const dims = {
      width: Math.max(node.scrollWidth, node.offsetWidth),
      height: Math.max(node.scrollHeight, node.offsetHeight),
    };
    return fn(node, dims);
  }

  async function handleDownload(format: "png" | "jpeg") {
    setBusy(format);
    try {
      const { toPng, toJpeg } = await import("html-to-image");
      const dataUrl = await withNode((node, dims) =>
        format === "png"
          ? toPng(node, { ...baseOpts, ...dims })
          : toJpeg(node, { ...baseOpts, ...dims, quality: 0.92 }),
      );
      if (!dataUrl) return;
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${fileBase}.${format === "png" ? "png" : "jpg"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Image generation failed", err);
      alert("Image generation failed. See console for details.");
    } finally {
      setBusy(null);
    }
  }

  async function handleCopy() {
    setBusy("copy");
    try {
      const { toBlob } = await import("html-to-image");
      const blob = await withNode((node, dims) =>
        toBlob(node, { ...baseOpts, ...dims }),
      );
      if (!blob) return;
      if (!navigator.clipboard || !window.ClipboardItem) {
        alert("Clipboard image copy isn't supported in this browser.");
        return;
      }
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error("Copy failed", err);
      alert("Couldn't copy image. See console for details.");
    } finally {
      setBusy(null);
    }
  }

  async function handleShare() {
    setBusy("share");
    try {
      const { toBlob } = await import("html-to-image");
      const blob = await withNode((node, dims) =>
        toBlob(node, { ...baseOpts, ...dims }),
      );
      if (!blob) return;
      const file = new File([blob], `${fileBase}.png`, { type: "image/png" });
      // `navigator.canShare` may not exist; the menu item only renders
      // when it does, but guard anyway in case of a stale window.
      if (
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: fileBase,
          text: fileBase,
        });
      } else {
        alert("Share isn't supported in this browser. Use Download or Copy instead.");
      }
    } catch (err: unknown) {
      // User-cancelled share rejects with AbortError — ignore.
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("Share failed", err);
      alert("Share failed. See console for details.");
    } finally {
      setBusy(null);
    }
  }

  // Web Share with files is Chrome/Safari mobile mostly — check at
  // render time so the menu doesn't show a dead option on desktop.
  const canShare =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function";

  // Async Clipboard image-write requires a secure context (HTTPS or
  // localhost). On plain HTTP to a raw IP — the current production
  // serve mode — `navigator.clipboard.write` throws
  // "Clipboard image copy isn't supported in this browser." Hide the
  // option so the operator doesn't get a dead-end click; the PNG /
  // JPEG download options work everywhere.
  const canCopy =
    typeof window !== "undefined" &&
    typeof window.isSecureContext === "boolean" &&
    window.isSecureContext &&
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard !== "undefined" &&
    typeof navigator.clipboard.write === "function" &&
    typeof window.ClipboardItem !== "undefined";

  const anyBusy = busy !== null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || anyBusy}
          title={t(
            "Ҳисоб-китоб хулосасини расм сифатида сақлаш ёки улашиш",
            "Save or share the calculation summary as an image",
          )}
        >
          {anyBusy ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Юбориш<span className="lang-en"> · Send</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("Расм сифатида сақлаш", "Save as image")}</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            handleDownload("png");
          }}
          disabled={anyBusy}
        >
          <Download className="h-4 w-4" />
          <span className="flex-1">{t("PNG юклаб олиш", "Download PNG")}</span>
          <span className="text-[10px] text-muted-foreground">{t("аниқ", "sharp")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            handleDownload("jpeg");
          }}
          disabled={anyBusy}
        >
          <ImageIcon className="h-4 w-4" />
          <span className="flex-1">{t("JPEG юклаб олиш", "Download JPEG")}</span>
          <span className="text-[10px] text-muted-foreground">{t("кичикроқ", "smaller")}</span>
        </DropdownMenuItem>
        {canCopy && <DropdownMenuSeparator />}
        {canCopy && (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              handleCopy();
            }}
            disabled={anyBusy}
          >
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            <span className="flex-1">
              {copied ? t("Нусхаланди!", "Copied!") : t("Буфер хотирага нусхалаш", "Copy to clipboard")}
            </span>
          </DropdownMenuItem>
        )}
        {canShare && (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              handleShare();
            }}
            disabled={anyBusy}
          >
            <Share2 className="h-4 w-4" />
            <span className="flex-1">{t("Улашиш…", "Share…")}</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
