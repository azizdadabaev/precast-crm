export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { sendBusinessReply } from "@/lib/inbox-send";
import { resolveSentStatus } from "@/lib/agent/proposal";
import { placeOrderFromProposal, orderConfirmationMessage } from "@/lib/agent/place-order";
import type { ApprovalDraft } from "@/lib/agent/loop";

const Body = z.object({
  action: z.enum(["send", "dismiss", "place_order"]),
  // For send: the (possibly edited) text. Omit to send the agent's reply verbatim.
  text: z.string().trim().min(1).max(4000).optional(),
});

/**
 * POST /api/agent/proposals/[id]/act — owner-only (Plan 09 Slice C). The operator
 * acts on a ghost-draft:
 *   - send: push the reply (verbatim/edited) to the customer → SENT / EDITED_SENT.
 *   - place_order: on a request_approval proposal, place a real Order (decision c:
 *     recorded under the operator) + auto-confirm the customer → ORDER_PLACED.
 *   - dismiss: mark DISMISSED without sending.
 * PENDING-guarded so an already-acted proposal can't be re-acted.
 */
export const POST = withPermission<{ id: string }>("inbox.access", async (req: NextRequest, { params, user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("invalid action", 422);

  const proposal = await prisma.agentProposal.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      conversationId: true,
      inboundMessageId: true,
      decision: true,
      reply: true,
      approvalDraft: true,
      language: true,
      status: true,
    },
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

  if (parsed.data.action === "place_order") {
    if (proposal.decision !== "request_approval") return fail("this proposal is not an order proposal", 422);
    const draft = proposal.approvalDraft as ApprovalDraft | null;
    if (!draft?.quoteId) return fail("order proposal is missing a quote", 422);
    if (!draft.customerName || !draft.customerPhone || !draft.deliveryAddress) {
      return fail("Buyurtma uchun mijoz ismi, telefoni va manzili kerak · Order needs the customer name, phone and address", 422);
    }
    const secret = process.env.QUOTE_SIGNING_SECRET ?? "";
    if (!secret) return fail("quote signing unavailable (QUOTE_SIGNING_SECRET unset)", 500);

    const placed = await placeOrderFromProposal(
      { draft, conversationId: proposal.conversationId, confirmationMsgId: proposal.inboundMessageId, decidedById: user.id },
      { secret },
    );
    if (!placed.ok) {
      const message = "message" in placed ? placed.message : undefined;
      const labels: Record<string, string> = {
        INVALID_QUOTE: "Narx tekshiruvidan o‘tmadi · Quote could not be verified",
        MISSING_FIELDS: "Buyurtma ma’lumotlari to‘liq emas · Order details incomplete",
        MISSING_CUSTOMER_INFO: "Mijoz ma’lumotlari yetishmaydi · Missing customer info",
        NOT_FOUND: "Topilmadi · Not found",
        CREATE_FAILED: message ?? "Buyurtma joylanmadi · Order placement failed",
      };
      return fail(labels[placed.reason] ?? "Buyurtma joylanmadi · Order placement failed", placed.reason === "CREATE_FAILED" ? 502 : 422);
    }
    if (placed.status !== "committed") {
      return fail(`order not placed (${placed.status})`, 409); // already decided / rejected
    }

    // Auto-confirm the customer (decision: yes). Best-effort — a send failure must
    // not undo a placed Order.
    try {
      await sendBusinessReply({
        conversationId: proposal.conversationId,
        text: orderConfirmationMessage(proposal.language, placed.orderNumber),
        userId: user.id,
      });
    } catch (err) {
      console.error("[agent act place_order confirmation]", err);
    }

    await prisma.agentProposal.update({
      where: { id: proposal.id },
      data: { status: "ORDER_PLACED", actedAt: new Date(), actedById: user.id },
    });
    return ok({ status: "ORDER_PLACED", orderId: placed.orderId, orderNumber: placed.orderNumber });
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
