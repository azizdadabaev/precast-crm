import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { CalculateRequestSchema } from "@/lib/validation";
import { ok, fail, handler } from "@/lib/api";
import {
  calculateSlab,
  calculateMultiSpan,
  type SlabResult,
  type CalculationConstants,
} from "@/services/calculation-engine";

export const POST = handler(async (req: NextRequest) => {
  const body = CalculateRequestSchema.parse(await req.json());

  const overrides: Partial<CalculationConstants> = {};
  if (body.toleranceOverride !== undefined) overrides.TOLERANCE = body.toleranceOverride;
  if (body.toppingOverride !== undefined) overrides.TOPPING_THICKNESS = body.toppingOverride;

  let result: SlabResult;

  if (body.shapeType === "RECTANGULAR") {
    if (body.width === undefined) return fail("width is required for RECTANGULAR shape", 422);
    result = calculateSlab({ width: body.width, length: body.length }, overrides);
  } else {
    if (!body.widths || body.widths.length === 0) {
      return fail("widths[] is required for TRAPEZOIDAL/IRREGULAR shapes", 422);
    }
    result = calculateMultiSpan({ length: body.length, widths: body.widths }, overrides);
  }

  // Persist if a project is provided
  if (body.projectId) {
    const exists = await prisma.project.findUnique({ where: { id: body.projectId } });
    if (!exists) return fail("Project not found", 404);

    const area = (body.width ?? 0) * body.length;
    const totalSum = body.pricePerM2 ? area * body.pricePerM2 : undefined;

    const saved = await prisma.calculation.create({
      data: {
        projectId: body.projectId,
        name: body.name,
        inputWidth: body.width ?? Math.max(...(body.widths ?? [0])),
        inputLength: body.length,
        beamLength: result.beam_length,
        rowsInitial: result.rows_initial,
        rowsFinal: result.rows_final,
        beamCount: result.beam_count,
        beamGroups: result.beam_groups,
        blocksPerRow: result.blocks_per_row,
        totalBlocks: result.total_blocks,
        actualLength: result.actual_length,
        correctedLength: result.corrected_length,
        coveredArea: result.covered_area,
        delta: result.delta,
        concreteVolume: result.concrete_volume,
        constants: result.constants,
        pricePerM2: body.pricePerM2,
        totalSum: totalSum,
      },
    });
    return ok({ ...result, persistedId: saved.id });
  }

  return ok(result);
});
