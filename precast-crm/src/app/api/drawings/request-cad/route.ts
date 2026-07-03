import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withPermission } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import type { CadDrawingPayload } from "@/lib/blender-bridge/cad-payload";

/**
 * POST /api/drawings/request-cad
 *
 * Creates a DrawingRequest from a CAD polygon drawing instead of the
 * rectangular-rooms path. The client sends the raw polygon outlines
 * (vertices in metres) together with CRM-computed beam/block data.
 *
 * The Blender addon detects `roomsJson.type === "cad_drawing"` and renders
 * the actual floor plan shape with beams clipped to the polygon outline.
 *
 * Owner-only via `blender.bridge` permission.
 */

const PointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const CadRoomSchema = z.object({
  name: z.string().min(1).max(100),
  points: z.array(PointSchema).min(3).max(500),
  holes: z.array(z.array(PointSchema).min(3)).optional(),
  beam_dir: z.enum(["H", "V"]),
  bearing_m: z.number().positive(),
  pitch_m: z.number().positive(),
  beam_section: z.object({ w: z.number().positive(), h: z.number().positive() }),
  block_dims: z.object({
    l: z.number().positive(),
    w: z.number().positive(),
    h: z.number().positive(),
  }),
  total_beams: z.number().int().min(0),
  total_blocks: z.number().int().min(0),
  beam_schedule: z.array(
    z.object({
      slab_length_m: z.number().positive(),
      count: z.number().int().positive(),
    }),
  ),
});

const Schema = z
  .object({
    orderId: z.string().optional(),
    projectId: z.string().optional(),
    rooms: z.array(CadRoomSchema).min(1).max(20),
  })
  .refine(
    (b) => b.orderId || b.projectId,
    "Provide orderId or projectId",
  );

// Shared rate-limit state: 10 requests per user per 60 s.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateMap = new Map<string, number[]>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const hits = (rateMap.get(userId) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (hits.length >= RATE_LIMIT_MAX) {
    rateMap.set(userId, hits);
    return false;
  }
  hits.push(now);
  rateMap.set(userId, hits);
  return true;
}

export const POST = withPermission(
  "blender.bridge",
  async (req: NextRequest, { user }) => {
    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { ok: false, error: `Сабр қилинг · Rate limit exceeded (max ${RATE_LIMIT_MAX}/min)` },
        { status: 429 },
      );
    }

    const body = Schema.parse(await req.json());

    // Fast-fail if Blender is offline — same guard as /api/drawings/request.
    const bridgeBase = (
      process.env.WS_BRIDGE_INTERNAL_URL ?? "http://ws-bridge:8766"
    ).replace(/\/$/, "");

    try {
      const bridgeRes = await fetch(`${bridgeBase}/status`, {
        signal: AbortSignal.timeout(5000),
      });
      const bridgeJson = await bridgeRes.json().catch(() => ({}));
      if (!bridgeJson.connected) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Blender ulanmagan — eganing kompyuterida Blender ochiq va addon yoqilgan bo'lishi kerak",
            code: "BLENDER_OFFLINE",
          },
          { status: 503 },
        );
      }
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "Ko'prik xizmatiga ulanib bo'lmadi · Could not reach the bridge service",
          code: "BLENDER_OFFLINE",
        },
        { status: 503 },
      );
    }

    const payload: CadDrawingPayload = {
      type: "cad_drawing",
      version: 1,
      rooms: body.rooms,
    };

    const drawingRequest = await prisma.drawingRequest.create({
      data: {
        orderId: body.orderId ?? null,
        projectId: body.projectId ?? null,
        roomsJson: JSON.stringify(payload),
        createdById: user.id,
        status: "PENDING",
      },
      select: { id: true, status: true, createdAt: true },
    });

    // Best-effort kick to the bridge.
    fetch(`${bridgeBase}/flush`, { method: "POST" }).catch(() => {});

    recordAudit({
      userId: user.id,
      action: "drawing.request.cad",
      targetType: body.orderId ? "order" : "project",
      targetId: body.orderId ?? body.projectId ?? null,
      message: `Sent CAD drawing (${body.rooms.length} room${body.rooms.length === 1 ? "" : "s"}) to Blender`,
      metadata: { drawingRequestId: drawingRequest.id, roomCount: body.rooms.length },
    });

    return NextResponse.json({
      id: drawingRequest.id,
      status: drawingRequest.status,
      createdAt: drawingRequest.createdAt,
    });
  },
);
