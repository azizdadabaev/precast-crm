export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { CalculateRequestSchema } from "@/lib/validation";
import { ok, fail, handler } from "@/lib/api";
import { calculateSlab, type Pattern } from "@/services/calculation-engine";

export const POST = handler(async (req: NextRequest) => {
  const body = CalculateRequestSchema.parse(await req.json());

  const result = calculateSlab({
    inner_width: body.innerWidth,
    inner_length: body.innerLength,
    bearing: body.bearing,
    correction: body.correction,
    extra_beams: body.extraBeams,
    force_start_beam: body.forceStartBeam,
    pattern: body.patternOverride ?? undefined,
  });

  if (body.projectId) {
    const exists = await prisma.project.findUnique({ where: { id: body.projectId } });
    if (!exists) return fail("Project not found", 404);

    const saved = await prisma.calculation.create({
      data: {
        projectId: body.projectId,
        name: body.name ?? null,
        innerWidth: result.inner_width,
        innerLength: result.inner_length,
        bearing: result.bearing,
        correction: result.correction,
        extraBeams: result.extra_beams,
        forceStartBeam: result.force_start_beam,
        patternOverride: (body.patternOverride ?? null) as Pattern | null,
        pitches: result.pitches,
        remainder: result.remainder,
        pattern: result.pattern,
        patternAuto: result.pattern_auto,
        beamLength: result.beam_length,
        blocksPerRow: result.blocks_per_row,
        beamCount: result.beam_count,
        blockRows: result.block_rows,
        totalBlocks: result.total_blocks,
        monolithLength: result.monolith_length,
        billedLength: result.billed_length,
        monolithArea: result.monolith_area,
        billedArea: result.billed_area,
        concreteVolume: result.concrete_volume,
        m2Price: result.m2_price,
        extraBeamPricePerM: result.extra_beam_price_per_m,
        m2Cost: result.m2_cost,
        patternExtraCost: result.pattern_extra_cost,
        manualExtraBeamsCost: result.manual_extra_beams_cost,
        subtotal: result.subtotal,
      },
    });
    return ok({ ...result, persistedId: saved.id });
  }

  return ok(result);
});
