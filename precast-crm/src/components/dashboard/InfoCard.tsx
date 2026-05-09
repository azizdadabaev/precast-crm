"use client";

import type { ReactNode } from "react";

interface Props {
  title: ReactNode;
  children: ReactNode;
}

/**
 * The wider, denser dashboard card used by the Business Insights row
 * (cards 9–11). White background, more detail, holds inline SVGs and
 * lists. Class definitions live in `globals.css`.
 */
export function InfoCard({ title, children }: Props) {
  return (
    <article className="ds-info-card">
      <h3 className="ds-info-card-title">{title}</h3>
      {children}
    </article>
  );
}
