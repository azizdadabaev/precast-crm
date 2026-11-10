"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/gazoblok-history";

export const ICON = { strokeWidth: 1.75 } as const;

/** Sentence-case pill (12/700) — no uppercase, so Cyrillic «Қ» never falls back to another font. */
export const PILL_TONE: Record<Tone | "outline", string> = {
  primary: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success",
  destructive: "bg-destructive/[.12] text-destructive",
  warning: "bg-warning/15 text-warning",
  muted: "bg-muted text-muted-foreground",
  outline: "border border-border bg-card text-foreground font-semibold",
};

export function Pill({ tone, icon, children, className }: { tone: Tone | "outline"; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-bold [&_svg]:h-3.5 [&_svg]:w-3.5",
        PILL_TONE[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Round timeline / row icon tile. */
export const TILE_TONE: Record<Tone, string> = {
  primary: "bg-primary/[.12] text-primary border-transparent",
  success: "bg-success/15 text-success border-transparent",
  destructive: "bg-destructive/[.12] text-destructive border-transparent",
  warning: "bg-warning/15 text-warning border-transparent",
  muted: "bg-card text-muted-foreground border-border",
};

export const TEXT_TONE: Record<Tone, string> = {
  primary: "text-primary",
  success: "text-success",
  destructive: "text-destructive",
  warning: "text-warning",
  muted: "text-muted-foreground",
};

/** Buttons of the page: 44 px on touch, 40 px from md. */
export const BTN = "inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-md px-3.5 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-[40px] [&_svg]:h-4 [&_svg]:w-4";
export const BTN_OUTLINE = cn(BTN, "border border-border bg-card text-foreground hover:bg-surface-hover");
export const BTN_PRIMARY = cn(BTN, "bg-primary text-primary-foreground hover:bg-primary-hover");
export const BTN_GHOST = cn(BTN, "px-2 text-muted-foreground hover:text-foreground");

/** Bar segments: delivered (success), on the road (primary), over-load (destructive) over a muted track. */
export function SegBar({
  bar,
  small,
  className,
}: {
  bar: { delivered: number; onRoad: number; left: number; over: number };
  small?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex overflow-hidden rounded-full bg-muted", small ? "h-1.5" : "h-2.5", className)} aria-hidden="true">
      <span className="h-full bg-success" style={{ width: `${bar.delivered}%` }} />
      <span className="h-full bg-primary" style={{ width: `${bar.onRoad}%` }} />
      <span className="h-full" style={{ width: `${bar.left}%` }} />
      <span className="h-full bg-destructive" style={{ width: `${bar.over}%` }} />
    </div>
  );
}
