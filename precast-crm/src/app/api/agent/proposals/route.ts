export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/agent/proposals?conversationId=… — owner-only (Plan 09 Slice B).
 * Returns the LATEST AgentProposal for a conversation — the read-only
 * ghost-draft the inbox renders in Shadow — or null if the agent hasn't
 * proposed anything for this chat yet.
 */
export const GET = withPermission("inbox.access", async (req: NextRequest) => {
  const conversationId = new URL(req.url).searchParams.get("conversationId");
  if (!conversationId) return fail("conversationId is required", 422);

  const proposal = await prisma.agentProposal.findFirst({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      inboundMessageId: true,
      decision: true,
      reply: true,
      escalationReason: true,
      approvalDraft: true,
      language: true,
      screen: true,
      escalatedEarly: true,
      modelKey: true,
      toolCalls: true,
      usage: true,
      turns: true,
      confidence: true,
      createdAt: true,
    },
  });
  return ok(proposal);
});
