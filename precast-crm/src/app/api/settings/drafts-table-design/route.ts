export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import {
  loadDraftsTableDesign,
  saveDraftsTableDesign,
  DEFAULT_DRAFTS_TABLE_DESIGN,
  DRAFTS_COLUMN_KEYS,
} from "@/lib/drafts-table-design";

// Same permission split as the share-card designer: anyone who can view orders
// may READ the layout (every operator's table renders from it), but only
// pricing.edit may CHANGE it — it's an owner-level presentation decision.

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color (#rrggbb)");

const PaletteSchema = z.object({
  headerBg: hex,
  headerText: hex,
  evenRowBg: hex,
  oddRowBg: hex,
  bodyText: hex,
  mutedText: hex,
  borderColor: hex,
  accentText: hex,
});

const ColumnSchema = z.object({
  key: z.enum(DRAFTS_COLUMN_KEYS),
  visible: z.boolean(),
  width: z.number().min(0).max(100),
});

const DraftsTableDesignSchema = z.object({
  columns: z.array(ColumnSchema).min(1).max(DRAFTS_COLUMN_KEYS.length),

  fontFamily: z.string().min(1).max(120),
  headerFontSize: z.number().min(8).max(24),
  bodyFontSize: z.number().min(8).max(24),
  headerFontWeight: z.number().min(100).max(900).multipleOf(100),
  bodyFontWeight: z.number().min(100).max(900).multipleOf(100),

  headerRowPaddingY: z.number().min(0).max(40),
  bodyRowPaddingY: z.number().min(0).max(40),
  cellPaddingX: z.number().min(0).max(40),

  light: PaletteSchema,
  dark: PaletteSchema,
});

export const GET = withPermission("order.view", async () => {
  return ok(await loadDraftsTableDesign());
});

export const PUT = withPermission("pricing.edit", async (req: NextRequest) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body", 400);
  }

  const parsed = DraftsTableDesignSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return fail(`Validation failed — ${msg}`, 400);
  }
  const config = parsed.data;

  // No duplicate columns — a repeated key would render the same cell twice and
  // silently drop another column.
  const keys = config.columns.map((c) => c.key);
  if (new Set(keys).size !== keys.length) {
    return fail("Duplicate column keys are not allowed", 400);
  }

  // Only VISIBLE columns carry layout width, so only they must sum to 100.
  // Same ±1% tolerance the share-card designer uses.
  const visibleSum = config.columns
    .filter((c) => c.visible)
    .reduce((s, c) => s + c.width, 0);
  if (config.columns.some((c) => c.visible) && Math.abs(visibleSum - 100) > 1) {
    return fail(
      `Кўринадиган устунлар эни 100% бўлиши керак (ҳозир ${visibleSum.toFixed(1)}) · Visible column widths must sum to 100`,
      400,
    );
  }

  await saveDraftsTableDesign(config);
  return ok(config);
});

/** Reset to defaults — returns them without persisting, mirroring table-design. */
export const PATCH = withPermission("pricing.edit", async () => {
  return ok(DEFAULT_DRAFTS_TABLE_DESIGN);
});
