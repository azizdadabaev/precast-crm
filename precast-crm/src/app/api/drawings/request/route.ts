import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withPermission } from "@/lib/api-auth";
import {
  normalizeRoomsForBlender,
  validateRoomsForBlender,
  MAX_ROOMS_PER_REQUEST,
} from "@/lib/blender-bridge/normalize-rooms";

/**
 * POST /api/drawings/request
 *
 * Creates a DrawingRequest row from a saved Project or an Order and
 * triggers an immediate flush against the ws-bridge service. The
 * Blender plug-in (which holds the only authorized WebSocket
 * connection to the bridge) receives it within a few seconds at most.
 *
 * Owner-only via `blender.bridge` permission.
 *
 * Request body:
 *   { orderId?: string, projectId?: string }
 *
 * Exactly one of the two must be present. The room snapshot is read
 * from `Project.calculations[]` regardless of source — orders share
 * the same rooms with their underlying project.
 */

const Schema = z
  .object({
    orderId: z.string().optional(),
    projectId: z.string().optional(),
  })
  .refine(
    (b) => (b.orderId ? !b.projectId : !!b.projectId),
    "Provide exactly one of orderId or projectId",
  );

// In-memory rate limit. Personal feature → 10/min/user is generous.
// Keyed by user id; sliding 60-second window.
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
        {
          ok: false,
          error: `Сабр қилинг · Rate limit exceeded (max ${RATE_LIMIT_MAX}/min)`,
        },
        { status: 429 },
      );
    }

    const body = Schema.parse(await req.json());

    // Fetch the rooms. Both order-sourced and project-sourced
    // requests resolve to Project.calculations[] — orders are 1:1
    // with projects in this schema (Order.projectId is @unique).
    let rawRooms: Array<Record<string, unknown>>;
    if (body.orderId) {
      const order = await prisma.order.findUnique({
        where: { id: body.orderId },
        select: {
          id: true,
          project: { select: { calculations: true } },
        },
      });
      if (!order) {
        return NextResponse.json(
          { ok: false, error: "Order not found" },
          { status: 404 },
        );
      }
      rawRooms = (order.project.calculations ?? []) as unknown as Array<
        Record<string, unknown>
      >;
    } else {
      const project = await prisma.project.findUnique({
        where: { id: body.projectId! },
        select: { id: true, calculations: true },
      });
      if (!project) {
        return NextResponse.json(
          { ok: false, error: "Project not found" },
          { status: 404 },
        );
      }
      rawRooms = (project.calculations ?? []) as unknown as Array<
        Record<string, unknown>
      >;
    }

    // Normalize + validate.
    const rooms = normalizeRoomsForBlender(rawRooms);
    const error = validateRoomsForBlender(rooms);
    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: `Invalid rooms: ${error}`,
          maxRooms: MAX_ROOMS_PER_REQUEST,
        },
        { status: 400 },
      );
    }

    const drawingRequest = await prisma.drawingRequest.create({
      data: {
        orderId: body.orderId ?? null,
        projectId: body.projectId ?? null,
        roomsJson: JSON.stringify(rooms),
        createdById: user.id,
        status: "PENDING",
      },
      select: { id: true, status: true, createdAt: true },
    });

    // Best-effort kick to the bridge. Failures are silent — the
    // bridge's 2s polling tick will pick this row up regardless.
    fetch("http://ws-bridge:8766/flush", { method: "POST" }).catch(() => {});

    return NextResponse.json({
      id: drawingRequest.id,
      status: drawingRequest.status,
      createdAt: drawingRequest.createdAt,
    });
  },
);
