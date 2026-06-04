export const runtime = "nodejs";

import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { withInboxAccess } from "@/lib/inbox-auth";

const Body = z.object({ conversationId: z.string().min(1) });

/**
 * POST /api/projects/[id]/link-conversation — link a project (and thus its
 * order) to a Telegram conversation, e.g. after the operator manually picks a
 * recipient in the Send-to-chat picker. Gated by withInboxAccess so only inbox
 * users can create the link (it surfaces chat linkage). Idempotent.
 */
export const POST = withInboxAccess<{ id: string }>(async (req, { params }) => {
  const { conversationId } = Body.parse(await req.json());

  const [project, convo] = await Promise.all([
    prisma.project.findUnique({ where: { id: params.id }, select: { id: true } }),
    prisma.conversation.findUnique({ where: { id: conversationId }, select: { id: true } }),
  ]);
  if (!project) return fail("Лойиҳа топилмади · Project not found", 404);
  if (!convo) return fail("Суҳбат топилмади · Conversation not found", 404);

  await prisma.project.update({ where: { id: params.id }, data: { conversationId } });
  return ok({ linked: true });
});
