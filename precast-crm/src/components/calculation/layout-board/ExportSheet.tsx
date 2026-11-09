"use client";

/**
 * PNG / PDF export of the top-view sheet. The SVG is rasterised in the browser;
 * the PDF embeds that same image on an A4 landscape page, because jsPDF's built-in
 * fonts have no Cyrillic and a vector PDF would garble the Uzbek labels.
 */
import * as React from "react";
import { FileDown, ImageDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { useCalculatorStore } from "@/store/calculator";
import { buildLayoutSheetSvg, SHEET_H, SHEET_W } from "@/lib/layout-board/sheet";
import { sheetTotals } from "@/lib/layout-board/totals";

const LOGO_URL = "/brand/etalonslabs-logo-dark.png";

async function logoDataUrl(): Promise<string> {
  const blob = await fetch(LOGO_URL).then((r) => {
    if (!r.ok) throw new Error(`logo ${r.status}`);
    return r.blob();
  });
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

async function svgToCanvas(svg: string): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("svg render failed"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = SHEET_W;
    canvas.height = SHEET_H;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function ExportSheet() {
  const t = useT();
  const rows = useCalculatorStore((s) => s.rows);
  const wallCm = useCalculatorStore((s) => s.layoutWallCm);
  const clientName = useCalculatorStore((s) => s.client.name);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const totals = sheetTotals(rows);
  const unplaced = totals.roomCount - totals.placedCount;
  const nothing = totals.placedCount === 0;
  const baseName = `${(clientName.trim() || "loyiha").replace(/[\\/:*?"<>|]+/g, "_")}-joylashuv`;

  async function run(kind: "png" | "pdf") {
    setBusy(true);
    setError(null);
    try {
      const svg = buildLayoutSheetSvg(rows, {
        projectName: null,
        clientName: clientName.trim() || null,
        date: new Date(),
        wallCm,
        logoHref: await logoDataUrl(),
      });
      const canvas = await svgToCanvas(svg);
      if (kind === "png") {
        const png = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png encode failed"))), "image/png"),
        );
        download(png, `${baseName}.png`);
        return;
      }
      // JPEG inside the PDF: a PNG page weighs ~18 MB, too heavy to send a client in a chat.
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 297, 210);
      pdf.save(`${baseName}.pdf`);
    } catch (e) {
      console.error("[layout-board] export failed", e);
      setError(t("Чизмани юклаб бўлмади, қайта уриниб кўринг", "Could not export the sheet, try again"));
    } finally {
      setBusy(false);
    }
  }

  const title = nothing
    ? t("Жойлаштирилган хона йўқ", "No rooms are placed")
    : unplaced > 0
      ? t(`${unplaced} хона жойлаштирилмаган`, `${unplaced} rooms not placed`)
      : undefined;

  return (
    <div className="flex items-center gap-2">
      {unplaced > 0 && !nothing && (
        <span className="text-xs text-warning tabular-nums">{t(`${unplaced} хона жойлаштирилмаган`, `${unplaced} not placed`)}</span>
      )}
      <Button variant="outline" size="sm" disabled={nothing || busy} onClick={() => run("png")} title={title ?? "PNG"}>
        <ImageDown className="mr-1 h-4 w-4" /> PNG
      </Button>
      <Button variant="outline" size="sm" disabled={nothing || busy} onClick={() => run("pdf")} title={title ?? "PDF"}>
        <FileDown className="mr-1 h-4 w-4" /> PDF
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
