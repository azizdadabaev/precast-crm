import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ProjectCreateSchema } from "@/lib/validation";
import { ok, created, handler } from "@/lib/api";

export const GET = handler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get("dealId") ?? undefined;
  const projects = await prisma.project.findMany({
    where: { ...(dealId && { dealId }) },
    orderBy: { createdAt: "desc" },
    include: {
      calculations: { orderBy: { createdAt: "desc" }, take: 1 },
      deal: { include: { client: true } },
    },
  });
  return ok(projects);
});

import { calculateSlab } from "@/services/calculation-engine";

export const POST = handler(async (req: NextRequest) => {
  const body = ProjectCreateSchema.parse(await req.json());
  
  const project = await prisma.project.create({
    data: {
      dealId: body.dealId,
      name: body.name ?? null,
      shapeType: body.shapeType,
      dimensions: body.dimensions,
      calculations: body.calculations ? {
        create: body.calculations.map(calc => {
          const result = calculateSlab(
            { width: calc.width, length: calc.length },
            {},
            { extraBeams: calc.extraBeams, extraFillers: calc.extraFillers }
          );
          const area = calc.width * calc.length;
          return {
            name: calc.name,
            inputWidth: calc.width,
            inputLength: calc.length,
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
            pricePerM2: calc.pricePerM2,
            totalSum: calc.pricePerM2 ? area * calc.pricePerM2 : null,
            extraBeams: calc.extraBeams,
            extraFillers: calc.extraFillers,
          };
        })
      } : undefined
    },
  });

  // Auto-advance the deal stage if it's still in early state
  await prisma.deal.update({
    where: { id: body.dealId },
    data: { stage: "CALCULATION" },
  }).catch(() => null);

  return created(project);
});
