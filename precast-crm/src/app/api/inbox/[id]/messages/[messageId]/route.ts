export const runtime = "nodejs";

import { promises as fs } from "fs";
import path from "path";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { withInboxAccess } from "@/lib/inbox-auth";
import { tgDeleteBusinessMessages } from "@/lib/telegram/api";
import { emitInbox } from "@/lib/inbox-bus";

/**
 * DELETE /api/inbox/[id]/messages/[messageId] — delete a message we sent, for
 * everyone. Scope is OUTBOUND-only (the operator chose "only messages we
 * sent"). If it reached Telegram, it's deleted there first via
 * deleteBusinessMessages (needs the bot's delete right in the business
 * connection); a never-sent/failed bubble is removed locally only. The
 * matching Telegram→CRM direction is handled by the webhook's
 * deleted_business_messages update.
 */
export const DELETE = withInboxAccess<{ id: string; messageId: string }>(async (_req, { params }) => {
  const message = await prisma.message.findUnique({
    where: { id: params.messageId },
    select: {
      id: true,
      conversationId: true,
      direction: true,
      telegramMsgId: true,
      mediaPath: true,
      conversation: { select: { externalId: true, businessConnectionId: true } },
    },
  });
  if (!message || message.conversationId !== params.id) {
    return fail("Хабар топилмади · Message not found", 404);
  }
  if (message.direction !== "OUTBOUND") {
    return fail("Фақат ўз хабарингизни ўчириш мумкин · You can only delete your own messages", 403);
  }

  // Delete on Telegram first so the CRM never gets ahead of the real chat.
  if (message.telegramMsgId && message.conversation.businessConnectionId) {
    const tgId = Number(message.telegramMsgId);
    if (Number.isFinite(tgId)) {
      try {
        await tgDeleteBusinessMessages(message.conversation.businessConnectionId, [tgId]);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error("[inbox delete-message]", reason);
        return fail(
          `Ўчириб бўлмади · Couldn't delete on Telegram — ${reason}. ` +
            "Ботга ўчириш ҳуқуқини беринг (Telegram → Settings → Business → Chatbots) · " +
            "grant the bot the delete-messages right.",
          502,
        );
      }
    }
  }

  await prisma.message.delete({ where: { id: message.id } });

  // Best-effort: drop the locally-stored media file (skip API-served PDFs).
  if (message.mediaPath && message.mediaPath.startsWith("/uploads/")) {
    const abs = path.join(process.cwd(), "public", message.mediaPath.replace(/^\/+/, ""));
    await fs.rm(abs, { force: true }).catch(() => {});
  }

  emitInbox({ type: "message:deleted", conversationId: message.conversationId, messageId: message.id });
  return ok({ deleted: true });
});
