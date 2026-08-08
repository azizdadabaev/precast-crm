import type { CSSProperties } from "react";
import type {
  DraftsTableDesignConfig,
  DraftsTablePalette,
} from "@/lib/drafts-table-design";

/**
 * Translate a saved drafts-table design into the CSS custom properties the
 * `.drafts-table` rules in globals.css read.
 *
 * Lives here (rather than in either consumer) so the designer's live preview
 * and the real /projects table are guaranteed to render from the same mapping.
 *
 * The light/dark choice is resolved in JS instead of a `[data-theme]` CSS
 * block because both palettes are user DATA, not stylesheet constants — CSS
 * has nothing to switch on. Everything downstream of these variables is plain
 * CSS, so a theme flip only swaps this one style object.
 */
export function draftsTableStyleVars(
  config: DraftsTableDesignConfig,
  isDark: boolean,
): CSSProperties {
  const p: DraftsTablePalette = isDark ? config.dark : config.light;
  return {
    "--dt-font-family": config.fontFamily,
    "--dt-header-font-size": `${config.headerFontSize}px`,
    "--dt-body-font-size": `${config.bodyFontSize}px`,
    "--dt-header-font-weight": String(config.headerFontWeight),
    "--dt-body-font-weight": String(config.bodyFontWeight),
    "--dt-header-py": `${config.headerRowPaddingY}px`,
    "--dt-body-py": `${config.bodyRowPaddingY}px`,
    "--dt-cell-px": `${config.cellPaddingX}px`,
    "--dt-header-bg": p.headerBg,
    "--dt-header-text": p.headerText,
    "--dt-even-row-bg": p.evenRowBg,
    "--dt-odd-row-bg": p.oddRowBg,
    "--dt-body-text": p.bodyText,
    "--dt-muted-text": p.mutedText,
    "--dt-border": p.borderColor,
    "--dt-accent-text": p.accentText,
    // React's CSSProperties has no index signature for custom properties.
  } as CSSProperties;
}
