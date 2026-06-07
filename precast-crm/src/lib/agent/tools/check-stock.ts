// check_stock — read-only availability for a product line (spec §5).
//
// Returns a COARSE status the bot can verbalize ("in stock" / "limited" / "made
// to order, lead time applies") — deliberately NOT a raw count (so the model
// can't quote a number that may be stale) and NEVER a delivery date (promising a
// date is an escalation, spec §5). A line not found in inventory escalates.

import { z } from 'zod';
import {
  type AgentTool,
  type AgentToolContext,
  type AgentToolDefinition,
  type ToolResult,
  toolOk,
  toolEscalate,
} from './types';

export const CheckStockInput = z
  .object({
    line: z.enum(['floor', 'gazoblok']),
    kind: z.enum(['BEAM', 'BLOCK']).optional(), // floor only
    beam_length_m: z.coerce.number().positive().optional(), // floor BEAM only
    thickness_mm: z.coerce.number().positive().optional(), // gazoblok only
  })
  .refine((v) => v.line !== 'floor' || !!v.kind, {
    message: 'floor stock needs kind (BEAM or BLOCK)',
  })
  .refine((v) => !(v.line === 'floor' && v.kind === 'BEAM') || v.beam_length_m != null, {
    message: 'a BEAM needs beam_length_m',
  })
  .refine((v) => v.line !== 'gazoblok' || v.thickness_mm != null, {
    message: 'gazoblok stock needs thickness_mm',
  });
export type CheckStockInputType = z.infer<typeof CheckStockInput>;

export type Availability = 'in_stock' | 'low' | 'out_of_stock';

export interface StockData {
  line: 'floor' | 'gazoblok';
  item: string; // human label of what was checked, e.g. "BEAM 4.30m" / "gazoblok 200mm"
  availability: Availability;
  /** True unless fully in stock — the bot may say a lead time applies (never a date). */
  leadTimeApplies: boolean;
}

/** Map an on-hand quantity to a coarse availability bucket. */
export function availabilityFromQuantity(quantity: number, lowStockThreshold: number): Availability {
  if (quantity <= 0) return 'out_of_stock';
  if (quantity <= lowStockThreshold) return 'low';
  return 'in_stock';
}

/** Floor inventory row, Decimals already coerced to numbers. */
export interface FloorStockRow {
  kind: 'BEAM' | 'BLOCK';
  beamLengthM: number | null;
  quantity: number;
  lowStockThreshold: number;
}
/** Gazoblok stock row, derived from catalog + its one-to-one stock. */
export interface GazoblokStockRow {
  thicknessMm: number;
  label: string;
  quantity: number;
  lowStockThreshold: number;
}

export interface CheckStockDeps {
  floor: FloorStockRow[];
  gazoblok: GazoblokStockRow[];
}

function sameBeamLength(a: number | null, b: number): boolean {
  return a != null && Math.round(a * 100) === Math.round(b * 100);
}

/**
 * Pure core: resolve the requested line item and report its coarse availability.
 * A row that isn't tracked escalates (we never assert availability we can't see).
 */
export function runCheckStock(raw: unknown, deps: CheckStockDeps): ToolResult<StockData> {
  const parsed = CheckStockInput.safeParse(raw);
  if (!parsed.success) return toolEscalate('invalid stock request');
  const i = parsed.data;

  if (i.line === 'floor') {
    const row =
      i.kind === 'BLOCK'
        ? deps.floor.find((r) => r.kind === 'BLOCK')
        : deps.floor.find((r) => r.kind === 'BEAM' && sameBeamLength(r.beamLengthM, i.beam_length_m as number));
    if (!row) return toolEscalate('this floor item is not tracked in inventory — escalate');
    const availability = availabilityFromQuantity(row.quantity, row.lowStockThreshold);
    return toolOk({
      line: 'floor',
      item: i.kind === 'BLOCK' ? 'BLOCK (infill)' : `BEAM ${(i.beam_length_m as number).toFixed(2)}m`,
      availability,
      leadTimeApplies: availability !== 'in_stock',
    });
  }

  // gazoblok
  const wantMm = Math.round(i.thickness_mm as number);
  const row = deps.gazoblok.find((r) => r.thicknessMm === wantMm);
  if (!row) return toolEscalate('no gazoblok size matches that thickness — escalate');
  const availability = availabilityFromQuantity(row.quantity, row.lowStockThreshold);
  return toolOk({
    line: 'gazoblok',
    item: `gazoblok ${row.label} (${wantMm}mm)`,
    availability,
    leadTimeApplies: availability !== 'in_stock',
  });
}

async function loadStockDeps(): Promise<CheckStockDeps> {
  const { prisma } = await import('@/lib/prisma');
  const [floorRows, gazoblokRows] = await Promise.all([
    prisma.inventoryItem.findMany(),
    prisma.gazoblokProduct.findMany({ where: { active: true }, include: { stock: true } }),
  ]);
  return {
    floor: floorRows.map((r) => ({
      kind: r.kind as 'BEAM' | 'BLOCK',
      beamLengthM: r.beamLength == null ? null : Number(r.beamLength),
      quantity: r.quantity,
      lowStockThreshold: r.lowStockThreshold,
    })),
    gazoblok: gazoblokRows.map((r) => ({
      thicknessMm: Math.round(Number(r.thicknessM) * 1000),
      label: r.label,
      quantity: r.stock?.quantity ?? 0,
      lowStockThreshold: r.lowStockThreshold,
    })),
  };
}

export const checkStockDefinition: AgentToolDefinition = {
  name: 'check_stock',
  description:
    'Check current availability of a product so you can say whether it is in ' +
    'stock or a lead time applies — WITHOUT inventing a number. For floor, set ' +
    'line="floor" and kind=BEAM (with beam_length_m, from a quote) or kind=BLOCK. ' +
    'For wall blocks, set line="gazoblok" and thickness_mm. Returns a coarse ' +
    'availability (in_stock / low / out_of_stock) only. NEVER promise a delivery ' +
    'DATE and never state an exact quantity — if a customer needs a firm date or ' +
    'a quantity guarantee, escalate.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['line'],
    properties: {
      line: { type: 'string', enum: ['floor', 'gazoblok'] },
      kind: { type: 'string', enum: ['BEAM', 'BLOCK'], description: 'Floor only.' },
      beam_length_m: { type: 'number', description: 'Floor BEAM only — manufactured length in meters.' },
      thickness_mm: { type: 'number', description: 'Gazoblok only — block/wall thickness in millimetres.' },
    },
  },
};

export const checkStockTool: AgentTool<StockData> = {
  definition: checkStockDefinition,
  async execute(rawInput, _ctx?: AgentToolContext) {
    const deps = await loadStockDeps();
    return runCheckStock(rawInput, deps);
  },
};
