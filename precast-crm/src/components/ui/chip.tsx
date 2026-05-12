import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Status chip — small pill with a colored background tint, matching
 * colored text, and a colored hairline border. Used for order status,
 * payment state, role badges, customization indicators, etc.
 *
 * Anatomy mirrors `docs/design/etalon-ui.jsx → <Chip>`:
 *   - bg: `{color}` at ~9-10% opacity
 *   - text: `{color}` at full saturation
 *   - border: `{color}` at ~30% opacity
 *   - font: JetBrains Mono, 10px, 700, uppercase, 0.06em tracking
 *   - padding: 3px 10px; radius: 9999 (full pill)
 *
 * Variants map to the semantic tokens defined in globals.css:
 *   - `default` (accent/blue) for neutral state
 *   - `success` (emerald) for paid, confirmed, in-stock
 *   - `warning` (amber) for pending, drafts, awaiting
 *   - `danger` (red) for shortfall, open discrepancy
 *   - `gold` for production milestones
 *   - `neutral` for muted secondary state (Custom badge, etc.)
 *
 * Accepts children so a leading glyph (e.g. ⏳ ✓ ●) can be inlined
 * inside the label — matches the etalon STATUS_MAP convention.
 */
const chipVariants = cva(
  "inline-flex items-center gap-1 rounded-full font-mono font-bold uppercase tracking-wider whitespace-nowrap leading-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary/10 text-primary border border-primary/30",
        success:
          "bg-success/10 text-success border border-success/30",
        warning:
          "bg-warning/10 text-warning border border-warning/30",
        danger:
          "bg-destructive/10 text-destructive border border-destructive/30",
        gold:
          "bg-gold/10 text-gold border border-gold/30",
        neutral:
          "bg-muted text-muted-foreground border border-border",
      },
      size: {
        sm: "px-2 py-0.5 text-[10px]",
        md: "px-2.5 py-1 text-[11px]",
      },
    },
    defaultVariants: { variant: "default", size: "sm" },
  },
);

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof chipVariants> {}

export const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(
  function Chip({ className, variant, size, ...props }, ref) {
    return (
      <span
        ref={ref}
        className={cn(chipVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
