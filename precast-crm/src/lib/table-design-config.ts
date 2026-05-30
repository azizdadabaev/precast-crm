import { prisma } from "@/lib/prisma";

const APP_CONFIG_KEY = "table.design";

/**
 * Complete visual configuration for the CalculationShareCard export image.
 * Stored as a single AppConfig JSON row (no migration needed).
 * Every property maps directly to an inline style — html-to-image
 * captures inline styles reliably, even when Tailwind classes are purged.
 *
 * Column index map for colWidths (11 values, must sum to ~100):
 *   0 Хона (Name)          6 Жами Ғ (Total Blocks)
 *   1 Эни (Width m)        7 Балка (Beam count)
 *   2 Бўйи (Length m)      8 Майдон (Area m²)
 *   3 Шаблон (Pattern)     9 м² нархи (Price/m²)
 *   4 Балка (Beam length) 10 Сумма (Subtotal)
 *   5 Ғ/қатор (Blk/Row)
 */
export interface TableDesignConfig {
  // ── Brand header ─────────────────────────────────────────
  brandName: string;
  brandTagline: string;
  brandPhone: string;
  brandDividerColor: string;  // bottom border of brand bar

  // ── Card dimensions ──────────────────────────────────────
  cardWidth: number;          // px — default 1100
  cardPaddingX: number;       // px — default 32
  cardPaddingY: number;       // px — default 32
  cardBg: string;             // background of the whole card

  // ── Typography ───────────────────────────────────────────
  fontFamily: string;
  headerFontSize: number;     // th cells, px
  bodyFontSize: number;       // td cells, px
  footerFontSize: number;     // tfoot cells, px
  headerFontWeight: number;   // 100 | 200 | … | 900
  bodyFontWeight: number;
  footerFontWeight: number;

  // ── Spacing ──────────────────────────────────────────────
  headerRowPaddingY: number;  // th top+bottom, px
  bodyRowPaddingY: number;    // td top+bottom, px
  cellPaddingX: number;       // all cells left+right, px

  // ── Table section header bar ─────────────────────────────
  // "Ҳисоб-китоб хулосаси" bar above thead
  tableBarBg: string;
  tableBarText: string;
  tableBarFontSize: number;   // px

  // ── Column header (thead) ─────────────────────────────────
  headerBg: string;
  headerText: string;

  // ── Body rows ────────────────────────────────────────────
  evenRowBg: string;
  oddRowBg: string;
  bodyText: string;           // default body text color
  dimText: string;            // muted/secondary values (unit labels, auto-pattern)
  nameCellColor: string;      // room name column text
  nameCellWeight: number;     // room name font weight

  // ── Accent / data colors ─────────────────────────────────
  accentColor: string;        // beam length column text
  subtotalColor: string;      // subtotal column + footer total

  // ── Footer (totals row) ───────────────────────────────────
  footerBg: string;
  footerText: string;
  footerDividerWidth: number; // top border of footer row, px

  // ── Borders ──────────────────────────────────────────────
  borderColor: string;        // card + table outer border
  rowDividerColor: string;    // border-bottom on body rows (can be lighter than borderColor)
  tableBorderWidth: number;   // table outer border px

  // ── Column widths ─────────────────────────────────────────
  colWidths: [
    number, number, number, number, number, number,
    number, number, number, number, number,
  ];
}

export const DEFAULT_TABLE_DESIGN: TableDesignConfig = {
  brandName: "EtalonSlabs",
  brandTagline: "Yig'ma monolit",
  brandPhone: "+998 93 481 33 30",
  brandDividerColor: "#1e293b",

  cardWidth: 1100,
  cardPaddingX: 32,
  cardPaddingY: 32,
  cardBg: "#ffffff",

  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  headerFontSize: 7,
  bodyFontSize: 8,
  footerFontSize: 10,
  headerFontWeight: 600,
  bodyFontWeight: 400,
  footerFontWeight: 700,

  headerRowPaddingY: 5,
  bodyRowPaddingY: 5,
  cellPaddingX: 12,

  tableBarBg: "#f8fafc",
  tableBarText: "#475569",
  tableBarFontSize: 9,

  headerBg: "#f1f5f9",
  headerText: "#475569",

  evenRowBg: "#ffffff",
  oddRowBg: "#f8fafc",
  bodyText: "#111827",
  dimText: "#64748b",
  nameCellColor: "#1e293b",
  nameCellWeight: 500,

  accentColor: "#047857",
  subtotalColor: "#047857",

  footerBg: "#f1f5f9",
  footerText: "#374151",
  footerDividerWidth: 2,

  borderColor: "#e2e8f0",
  rowDividerColor: "#f1f5f9",
  tableBorderWidth: 1,

  colWidths: [12, 7, 7, 10, 8, 7, 7, 7, 9, 11, 15],
};

function isValidConfig(v: unknown): v is TableDesignConfig {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.brandName === "string" &&
    typeof o.fontFamily === "string" &&
    typeof o.headerFontSize === "number" &&
    typeof o.bodyFontSize === "number" &&
    typeof o.footerFontSize === "number" &&
    typeof o.cardWidth === "number" &&
    typeof o.cardBg === "string" &&
    typeof o.headerBg === "string" &&
    Array.isArray(o.colWidths) &&
    (o.colWidths as unknown[]).length === 11 &&
    (o.colWidths as unknown[]).every((x) => typeof x === "number")
  );
}

export async function loadTableDesignConfig(): Promise<TableDesignConfig> {
  const row = await prisma.appConfig.findUnique({ where: { key: APP_CONFIG_KEY } });
  if (!row || !isValidConfig(row.value)) return DEFAULT_TABLE_DESIGN;
  // Merge with defaults so new fields added later get their default values
  // on existing installations that were saved before the field existed.
  return { ...DEFAULT_TABLE_DESIGN, ...(row.value as TableDesignConfig) };
}

export async function saveTableDesignConfig(config: TableDesignConfig): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key: APP_CONFIG_KEY },
    create: { key: APP_CONFIG_KEY, value: config as unknown as object },
    update: { value: config as unknown as object },
  });
}
