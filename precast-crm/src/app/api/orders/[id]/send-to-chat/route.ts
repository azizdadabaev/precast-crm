export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withInboxAccess } from "@/lib/inbox-auth";
import { sendBusinessPhoto } from "@/lib/inbox-send";
import { renderAgentQuoteImage } from "@/lib/agent/quote-card-shot";
import { formatNumber } from "@/lib/utils";

/**
 * POST /api/orders/[id]/send-to-chat — inbox.access.
 *
 * Renders the order's quote card SERVER-SIDE, through the same headless Chromium that
 * `/internal/quote-card/[projectId]` and the AI agent already use, and posts it into the
 * customer's Telegram conversation.
 *
 * The rendering deliberately does not happen on the caller. The web's own button captures the
 * card out of its DOM with html-to-image, and a phone would have to redraw that card in a
 * different toolkit entirely — three renderers, three slightly different images of the same
 * order landing in the same chat. One renderer on the server is the only way the customer sees
 * one document no matter who sent it, and it also means a client needs no image pipeline at all:
 * this endpoint takes no body.
 *
 * The caption mirrors `orders/[id]/page.tsx`'s `sendCaption` exactly, down to the 180 kg/m².
 */
export const POST = withInboxAccess<{ id: string }>(async (_req: NextRequest, { params, user }) => {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    select: {
      orderNumber: true,
      totalPrice: true,
      totalArea: true,
      client: { select: { name: true } },
      project: { select: { id: true, conversationId: true } },
    },
  });
  if (!order) return fail("Буюртма топилмади · Order not found", 404);
  if (!order.project) {
    return fail("Лойиҳа топилмади · Order has no project to render", 422);
  }
  const conversationId = order.project.conversationId;
  if (!conversationId) {
    // The web offers a chat picker at this point. A client that cannot pick gets a clear reason
    // rather than a silent failure — link the order from the web once and every later send from
    // any device goes direct.
    return fail("Суҳбат уланмаган · Order is not linked to a chat", 422, { code: "NO_CONVERSATION" });
  }

  const caption = [
    `№${order.orderNumber}${order.client?.name ? ` · ${order.client.name}` : ""}`,
    `Жами: ${formatNumber(Number(order.totalPrice), 0)} so'm`,
    `Оғирлик: ${formatNumber(Number(order.totalArea) * 180, 0)} кг`,
  ].join("\n");

  let photo: Buffer;
  try {
    photo = await renderAgentQuoteImage(order.project.id);
  } catch (e) {
    // Chromium missing, out of memory, or the internal page failing to load. The operator can
    // retry; nothing has been sent, so there is no half-delivered message to clean up.
    return fail(
      `Расм яратилмади · Could not render the card${e instanceof Error ? ` — ${e.message}` : ""}`,
      502,
    );
  }

  const result = await sendBusinessPhoto({
    conversationId,
    photo,
    mime: "image/png",
    caption,
    userId: user.id,
  });

  if (result.ok) return ok(result.message);
  switch (result.reason) {
    case "NOT_FOUND":
      return fail("Суҳбат топилмади · Conversation not found", 404);
    case "NO_CONNECTION":
      return fail("Бизнес уланиш мавжуд эмас · No business connection for this chat", 400);
    default: // NO_STAGING | SEND_FAILED — a failed bubble was persisted for retry
      return fail(
        result.detail ? `Юборилмади · Send failed — ${result.detail}` : "Юборилмади · Send failed",
        502,
        { message: result.message, reason: result.detail, peerInvalid: result.peerInvalid ?? false },
      );
  }
});
