import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withPermission } from "@/lib/api-auth";

/**
 * GET /api/drawings/status
 *
 * Lightweight status endpoint polled by BlenderStatusIndicator
 * and BlenderRequestsPanel. Returns:
 *   - whether the bridge currently has a Blender connected
 *   - the connection's open-since timestamp (or null)
 *   - the user's 10 most recent drawing requests
 *
 * The bridge-connection check times out fast — if the bridge
 * service is unreachable (e.g. compose stack is restarting) we
 * treat it as offline rather than hanging the indicator.
 */

const BRIDGE_STATUS_URL =
  process.env.WS_BRIDGE_INTERNAL_URL ?? "http://ws-bridge:8766/status";

async function fetchBridgeStatus(): Promise<{
  connected: boolean;
  connectedSince: string | null;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(BRIDGE_STATUS_URL, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return { connected: false, connectedSince: null };
    const data = (await res.json()) as {
      connected?: boolean;
      connectedSince?: string | null;
    };
    return {
      connected: !!data.connected,
      connectedSince: data.connectedSince ?? null,
    };
  } catch {
    return { connected: false, connectedSince: null };
  } finally {
    clearTimeout(timer);
  }
}

export const GET = withPermission(
  "blender.bridge",
  async (_req: NextRequest, { user }) => {
    const [bridge, recentRequests] = await Promise.all([
      fetchBridgeStatus(),
      prisma.drawingRequest.findMany({
        where: { createdById: user.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          status: true,
          createdAt: true,
          deliveredAt: true,
          errorMessage: true,
          orderId: true,
          projectId: true,
        },
      }),
    ]);

    return NextResponse.json({
      blenderConnected: bridge.connected,
      connectedSince: bridge.connectedSince,
      recentRequests,
    });
  },
);
