"use client";

import type { MouseEventHandler, ReactNode } from "react";

type Variant = "standard" | "success" | "warning" | "critical";

interface Props {
  variant?: Variant;
  /** Big-number content. Pre-formatted; the component just renders it. */
  value: ReactNode;
  /** First-line label (uppercase Cyrillic / English). */
  label: ReactNode;
  /** Optional second line, rendered smaller and dimmer. */
  sublabel?: ReactNode;
  /** When set, the card becomes clickable + the affordance hover effect. */
  onClick?: MouseEventHandler<HTMLElement>;
}

/**
 * The standard dashboard metric card — gradient background, big number,
 * tiny label below. The variant controls the gradient + shadow color.
 *
 * The actual styling is in `globals.css` under `.ds-metric-card` and its
 * `is-success` / `is-warning` / `is-critical` modifiers, sourced from the
 * design system spec (Step 4 of the dashboard rebuild PR).
 */
export function MetricCard({
  variant = "standard",
  value,
  label,
  sublabel,
  onClick,
}: Props) {
  const cls = [
    "ds-metric-card",
    variant === "success" && "is-success",
    variant === "warning" && "is-warning",
    variant === "critical" && "is-critical",
    onClick && "is-clickable",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <article
      className={cls}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(e as unknown as React.MouseEvent<HTMLElement>);
              }
            }
          : undefined
      }
    >
      <div className="ds-metric-value">{value}</div>
      <div className="ds-metric-label">
        {label}
        {sublabel && (
          <>
            <br />
            <small>{sublabel}</small>
          </>
        )}
      </div>
    </article>
  );
}
