export const runtime = "nodejs";

import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { withInboxAccess } from "@/lib/inbox-auth";

/**
 * Quotes (Projects) created from this conversation, newest first.
 * Gated by withInboxAccess — the chat→quotes back-link is inbox-only.
 */
export const GET = withInboxAccess<{ id: string }>(async (_req, { params }) => {
  const projects = await prisma.project.findMany({
    where: { conversationId: params.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, draftNumber: true, status: true, name: true, createdAt: true,
      orders: { select: { id: true, orderNumber: true }, take: 1 },
    },
  });
  // Expose the order (id + number) when placed, so the inbox can link an
  // ordered quote to the Orders page with its order id, and a still-draft
  // quote to the Projects page with its draft id.
  return ok(
    projects.map((p) => ({
      id: p.id,
      draftNumber: p.draftNumber,
      status: p.status,
      name: p.name,
      createdAt: p.createdAt,
      order: p.orders[0] ?? null,
    })),
  );
});
