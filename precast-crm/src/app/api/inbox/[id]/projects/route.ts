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
    select: { id: true, draftNumber: true, status: true, name: true, createdAt: true },
  });
  return ok(projects);
});
