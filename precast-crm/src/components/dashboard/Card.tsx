"use client";

import type { MouseEventHandler, ReactNode } from "react";

type Attention = "none" | "danger" | "warning";

interface Props {
  /** Small uppercase label above the value. */
  label: ReactNode;
  /** Optional content rendered on the right of the header (typically a TrendIndicator). */
  headerRight?: ReactNode;
  /** Big-number content. Pre-formatted; the component just renders it. */
  value: ReactNode;
  /** Optional unit beside the value (e.g. "UZS"). Tertiary color. */
  unit?: ReactNode;
  /** Footer line below the value. Tertiary color. */
  meta?: ReactNode;
  /**
   * Attention treatment — adds a 3px left border in danger or warning
   * color. The card body itself stays white. This is the ONLY chromatic
   * accent on a row 1-2 card; everything else is neutral.
   */
  attention?: Attention;
  /** When set, the card becomes clickable + the affordance hover effect. */
  onClick?: MouseEventHandler<HTMLElement>;
  /**
   * For cards 9-11 — taller layout, fills with a chart or a list.
   * Replaces the value/meta render with the children.
   */
  wide?: boolean;
  children?: ReactNode;
}

/**
 * The dashboard's KPI card primitive. White surface, hairline border,
 * left-aligned label/value/meta. Variants are minimal: optional 3px
 * left border for attention, optional `wide` mode for the larger
 * Business Insights row that holds charts and lists.
 */
export function Card({
  label,
  headerRight,
  value,
  unit,
  meta,
  attention = "none",
  onClick,
  wide = false,
  children,
}: Props) {
  const cls = [
    "dash-card",
    wide && "dash-card-wide",
    onClick && "is-clickable",
    attention === "danger" && "is-attention",
    attention === "warning" && "is-attention-warning",
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
      <div className="dash-card-header">
        <span className="dash-card-label">{label}</span>
        {headerRight}
      </div>
      {wide ? (
        children
      ) : (
        <>
          <div className="dash-card-value">
            {value}
            {unit && <span className="dash-card-unit">{unit}</span>}
          </div>
          {meta && <div className="dash-card-meta">{meta}</div>}
        </>
      )}
    </article>
  );
}
