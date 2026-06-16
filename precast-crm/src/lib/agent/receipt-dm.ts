// Operator-DM receipt branch.
//
// An operator forwards a payment-receipt photo directly to the bot (a plain
// DM — NOT a business message) with the order number in the caption. We
// authorize the sender via their `telegramUserId` mapping + `payment.record`
// permission, then attach the photo to that order as a Receipt.
//
// Isolated here (not inline in the webhook route) so the authorization gate
// and the attach flow are unit-testable in isolation. Never throws out of the
// function — the webhook treats this as fire-and-forget and always 200s.

import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { parseOrderRef } from "@/lib/order-receipt-ref";
import { tgGetFilePath, tgDownloadFile, tgSendMessageWithInlineKeyboard } from "@/lib/telegram/api";
import { looksLikeImage, imageExtFromBytes, saveBufferToUploads } from "@/lib/uploads";

/** The subset of a Telegram `message` (plain DM) we read. Typed loosely but
 *  safely — every field is optional-chained at the use site. */
export interface OperatorReceiptDm {
  from?: { id?: number };
  chat: { id: number };
  photo?: Array<{ file_id: string; file_unique_id: string }>;
  caption?: string;
}

/** Reply to the operator's DM. Plain (non-business) send with no keyboard —
 *  `tgSendMessageWithInlineKeyboard` is the only non-business text sender. */
async function reply(chatId: string, text: string): Promise<void> {
  await tgSendMessageWithInlineKeyboard(chatId, text, []);
}

export async function handleOperatorReceiptDm(dm: OperatorReceiptDm): Promise<void> {
  const chatId = String(dm.chat.id);
  try {
    const fromId = String(dm.from?.id ?? "");
    if (!fromId) return;

    // THE AUTHZ GATE — no telegramUserId mapping or no payment.record means
    // no attach. A Telegram user we don't know, or one without the right to
    // record payments, can never touch an order.
    const operator = await prisma.user.findFirst({
      where: { telegramUserId: fromId, isActive: true },
    });
    if (!operator || !can(operator, "payment.record")) {
      await reply(chatId, "⚠️ Сиз боғланмагансиз ёки рухсат йўқ · You're not linked / not authorized");
      return;
    }

    const ref = parseOrderRef(dm.caption, new Date().getFullYear());
    if (!ref) {
      await reply(
        chatId,
        "⚠️ Буюртма рақамини ёзинг (масалан 2026-06-0010 ёки 06-0010) · Add the order number (e.g. 2026-06-0010 or 06-0010)",
      );
      return;
    }

    const order = await prisma.order.findFirst({
      where: { orderNumber: ref },
      select: { id: true, orderNumber: true },
    });
    if (!order) {
      await reply(chatId, `⚠️ Буюртма топилмади: ${ref} · Order not found`);
      return;
    }

    const photos = dm.photo ?? [];
    const largest = photos[photos.length - 1];
    if (!largest) return;

    // Idempotency: Telegram may redeliver the same update. A receipt whose
    // stored URL ends with this photo's file_unique_id is the same photo.
    const existing = await prisma.receipt.findFirst({
      where: { orderId: order.id, imageUrl: { contains: largest.file_unique_id } },
    });
    if (existing) {
      await reply(
        chatId,
        `✅ №${order.orderNumber} буюртмага чек аллақачон қўшилган (allaqachon) · already added`,
      );
      return;
    }

    const filePath = await tgGetFilePath(largest.file_id);
    const buf = await tgDownloadFile(filePath);
    if (!looksLikeImage(buf)) {
      await reply(chatId, "⚠️ Расм нотўғри · Not a valid image");
      return;
    }
    const ext = imageExtFromBytes(buf) ?? "jpg";

    const url = await saveBufferToUploads(buf, `receipts/order-${order.id}`, `${largest.file_unique_id}.${ext}`);

    await prisma.receipt.create({
      data: {
        orderId: order.id,
        paymentId: null,
        imageUrl: url,
        source: "TELEGRAM_BOT",
        uploadedById: operator.id,
      },
    });

    await reply(
      chatId,
      `✅ №${order.orderNumber} буюртмага чек қўшилди · receipt added to order ${order.orderNumber}`,
    );
  } catch (err) {
    console.error("[receipt dm]", err);
    // Best-effort error reply — never let this throw out of the function.
    try {
      await reply(chatId, "⚠️ Хатолик · Error");
    } catch {
      /* swallow — the original error is already logged */
    }
  }
}
