"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Boxes, Calculator, ChevronDown, ChevronUp, Info, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { parseQty, stepQty, stockTone, type QtyMap } from "@/lib/gazoblok-order-form";
import { lineTotal } from "@/services/gazoblok-engine";
import { NUM, SectionCard } from "./ui";
import type { FormProduct, LineNotes } from "./types";

const ICON = { strokeWidth: 1.75 };

const cm = (m: number) => formatNumber(Math.round(m * 1000) / 10, 1);

/** «20 / 30 см · 0,036 м³/та» — the wall widths a size lays at, and its volume. */
function sizeNote(p: FormProduct): string {
  const widths = p.thicknessM === p.heightM ? `${cm(p.thicknessM)} см` : `${cm(p.thicknessM)} / ${cm(p.heightM)} см`;
  return widths;
}

export function BlocksSection({
  products,
  loading,
  failed,
  onRetry,
  qty,
  onQty,
  notes,
  badIds,
  showErrors,
  hasLines,
  calcOpen,
  onToggleCalc,
  calculator,
}: {
  products: FormProduct[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  qty: QtyMap;
  onQty: (productId: string, raw: string) => void;
  notes: LineNotes;
  badIds: string[];
  showErrors: boolean;
  hasLines: boolean;
  calcOpen: boolean;
  onToggleCalc: () => void;
  calculator: ReactNode;
}) {
  const t = useT();
  const order = products.map((p) => p.id);
  // Enter moves to the next size (desktop table and phone list both render it: take the visible one).
  const focusNext = (id: string) => {
    const next = order[order.indexOf(id) + 1];
    const target = next
      ? Array.from(document.querySelectorAll<HTMLElement>(`[id="f-qty-${next}"]`)).find((e) => e.offsetParent !== null)
      : document.getElementById("f-date-today");
    target?.focus();
  };

  const stock = (p: FormProduct) => {
    const tone = stockTone(p.stock, p.lowStockThreshold);
    if (tone === "none") return <span className="font-semibold text-destructive">{t("Омборда йўқ", "Out of stock")}</span>;
    if (tone === "low")
      return (
        <span className="text-warning">
          <span className={cn(NUM, "font-semibold")}>{formatNumber(p.stock ?? 0, 0)}</span> · {t("кам", "low")}
        </span>
      );
    return <span className={NUM}>{formatNumber(p.stock ?? 0, 0)}</span>;
  };

  const stepper = (p: FormProduct, tall: boolean) => {
    const raw = qty[p.id] ?? "";
    const n = parseQty(raw);
    const on = (n ?? 0) > 0;
    const bad = n === null;
    return (
      <div
        className={cn(
          "inline-flex items-stretch overflow-hidden rounded-md border bg-background",
          tall ? "h-11" : "h-11 md:h-10",
          bad ? "border-destructive" : on ? "border-primary/60" : "border-border",
        )}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={t("Камайтириш", "Decrease")}
          onClick={() => onQty(p.id, stepQty(raw, -1))}
          className="grid w-11 place-items-center text-muted-foreground hover:bg-surface-hover md:w-9"
        >
          <Minus className="h-4 w-4" {...ICON} />
        </button>
        <input
          id={`f-qty-${p.id}`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={`${p.label} — ${t("сони", "quantity")}`}
          aria-invalid={bad || undefined}
          placeholder="0"
          value={raw}
          onChange={(e) => onQty(p.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              focusNext(p.id);
            }
          }}
          className={cn(
            NUM,
            "w-[76px] border-x bg-transparent px-2 text-right text-[15px] outline-none placeholder:text-text-tertiary focus:bg-primary/5",
            on ? "border-primary/35 font-bold" : "border-border",
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={t("Кўпайтириш", "Increase")}
          onClick={() => onQty(p.id, stepQty(raw, 1))}
          className="grid w-11 place-items-center text-muted-foreground hover:bg-surface-hover md:w-9"
        >
          <Plus className="h-4 w-4" {...ICON} />
        </button>
      </div>
    );
  };

  const overStock = (p: FormProduct) => {
    const n = parseQty(qty[p.id] ?? "") ?? 0;
    return n > 0 && n > (p.stock ?? 0) ? <div className="mt-1 text-xs text-warning">{t("омбордан кўп", "more than in stock")}</div> : null;
  };
  const badText = (p: FormProduct) =>
    showErrors && badIds.includes(p.id) ? (
      <div className="mt-1 text-xs text-destructive">{t("Бутун сон ёзинг: масалан 1 554", "Whole number, e.g. 1 554")}</div>
    ) : null;

  const calcButton = (
    <Button
      type="button"
      variant="outline"
      onClick={onToggleCalc}
      aria-expanded={calcOpen}
      aria-keyshortcuts="Alt+H"
      className={cn("min-h-[44px] gap-2 md:min-h-0", calcOpen && "border-primary/60 bg-primary/5 text-primary")}
    >
      <Calculator className="h-4 w-4" {...ICON} />
      {t("Девор бўйича ҳисоблаш", "Estimate by walls")}
      {calcOpen ? <ChevronUp className="h-4 w-4" {...ICON} /> : <ChevronDown className="h-4 w-4" {...ICON} />}
    </Button>
  );

  let body: ReactNode;
  if (failed) {
    body = (
      <div className="space-y-2 py-4 text-center">
        <p className="text-sm text-muted-foreground">{t("Маълумотни юклаб бўлмади. Уланишни текширинг.", "Failed to load. Check your connection.")}</p>
        <Button type="button" variant="outline" size="sm" className="min-h-[44px]" onClick={onRetry}>
          {t("Қайта уриниш", "Retry")}
        </Button>
      </div>
    );
  } else if (loading) {
    body = <div className="py-4 text-sm text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>;
  } else if (products.length === 0) {
    body = (
      <div className="py-4 text-sm text-muted-foreground">
        {t("Каталог бўш — аввал ўлчам қўшинг", "Catalog is empty — add a size first")}{" "}
        <Link href="/gazoblok/catalog" className="whitespace-nowrap text-primary hover:underline">
          {t("Каталогга ўтиш", "Open catalog")}
        </Link>
      </div>
    );
  } else {
    body = (
      <>
        {/* Desktop: one row per active size */}
        <div className="-mx-4 hidden border-t border-border sm:-mx-5 md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-muted-foreground">
                <th className="py-2.5 pl-5 pr-3 text-left font-semibold">{t("Ўлчам", "Size")}</th>
                <th className="w-[120px] px-3 text-left font-semibold">{t("Омборда", "In stock")}</th>
                <th className="px-3 text-right font-semibold">{t("Нархи, UZS", "Price, UZS")}</th>
                <th className="w-[170px] px-3 text-right font-semibold">{t("Сони, та", "Qty, pcs")}</th>
                <th className="w-[150px] py-2.5 pl-3 pr-5 text-right font-semibold">{t("Жами, UZS", "Total, UZS")}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const n = parseQty(qty[p.id] ?? "") ?? 0;
                const note = notes[p.id];
                return (
                  <tr key={p.id} className={cn("border-t border-border", n > 0 && "bg-primary/5")}>
                    <td className="py-2.5 pl-5 pr-3">
                      <div className={cn(NUM, "font-semibold")}>{p.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {note ? (
                          <>
                            {t("олдин юкланган", "loaded last time")} <span className={NUM}>{formatNumber(note.previousLoaded, 0)}</span>
                          </>
                        ) : (
                          <span className="whitespace-nowrap">
                            {sizeNote(p)} · <span className={NUM}>{formatNumber(p.volumeM3, 3)}</span> {t("м³/та", "m³/pc")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 text-[13px]">{stock(p)}</td>
                    <td className={cn(NUM, "px-3 text-right")}>
                      {formatNumber(p.pricePerBlock, 0)}
                      {note?.previousUnitPrice != null && (
                        <div className="text-xs text-muted-foreground">
                          {t("олдин", "was")} {formatNumber(note.previousUnitPrice, 0)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {stepper(p, false)}
                      {overStock(p)}
                      {badText(p)}
                    </td>
                    <td className={cn(NUM, "py-2.5 pl-3 pr-5 text-right", n > 0 ? "font-bold" : "text-text-tertiary")}>
                      {n > 0 ? formatNumber(lineTotal(p.pricePerBlock, n), 0) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Phone: stacked rows, 44 px steppers */}
        <ul className="-mx-4 divide-y divide-border border-y border-border sm:-mx-5 md:hidden">
          {products.map((p) => {
            const n = parseQty(qty[p.id] ?? "") ?? 0;
            const note = notes[p.id];
            return (
              <li key={p.id} className={cn("px-4 py-3 sm:px-5", n > 0 && "bg-primary/5")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={cn(NUM, "text-[15px] font-semibold")}>{p.label}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      <span className={NUM}>{formatNumber(p.pricePerBlock, 0)}</span> {t("UZS/та", "UZS/pc")} · {t("омборда", "stock")} {stock(p)}
                    </div>
                    {note && (
                      <div className="text-xs text-muted-foreground">
                        {t("олдин юкланган", "loaded last time")} <span className={NUM}>{formatNumber(note.previousLoaded, 0)}</span>
                        {note.previousUnitPrice != null && (
                          <>
                            {" · "}
                            {t("олдин", "was")} <span className={NUM}>{formatNumber(note.previousUnitPrice, 0)}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {stepper(p, true)}
                    {overStock(p)}
                  </div>
                </div>
                {badText(p)}
                {n > 0 && (
                  <div className={cn(NUM, "mt-1.5 text-right text-[13px] font-semibold")}>
                    {formatNumber(lineTotal(p.pricePerBlock, n), 0)} <span className="font-sans text-xs font-normal text-muted-foreground">UZS</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" {...ICON} />
          {t("Фақат фаол ўлчамлар. Омбор жойлашганда эмас, юк ортилганда камаяди.", "Active sizes only. Stock drops when a truck is loaded, not when the order is placed.")}
        </div>
      </>
    );
  }

  return (
    <SectionCard
      id="sec-blocks"
      className="overflow-hidden pb-0 sm:pb-0"
      icon={<Boxes className="h-4 w-4" {...ICON} />}
      title={t("Блоклар", "Blocks")}
      done={hasLines && badIds.length === 0}
      action={!failed && products.length > 0 ? calcButton : undefined}
    >
      {/* Kept mounted while closed so the walls and the snapshot sent with the order survive. */}
      <div className={cn("-mx-4 border-t border-border bg-muted/40 px-4 py-4 sm:-mx-5 sm:px-5", !calcOpen && "hidden")}>
        <div className="mb-3 text-[13px] font-semibold">
          <span className="inline-flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" {...ICON} />
            {t("Девор бўйича ҳисоблаш", "Estimate by walls")}
          </span>{" "}
          <span className="font-normal text-muted-foreground">
            — {t("натижа шу жадвалга қўшилади, девор маълумоти буюртма билан сақланади", "the result is added to this table; the walls are saved with the order")}
          </span>
        </div>
        {calculator}
      </div>
      {body}
    </SectionCard>
  );
}
