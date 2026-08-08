"use client";

/**
 * Table header cell with click-to-sort and an optional per-column filter.
 *
 * Two independent affordances, matching the agreed UX:
 *   - Clicking the LABEL toggles sort on that column (asc ⇄ desc). The active
 *     column shows a solid arrow; sortable-but-inactive columns show a muted
 *     double arrow that only appears on hover, so headers stay quiet.
 *   - The FUNNEL icon (rendered only when `filterContent` is passed) opens a
 *     popover holding that column's filter control. It fills when a filter is
 *     applied so an active filter is never invisible.
 *
 * Columns that are neither sortable nor filterable render as a plain <th> —
 * deliberately non-interactive, because derived values (e.g. the drafts table's
 * browser-computed totals) cannot be ordered server-side before paging.
 */

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortDir } from "@/lib/table-query";

export interface SortableThProps {
  /** Sort key sent to the API. Omit to make the column non-sortable. */
  field?: string;
  /** The currently-sorted field, from table state. */
  activeField?: string | null;
  activeDir?: SortDir;
  onSort?: (field: string) => void;
  align?: "left" | "right" | "center";
  /** Popover body for this column's filter. Omit for no funnel icon. */
  filterContent?: React.ReactNode;
  /** Fills the funnel so an applied filter is visible at a glance. */
  filterActive?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function SortableTh({
  field,
  activeField,
  activeDir = "desc",
  onSort,
  align = "left",
  filterContent,
  filterActive = false,
  className,
  children,
}: SortableThProps) {
  const [filterOpen, setFilterOpen] = React.useState(false);
  const sortable = Boolean(field && onSort);
  const isActive = sortable && activeField === field;

  const justify =
    align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";

  return (
    <th
      className={cn(
        "px-3 py-2.5 font-bold",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className,
      )}
      aria-sort={isActive ? (activeDir === "asc" ? "ascending" : "descending") : undefined}
    >
      <span className={cn("group inline-flex items-center gap-1", justify)}>
        {sortable ? (
          <button
            type="button"
            onClick={() => onSort?.(field as string)}
            className={cn(
              "inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-foreground",
              isActive && "text-foreground",
            )}
          >
            {children}
            {isActive ? (
              activeDir === "asc" ? (
                <ArrowUp className="h-3 w-3 shrink-0" />
              ) : (
                <ArrowDown className="h-3 w-3 shrink-0" />
              )
            ) : (
              <ArrowUpDown className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-40" />
            )}
          </button>
        ) : (
          <span className="uppercase tracking-wider">{children}</span>
        )}

        {filterContent && (
          <span className="relative inline-flex">
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              className={cn(
                "inline-flex items-center rounded p-0.5 transition-colors hover:text-foreground",
                filterActive ? "text-primary" : "opacity-40 hover:opacity-100",
              )}
              aria-label="Фильтр"
            >
              <Filter className={cn("h-3 w-3", filterActive && "fill-current")} />
            </button>
            {filterOpen && (
              <>
                {/* Click-away layer — closes the popover without a portal. */}
                <span
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setFilterOpen(false)}
                />
                <span
                  className={cn(
                    "absolute top-full z-50 mt-1 block min-w-[13rem] rounded-md border border-border",
                    "bg-card p-2 text-left font-normal normal-case tracking-normal shadow-lg",
                    align === "right" ? "right-0" : "left-0",
                  )}
                >
                  {filterContent}
                </span>
              </>
            )}
          </span>
        )}
      </span>
    </th>
  );
}
