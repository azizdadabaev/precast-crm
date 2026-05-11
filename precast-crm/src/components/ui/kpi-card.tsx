import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Dashboard KPI card — mirrors `docs/design/etalon-ui.jsx → <KpiCard>`.
 *
 * Anatomy:
 *   ┌────────────────────────────────────────┐
 *   │ LABEL  (uppercase, tracked, secondary)  │  ← trendPill (top-right)
 *   │                                         │
 *   │ 127 450 000 UZS    (big mono number)    │
 *   │                                         │
 *   │ vs 113.5M last month  (caption)         │
 *   └────────────────────────────────────────┘
 *
 * Accent prop tints the left edge for attention states:
 *   - `attention="danger"`  → red 3px left border
 *   - `attention="warning"` → amber 3px left border
 *   - default               → standard hairline border
 */
type Attention = "none" | "danger" | "warning";

export interface KpiCardProps {
  /** Uppercase secondary-text title (e.g. "REVENUE · THIS MONTH"). */
  label: string;
  /** The big number itself — accepts ReactNode so callers can mix
   *  formatted numbers with a small unit. */
  value: React.ReactNode;
  /** Small caption below the value (e.g. "vs 113.5M last month"). */
  caption?: React.ReactNode;
  /** Top-right slot — typically a <Chip variant="success">↗ +12.4%</Chip>. */
  trend?: React.ReactNode;
  /** Visual emphasis state. Drops a 3px left border in the matching color. */
  attention?: Attention;
  className?: string;
  onClick?: () => void;
}

export function KpiCard({
  label,
  value,
  caption,
  trend,
  attention = "none",
  className,
  onClick,
}: KpiCardProps) {
  const attentionClass =
    attention === "danger"
      ? "border-l-[3px] border-l-destructive"
      : attention === "warning"
        ? "border-l-[3px] border-l-warning"
        : "";

  const clickable = onClick != null;

  return (
    <div
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        "bg-card border border-border rounded-lg p-5 transition-colors",
        clickable && "cursor-pointer hover:border-border-strong",
        attentionClass,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        {trend ? <div className="shrink-0">{trend}</div> : null}
      </div>
      <div className="text-2xl font-bold tabular-nums tracking-tight text-foreground leading-tight font-mono">
        {value}
      </div>
      {caption ? (
        <div className="mt-2 text-xs text-text-tertiary">{caption}</div>
      ) : null}
    </div>
  );
}
