export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ProjectCreateSchema } from "@/lib/validation";
import { ok, created, handler } from "@/lib/api";
import { calculateSlab, type Pattern } from "@/services/calculation-engine";

export const GET = handler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get("dealId") ?? undefined;
  const projects = await prisma.project.findMany({
    where: { ...(dealId && { dealId }) },
    orderBy: { createdAt: "desc" },
    include: {
      calculations: { orderBy: { createdAt: "desc" } },
      deal: { include: { client: true } },
    },
  });
  return ok(projects);
});

export const POST = handler(async (req: NextRequest) => {
  const body = ProjectCreateSchema.parse(await req.json());

  const project = await prisma.project.create({
    data: {
      dealId: body.dealId,
      name: body.name ?? null,
      shapeType: body.shapeType,
      dimensions: body.dimensions,
      calculations: {
        create: body.rooms.map((room) => {
          const r = calculateSlab({
            inner_width: room.innerWidth,
            inner_length: room.innerLength,
            bearing: room.bearing,
            correction: room.correction,
            extra_beams: room.extraBeams,
            force_start_beam: room.forceStartBeam,
            pattern: (room.patternOverride ?? undefined) as Pattern | undefined,
          });
          return {
            name: room.name ?? null,
            innerWidth: r.inner_width,
            innerLength: r.inner_length,
            bearing: r.bearing,
            correction: r.correction,
            extraBeams: r.extra_beams,
            forceStartBeam: r.force_start_beam,
            patternOverride: (room.patternOverride ?? null) as Pattern | null,
            pitches: r.pitches,
            remainder: r.remainder,
            pattern: r.pattern,
            patternAuto: r.pattern_auto,
            beamLength: r.beam_length,
            blocksPerRow: r.blocks_per_row,
            beamCount: r.beam_count,
            blockRows: r.block_rows,
            totalBlocks: r.total_blocks,
            monolithLength: r.monolith_length,
            billedLength: r.billed_length,
            monolithArea: r.monolith_area,
            billedArea: r.billed_area,
            concreteVolume: r.concrete_volume,
            m2Price: r.m2_price,
            extraBeamPricePerM: r.extra_beam_price_per_m,
            m2Cost: r.m2_cost,
            patternExtraCost: r.pattern_extra_cost,
            manualExtraBeamsCost: r.manual_extra_beams_cost,
            subtotal: r.subtotal,
          };
        }),
      },
    },
  });

  // Auto-advance the deal stage if it's still in early state
  await prisma.deal.update({
    where: { id: body.dealId },
    data: { stage: "CALCULATION" },
  }).catch(() => null);

  return created(project);
});
