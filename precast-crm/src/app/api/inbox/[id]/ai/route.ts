export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { withInboxAccess } from "@/lib/inbox-auth";

const Body = z.object({ handling: z.boolean() });

/**
 * POST /api/inbox/[id]/ai — hand a conversation to the AI, or take it over.
 *   { handling: true }  → aiState=AI_HANDLING, aiPaused=false  (agent resumes)
 *   { handling: false } → aiState=HUMAN_ACTIVE, aiPaused=true   (operator takes over)
 *
 * Without this, there is NO path back to the AI once a chat escalates
 * (PENDING_HUMAN) or an order is placed (HUMAN_ACTIVE) — the agent's gate
 * (shouldAgentHandle) only acts on AI_HANDLING && !aiPaused. Owner-only (inbox.access).
 */
export const POST = withInboxAccess<{ id: string }>(async (req: NextRequest, { params }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("handling (boolean) is required", 422);

  const updated = await prisma.conversation
    .update({
      where: { id: params.id },
      data: parsed.data.handling
        ? { aiState: "AI_HANDLING", aiPaused: false }
        : { aiState: "HUMAN_ACTIVE", aiPaused: true },
      select: { id: true, aiState: true, aiPaused: true },
    })
    .catch(() => null);

  if (!updated) return fail("Суҳбат топилмади · Conversation not found", 404);
  return ok(updated);
});
