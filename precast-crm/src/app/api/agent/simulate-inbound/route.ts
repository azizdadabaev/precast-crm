export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { emitInbox } from "@/lib/inbox-bus";
import { runAgentForInbound } from "@/lib/agent/webhook-entry";
import { loadAgentRuntimeConfig, shouldAgentHandle } from "@/lib/agent/runtime-config";

const Body = z.object({
  text: z.string().min(1).max(2000),
  // Reuse an open chat (great for multi-turn testing) or omit to spin up a fresh
  // simulated test conversation.
  conversationId: z.string().optional(),
  displayName: z.string().max(80).optional(),
});

/**
 * POST /api/agent/simulate-inbound — owner-only (Plan 09 Slice B). The local
 * test affordance: inject a customer message into a conversation and run the
 * agent on the SAME path the live Telegram webhook uses (kill-switch + per-chat
 * gate + Shadow), so the full inbound→agent→proposal chain can be exercised with
 * NO Telegram / tunnel. Unlike the fire-and-forget webhook it AWAITS the agent
 * and returns the resulting AgentProposal. Writes an inbound Message + a proposal
 * only — it never sends anything to a customer (Shadow stays send-free).
 */
export const POST = withPermission("inbox.access", async (req: NextRequest) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("text is required", 422);
  const { text, conversationId, displayName } = parsed.data;

  // A collision-proof synthetic id for the simulated chat / message (no real
  // Telegram ids exist here). Math.random suffix guards same-millisecond calls.
  const stamp = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 1. Resolve the conversation — reuse the open one, or create a fresh test chat.
  let conversation = conversationId
    ? await prisma.conversation.findUnique({ where: { id: conversationId } })
    : null;
  if (conversationId && !conversation) return fail("conversation not found", 404);
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        channel: "TELEGRAM",
        externalId: stamp,
        displayName: displayName?.trim() || "🧪 Simulated customer",
        lastMessageAt: new Date(),
        lastSnippet: text.slice(0, 80),
        unread: true,
      },
    });
  }

  // 2. Write the INBOUND message (synthetic telegramMsgId keeps the unique key).
  const message = await prisma.message.create({
    data: { conversationId: conversation.id, direction: "INBOUND", text, telegramMsgId: stamp },
    select: { id: true },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), lastSnippet: text.slice(0, 80), unread: true },
  });
  emitInbox({ type: "message:new", conversationId: conversation.id, messageId: message.id });

  // 3. Run the agent on the real webhook path (respects the gate). AWAIT it so we
  //    can return the proposal it persists.
  const config = await loadAgentRuntimeConfig();
  const willRun = shouldAgentHandle(conversation, config) && config.mode === "shadow";
  await runAgentForInbound(
    {
      id: conversation.id,
      aiState: conversation.aiState,
      aiPaused: conversation.aiPaused,
      sharedContactPhone: conversation.sharedContactPhone,
    },
    text,
    message.id,
  );

  // 4. Read back the proposal this run produced (null if the gate blocked it or
  //    the run errored, e.g. no provider key).
  const proposal = await prisma.agentProposal.findUnique({ where: { inboundMessageId: message.id } });

  const note = proposal
    ? undefined
    : willRun
      ? "Agent ran but produced no proposal — check the provider key in /agent (or the server logs)."
      : !config.enabled
        ? "Agent did not run: the kill-switch is OFF. Enable it in /agent."
        : conversation.aiState !== "AI_HANDLING"
          ? `Agent did not run: conversation is ${conversation.aiState} (a human owns this chat).`
          : conversation.aiPaused
            ? "Agent did not run: this chat is paused (aiPaused)."
            : config.mode !== "shadow"
              ? `Agent did not run: mode is "${config.mode}" (only shadow is wired).`
              : "Agent did not run.";

  return ok({ conversationId: conversation.id, messageId: message.id, ranAgent: willRun, proposal, note });
});
