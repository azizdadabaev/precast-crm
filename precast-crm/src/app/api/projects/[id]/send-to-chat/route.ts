export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withInboxAccess } from "@/lib/inbox-auth";
import { sendBusinessPhoto } from "@/lib/inbox-send";
import { renderAgentQuoteImage } from "@/lib/agent/quote-card-shot";
import { formatNumber } from "@/lib/utils";

/**
 * POST /api/projects/[id]/send-to-chat — inbox.access.
 *
 * A saved draft into the customer's chat, rendered by the same headless Chromium that
 * `/internal/quote-card/[projectId]` and the AI agent use. The sibling of
 * `/api/orders/[id]/send-to-chat`, and it exists for the same reason: the card a customer receives
 * must be one document however it was sent.
 *
 * The web sends a draft by capturing its own DOM with html-to-image, which a phone cannot do and
 * should not imitate — a third renderer would be a third slightly different picture of the same
 * quote. So this takes no body either: hand it a project, it renders and posts.
 *
 * @param conversationId optional override. A draft is normally sent to the chat it came from
 *   (`Project.conversationId`), but an operator may be answering a customer who wrote from a
 *   different account, which is the case the web's chat picker exists for.
 */
export const POST = withInboxAccess<{ id: string }>(async (req: NextRequest, { params, user }) => {
  // The body is optional in every sense: no body at all is the ordinary case.
  const body = await req.json().catch(() => ({}));
  const override = typeof body?.conversationId === "string" ? body.conversationId.trim() : "";

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      draftNumber: true,
      conversationId: true,
      tentativeClientName: true,
      client: { select: { name: true } },
      calculations: { select: { monolithArea: true, subtotal: true } },
    },
  });
  if (!project) return fail("Лойиҳа топилмади · Project not found", 404);

  const conversationId = override || project.conversationId;
  if (!conversationId) {
    return fail("Суҳбат уланмаган · Draft is not linked to a chat", 422, { code: "NO_CONVERSATION" });
  }

  const total = project.calculations.reduce((sum, c) => sum + Number(c.subtotal), 0);
  const area = project.calculations.reduce((sum, c) => sum + Number(c.monolithArea), 0);
  const who = project.client?.name ?? project.tentativeClientName ?? "";
  // Mirrors the order card's caption, with the draft number standing in for an order number.
  const caption = [
    `${project.draftNumber ? `№${project.draftNumber}D` : "Лойиҳа"}${who ? ` · ${who}` : ""}`,
    `Жами: ${formatNumber(total, 0)} so'm`,
    `Оғирлик: ${formatNumber(area * 180, 0)} кг`,
  ].join("\n");

  let photo: Buffer;
  try {
    photo = await renderAgentQuoteImage(project.id);
  } catch (e) {
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
    default:
      return fail(
        result.detail ? `Юборилмади · Send failed — ${result.detail}` : "Юборилмади · Send failed",
        502,
        { message: result.message, reason: result.detail, peerInvalid: result.peerInvalid ?? false },
      );
  }
});
