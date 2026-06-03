export const runtime = "nodejs";

import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { withInboxAccess } from "@/lib/inbox-auth";

/**
 * Focused context for the "Calculate from this chat" handoff: the
 * client's display name / handle, any shared-contact phone they sent,
 * and the conversation's images (drawings) newest-first.
 *
 * Gated by withInboxAccess — only the inbox owner, and only while the
 * session is unlocked. Returns exactly what the calculator prefill needs
 * and nothing more (no message text, no other media), to avoid leaking
 * chat contents through a calculator-side fetch.
 */
export const GET = withInboxAccess<{ id: string }>(async (_req, { params }) => {
  const conversation = await prisma.conversation.findUnique({
    where: { id: params.id },
    select: { displayName: true, username: true, sharedContactPhone: true },
  });
  if (!conversation) return fail("Суҳбат топилмади · Conversation not found", 404);

  const images = await prisma.message.findMany({
    where: { conversationId: params.id, mediaKind: "IMAGE", mediaPath: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, mediaPath: true, createdAt: true },
  });

  return ok({
    displayName: conversation.displayName,
    username: conversation.username,
    sharedContactPhone: conversation.sharedContactPhone,
    images: images.map((m) => ({ messageId: m.id, path: m.mediaPath, createdAt: m.createdAt })),
  });
});
