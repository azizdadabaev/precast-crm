export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { loadTableDesignConfig, saveTableDesignConfig, DEFAULT_TABLE_DESIGN } from "@/lib/table-design-config";

const ColWidths = z.tuple([
  z.number(), z.number(), z.number(), z.number(), z.number(), z.number(),
  z.number(), z.number(), z.number(), z.number(), z.number(),
]);

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color (#rrggbb)");
const fontSize = z.number().min(4).max(32);
const fontWeight = z.number().min(100).max(900).multipleOf(100);
const padding = z.number().min(0).max(80);
const borderW = z.number().min(0).max(8);

const TableDesignSchema = z.object({
  // Brand
  brandName: z.string().min(1).max(80),
  brandTagline: z.string().max(80),
  brandPhone: z.string().max(40),
  brandDividerColor: hex,

  // Card
  cardWidth: z.number().min(600).max(1600),
  cardPaddingX: padding,
  cardPaddingY: padding,
  cardBg: hex,

  // Typography
  fontFamily: z.string().min(1),
  headerFontSize: fontSize,
  bodyFontSize: fontSize,
  footerFontSize: fontSize,
  headerFontWeight: fontWeight,
  bodyFontWeight: fontWeight,
  footerFontWeight: fontWeight,

  // Spacing
  headerRowPaddingY: z.number().min(0).max(24),
  bodyRowPaddingY: z.number().min(0).max(24),
  cellPaddingX: z.number().min(0).max(40),

  // Table bar
  tableBarBg: hex,
  tableBarText: hex,
  tableBarFontSize: fontSize,

  // Column header
  headerBg: hex,
  headerText: hex,

  // Body rows
  evenRowBg: hex,
  oddRowBg: hex,
  bodyText: hex,
  dimText: hex,
  nameCellColor: hex,
  nameCellWeight: fontWeight,

  // Accent
  accentColor: hex,
  subtotalColor: hex,

  // Footer
  footerBg: hex,
  footerText: hex,
  footerDividerWidth: borderW,

  // Borders
  borderColor: hex,
  rowDividerColor: hex,
  tableBorderWidth: borderW,

  // Columns
  colWidths: ColWidths,
});

/** GET /api/settings/table-design — returns current config (or defaults) */
export const GET = withPermission("order.view", async () => {
  const config = await loadTableDesignConfig();
  return ok(config);
});

/** PUT /api/settings/table-design — persist new config */
export const PUT = withPermission("pricing.edit", async (req: NextRequest) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body", 400);
  }

  const result = TableDesignSchema.safeParse(body);
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return fail(`Validation failed — ${msg}`, 400);
  }

  const config = result.data;
  const colSum = config.colWidths.reduce((a, b) => a + b, 0);
  if (Math.abs(colSum - 100) > 1) {
    return fail(`Column widths must sum to 100 (got ${colSum.toFixed(1)})`, 400);
  }

  await saveTableDesignConfig(config);
  return ok(config);
});

/** PATCH /api/settings/table-design — returns the hard-coded defaults (for Reset) */
export const PATCH = withPermission("pricing.edit", async () => {
  return ok(DEFAULT_TABLE_DESIGN);
});
