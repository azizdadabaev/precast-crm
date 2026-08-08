import { prisma } from "@/lib/prisma";

const APP_CONFIG_KEY = "drafts.table.design";

/**
 * Visual configuration for the SAVED DRAFTS table (/projects).
 *
 * Mirrors the share-card designer (`table-design-config.ts`) so the owner gets
 * the same level of control, with two deliberate differences driven by the fact
 * that this is a live on-screen table rather than an exported PNG:
 *
 *  1. COLUMNS are configurable (visibility, order, width). The drafts table has
 *     11 data columns and operators care about different subsets; the share card
 *     has a fixed column set.
 *  2. COLORS come in LIGHT and DARK palettes. The PNG is always rendered on a
 *     white card, but this table lives in a themed app — a single hard-coded
 *     palette would be unreadable in one of the two modes.
 *
 * Stored as a single AppConfig JSON row, so adding a field later needs no
 * migration (loader merges over defaults).
 */

/** Stable identifiers for the drafts table's data columns. */
export const DRAFTS_COLUMN_KEYS = [
  "client",
  "phone",
  "address",
  "rooms",
  "slabL",
  "area",
  "weight",
  "subtotal",
  "status",
  "updated",
  "operator",
] as const;

export type DraftsColumnKey = (typeof DRAFTS_COLUMN_KEYS)[number];

export interface DraftsColumn {
  key: DraftsColumnKey;
  visible: boolean;
  /** Percent of table width. Visible columns must sum to ~100. */
  width: number;
}

/** One theme's colors. Every value is a 6-digit hex. */
export interface DraftsTablePalette {
  headerBg: string;
  headerText: string;
  evenRowBg: string;
  oddRowBg: string;
  bodyText: string;
  mutedText: string;
  borderColor: string;
  /** Money / emphasis color (Сумма column). */
  accentText: string;
}

export interface DraftsTableDesignConfig {
  /** Ordered. Array order IS the column order in the table. */
  columns: DraftsColumn[];

  fontFamily: string;
  headerFontSize: number;
  bodyFontSize: number;
  headerFontWeight: number;
  bodyFontWeight: number;

  headerRowPaddingY: number;
  bodyRowPaddingY: number;
  cellPaddingX: number;

  light: DraftsTablePalette;
  dark: DraftsTablePalette;
}

const LIGHT: DraftsTablePalette = {
  headerBg: "#f1f5f9",
  headerText: "#64748b",
  evenRowBg: "#ffffff",
  oddRowBg: "#f8fafc",
  bodyText: "#0f172a",
  mutedText: "#64748b",
  borderColor: "#e2e8f0",
  accentText: "#16a34a",
};

const DARK: DraftsTablePalette = {
  headerBg: "#1e293b",
  headerText: "#94a3b8",
  evenRowBg: "#0b1220",
  oddRowBg: "#111c2e",
  bodyText: "#e2e8f0",
  mutedText: "#94a3b8",
  borderColor: "#1e293b",
  accentText: "#4ade80",
};

/** Widths sum to 100. */
export const DEFAULT_DRAFTS_TABLE_DESIGN: DraftsTableDesignConfig = {
  columns: [
    { key: "client", visible: true, width: 16 },
    { key: "phone", visible: true, width: 12 },
    { key: "address", visible: true, width: 18 },
    { key: "rooms", visible: true, width: 6 },
    { key: "slabL", visible: true, width: 8 },
    { key: "area", visible: true, width: 8 },
    { key: "weight", visible: true, width: 8 },
    { key: "subtotal", visible: true, width: 10 },
    { key: "status", visible: true, width: 6 },
    { key: "updated", visible: true, width: 4 },
    { key: "operator", visible: true, width: 4 },
  ],
  fontFamily: "inherit",
  headerFontSize: 11,
  bodyFontSize: 13,
  headerFontWeight: 700,
  bodyFontWeight: 400,
  headerRowPaddingY: 8,
  bodyRowPaddingY: 8,
  cellPaddingX: 12,
  light: LIGHT,
  dark: DARK,
};

function isPalette(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.headerBg === "string" &&
    typeof p.headerText === "string" &&
    typeof p.evenRowBg === "string" &&
    typeof p.bodyText === "string" &&
    typeof p.borderColor === "string"
  );
}

function isValidConfig(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    Array.isArray(o.columns) &&
    (o.columns as unknown[]).every((c) => {
      if (!c || typeof c !== "object") return false;
      const col = c as Record<string, unknown>;
      return (
        typeof col.key === "string" &&
        DRAFTS_COLUMN_KEYS.includes(col.key as DraftsColumnKey) &&
        typeof col.visible === "boolean" &&
        typeof col.width === "number"
      );
    }) &&
    typeof o.headerFontSize === "number" &&
    typeof o.bodyFontSize === "number" &&
    isPalette(o.light) &&
    isPalette(o.dark)
  );
}

/**
 * Reconcile a stored column list against the canonical key set: unknown keys are
 * dropped and newly-added columns are appended (visible), so shipping a new
 * column never leaves an old saved config rendering a broken table.
 */
function reconcileColumns(stored: DraftsColumn[]): DraftsColumn[] {
  const seen = new Set<string>();
  const kept = stored.filter((c) => {
    if (!DRAFTS_COLUMN_KEYS.includes(c.key) || seen.has(c.key)) return false;
    seen.add(c.key);
    return true;
  });
  const missing = DEFAULT_DRAFTS_TABLE_DESIGN.columns.filter((c) => !seen.has(c.key));
  return [...kept, ...missing];
}

export async function loadDraftsTableDesign(): Promise<DraftsTableDesignConfig> {
  const row = await prisma.appConfig.findUnique({ where: { key: APP_CONFIG_KEY } });
  if (!row || !isValidConfig(row.value)) return DEFAULT_DRAFTS_TABLE_DESIGN;
  const stored = row.value as unknown as DraftsTableDesignConfig;
  return {
    ...DEFAULT_DRAFTS_TABLE_DESIGN,
    ...stored,
    light: { ...DEFAULT_DRAFTS_TABLE_DESIGN.light, ...stored.light },
    dark: { ...DEFAULT_DRAFTS_TABLE_DESIGN.dark, ...stored.dark },
    columns: reconcileColumns(stored.columns),
  };
}

export async function saveDraftsTableDesign(config: DraftsTableDesignConfig): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key: APP_CONFIG_KEY },
    create: { key: APP_CONFIG_KEY, value: config as unknown as object },
    update: { value: config as unknown as object },
  });
}
