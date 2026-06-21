export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { calculateSlab, type Pattern } from "@/services/calculation-engine";
import { loadPricingConfig } from "@/lib/pricing-config";
import { calcResultToCreatePayload, type RoomInput } from "@/lib/calc-persistence";

/** A room as snapshotted into DrawingVersion.roomsJson by the save path. */
interface SnapRoom {
  name: string | null;
  innerWidth: number;
  innerLength: number;
  bearing: number;
  correction: number;
  extraBeams: number;
  forceStartBeam: boolean;
  patternOverride: Pattern | null;
  m2PriceOverride: boolean;
  m2Price: number;
  m2PriceReason: string | null;
}

/**
 * POST /api/projects/[id]/drawing-versions/[vid]/restore — order.create.
 * Re-applies a prior version: writes its floor-plan outline back and re-creates
 * the priced rooms from the snapshot (re-running the engine at current prices).
 * The CURRENT state is itself snapshotted first, so a restore is reversible.
 */
export const POST = withPermission<{ id: string; vid: string }>(
  "order.create",
  async (_req: NextRequest, { user, params }) => {
    const pricing = await loadPricingConfig();

    const result = await prisma.$transaction(async (tx) => {
      const version = await tx.drawingVersion.findFirst({
        where: { id: params.vid, projectId: params.id },
      });
      if (!version) throw new Error("VERSION_NOT_FOUND");
      const project = await tx.project.findUnique({
        where: { id: params.id },
        include: { calculations: { orderBy: { seq: "asc" } } },
      });
      if (!project) throw new Error("PROJECT_NOT_FOUND");
      if (project.status === "ORDERED") throw new Error("PROJECT_ORDERED");

      // Snapshot the CURRENT state first so the restore is reversible.
      await tx.drawingVersion.create({
        data: {
          projectId: project.id,
          label: "before restore",
          drawingJson:
            project.drawingJson === null
              ? Prisma.DbNull
              : (project.drawingJson as Prisma.InputJsonValue),
          roomsJson: project.calculations.map((c) => ({
            name: c.name,
            innerWidth: Number(c.innerWidth),
            innerLength: Number(c.innerLength),
            bearing: Number(c.bearing),
            correction: Number(c.correction),
            extraBeams: c.extraBeams,
            forceStartBeam: c.forceStartBeam,
            patternOverride: c.patternOverride,
            m2PriceOverride: c.m2PriceOverride,
            m2Price: Number(c.m2Price),
            m2PriceReason: c.m2PriceReason,
            subtotal: Number(c.subtotal),
          })) as Prisma.InputJsonValue,
          createdById: user.id,
        },
      });

      // Re-create the priced rooms from the version's snapshot inputs.
      const snap = (version.roomsJson as unknown as SnapRoom[]) ?? [];
      const computed = snap.map((room) => {
        const input: RoomInput = {
          name: room.name,
          innerWidth: room.innerWidth,
          innerLength: room.innerLength,
          bearing: room.bearing,
          correction: room.correction,
          extraBeams: room.extraBeams,
          forceStartBeam: room.forceStartBeam,
          patternOverride: room.patternOverride,
          m2PriceOverride: room.m2PriceOverride,
          m2PriceOverrideValue: room.m2PriceOverride ? room.m2Price : null,
          m2PriceReason: room.m2PriceReason,
        };
        return {
          input,
          result: calculateSlab(
            {
              inner_width: input.innerWidth,
              inner_length: input.innerLength,
              bearing: input.bearing,
              correction: input.correction,
              extra_beams: input.extraBeams,
              force_start_beam: input.forceStartBeam,
              pattern: (input.patternOverride ?? undefined) as Pattern | undefined,
            },
            pricing,
          ),
        };
      });

      await tx.calculation.deleteMany({ where: { projectId: project.id } });
      await tx.project.update({
        where: { id: project.id },
        data: {
          drawingJson:
            version.drawingJson === null
              ? Prisma.DbNull
              : (version.drawingJson as Prisma.InputJsonValue),
          calculations: {
            create: computed.map((c, i) => ({
              ...calcResultToCreatePayload(c.input, c.result),
              seq: i,
            })),
          },
        },
      });
      return { restored: snap.length };
    });

    return ok(result);
  },
);
