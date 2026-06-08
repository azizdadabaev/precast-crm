export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { sendBusinessReply } from "@/lib/inbox-send";
import { resolveSentStatus } from "@/lib/agent/proposal";

const Body = z.object({
  action: z.enum(["send", "dismiss"]),
  // For send: the (possibly edited) text. Omit to send the agent's reply verbatim.
  text: z.string().trim().min(1).max(4000).optional(),
});

/**
 * POST /api/agent/proposals/[id]/act — owner-only (Plan 09 Slice C, Suggest mode).
 * The operator acts on a ghost-draft:
 *   - send: push the reply (verbatim or edited) to the customer via the inbox
 *     outbound path, then mark the proposal SENT / EDITED_SENT.
 *   - dismiss: mark DISMISSED without sending.
 * PENDING-guarded so an already-acted proposal can't be re-sent.
 */
export const POST = withPermission<{ id: string }>("inbox.access", async (req: NextRequest, { params, user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("invalid action", 422);

  const proposal = await prisma.agentProposal.findUnique({
    where: { id: params.id },
    select: { id: true, conversationId: true, reply: true, status: true },
  });
  if (!proposal) return fail("proposal not found", 404);
  if (proposal.status !== "PENDING") return fail(`proposal already ${proposal.status.toLowerCase()}`, 409);

  if (parsed.data.action === "dismiss") {
    await prisma.agentProposal.update({
      where: { id: proposal.id },
      data: { status: "DISMISSED", actedAt: new Date(), actedById: user.id },
    });
    return ok({ status: "DISMISSED" });
  }

  // action === "send"
  const finalText = (parsed.data.text ?? proposal.reply ?? "").trim();
  if (!finalText) return fail("nothing to send (this proposal has no reply text)", 422);

  const res = await sendBusinessReply({ conversationId: proposal.conversationId, text: finalText, userId: user.id });
  if (!res.ok) {
    // Send didn't succeed → leave the proposal PENDING so the operator can retry.
    if (res.reason === "NOT_FOUND") return fail("Суҳбат топилмади · Conversation not found", 404);
    if (res.reason === "NO_CONNECTION") {
      return fail(
        "Бу суҳбатда Telegram уланиши йўқ (масалан, симуляция қилинган суҳбат) · No Telegram connection for this chat (e.g. a simulated chat)",
        400,
      );
    }
    return fail("Юборилмади · Send failed", 502, { message: res.message });
  }

  const status = resolveSentStatus(proposal.reply, finalText);
  await prisma.agentProposal.update({
    where: { id: proposal.id },
    data: { status, actedAt: new Date(), actedById: user.id },
  });
  return ok({ status, message: res.message });
});
