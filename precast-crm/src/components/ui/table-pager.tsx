"use client";

/**
 * Prev/Next pager for server-paginated tables.
 *
 * Deliberately minimal: two buttons and a range readout. Numbered page links
 * would need a windowing algorithm and buy little at this data size — the
 * operator scans with search + sort, not by hunting page 7.
 *
 * Renders nothing when everything fits on one page, so small tables stay clean.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { formatNumber } from "@/lib/utils";

export interface TablePagerProps {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  className?: string;
}

export function TablePager({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
  className,
}: TablePagerProps) {
  const t = useT();
  if (pageCount <= 1) return null;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn =
    "inline-flex items-center gap-1 rounded-md border border-border px-3 h-8 text-xs font-semibold uppercase tracking-wider transition-colors hover:bg-muted disabled:opacity-40 disabled:pointer-events-none";

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-t border-border px-3 py-2.5",
        className,
      )}
    >
      <div className="text-[11px] tabular-nums text-muted-foreground">
        <span className="font-mono">
          {formatNumber(from, 0)}–{formatNumber(to, 0)}
        </span>{" "}
        / <span className="font-mono">{formatNumber(total, 0)}</span>
        <span className="ml-1">{t("та", "total")}</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className={btn}
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t("Олдинги", "Prev")}
        </button>
        <span className="text-[11px] tabular-nums text-muted-foreground font-mono">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          className={btn}
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
        >
          {t("Кейинги", "Next")}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
