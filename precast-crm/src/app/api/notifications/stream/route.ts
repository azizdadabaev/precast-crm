export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { notificationBus } from "@/lib/notification-bus";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.isActive) return new Response("Unauthorized", { status: 401 });

  const userId = user.id;
  const lastEventId = req.headers.get("last-event-id");

  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(": connected\n\n"));

      // Replay any events created since the last seen ID (10-minute window).
      if (lastEventId) {
        try {
          const lastEvent = await prisma.notification.findUnique({
            where: { id: lastEventId },
            select: { createdAt: true },
          });
          if (lastEvent) {
            const missed = await prisma.notification.findMany({
              where: {
                userId,
                createdAt: { gt: lastEvent.createdAt, gte: new Date(Date.now() - 10 * 60 * 1000) },
              },
              orderBy: { createdAt: "asc" },
              take: 50,
            });
            for (const n of missed) {
              const payload = JSON.stringify({
                id: n.id,
                type: n.type,
                title: n.title,
                body: n.body,
                orderId: n.orderId,
                paymentId: n.paymentId,
                projectId: n.projectId,
                commentId: n.commentId,
                conversationId: n.conversationId,
                createdAt: n.createdAt.toISOString(),
                readAt: n.readAt?.toISOString() ?? null,
              });
              controller.enqueue(encoder.encode(`id: ${n.id}\ndata: ${payload}\n\n`));
            }
          }
        } catch { /* swallow — fresh connection is fine */ }
      }

      // 30s keepalive ping to defeat NAT/proxy idle timeouts.
      const pingInterval = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { cleanup(); }
      }, 30_000);

      const onNotification = (payload: string) => {
        if (closed) return;
        try {
          // Extract id for the SSE id: field so reconnect replay works.
          const parsed = JSON.parse(payload);
          controller.enqueue(encoder.encode(`id: ${parsed.id}\ndata: ${payload}\n\n`));
        } catch { cleanup(); }
      };

      notificationBus.on(userId, onNotification);

      function cleanup() {
        if (closed) return;
        closed = true;
        clearInterval(pingInterval);
        notificationBus.off(userId, onNotification);
        try { controller.close(); } catch { /* already closed */ }
      }

      req.signal.addEventListener("abort", cleanup, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
