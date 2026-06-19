// Operator-photo DM branch — the unified receipt + loaded-truck flow.
//
// An operator/loading worker sends a photo directly to the bot (a plain DM, NOT
// a business message). Because a photo is just pixels, the bot can't tell a
// payment receipt from a loaded-truck photo, so it always asks with two buttons:
// 🧾 Чек · Receipt / 🚚 Юк машина · Truck. Two pieces of info are needed:
//   1. the ORDER NUMBER — from the photo caption, or (a forward strips the
//      caption) as a typed follow-up reply; and
//   2. the KIND — from the button tap.
// The photo(s) wait in an in-memory session (operator-photo-session.ts) until
// both are known, then attach as a Receipt or a GalleryPhoto(kind: LOADED).
//
// Authorization: the sender must be telegram-linked + active and hold the
// permission for the kind they pick — `payment.record` for a receipt,
// `order.edit` for a truck photo (the same gate as the in-CRM "+ Add photo").
//
// Never throws out of the exported functions — the webhook is fire-and-forget
// and always 200s.

import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { parseOrderRef } from "@/lib/order-receipt-ref";
import { parseGazoblokOrderRef } from "@/lib/gazoblok-receipt-ref";
import { recordAudit } from "@/lib/audit";
import { canAddLoadedPhoto } from "@/lib/loaded-photos";
import {
  tgGetFilePath,
  tgDownloadFile,
  tgSendMessageWithInlineKeyboard,
  tgAnswerCallbackQuery,
  tgEditMessageText,
  type InlineButton,
} from "@/lib/telegram/api";
import { looksLikeImage, imageExtFromBytes, saveBufferToUploads } from "@/lib/uploads";
import { encodePhotoCallback, parsePhotoCallback, type PhotoKind } from "@/lib/agent/operator-photo-callback";
import {
  stashPhoto,
  getSessionByFrom,
  hasPendingSession,
  setSessionOrder,
  takeSessionByToken,
  clearSession,
  type PhotoRef,
  type PhotoSession,
  type ResolvedOrder,
} from "@/lib/agent/operator-photo-session";

/** Subset of a Telegram plain-DM `message` we read. */
export interface OperatorPhotoDm {
  from?: { id?: number };
  chat: { id: number };
  photo?: Array<{ file_id: string; file_unique_id: string }>;
  caption?: string;
  text?: string;
}

/** Subset of a Telegram `callback_query` we read. */
export interface OperatorPhotoCallbackQuery {
  id: string;
  data?: string | null;
  message?: { chat?: { id?: number | string }; message_id?: number | string } | null;
  from?: { id?: number | string } | null;
}

type AttachResult = "added" | "duplicate" | "invalid_image" | "error";

const PERM_FOR_KIND: Record<PhotoKind, "payment.record" | "order.edit"> = {
  RECEIPT: "payment.record",
  LOADED: "order.edit",
};

/** Plain (non-business) reply with no keyboard. */
async function reply(chatId: string, text: string): Promise<void> {
  await tgSendMessageWithInlineKeyboard(chatId, text, []);
}

/** Resolve the sender and confirm they can use this branch at all (linked +
 *  active + holds at least one of the two photo permissions). */
async function resolveSender(fromId: string) {
  if (!fromId) return null;
  const user = await prisma.user.findFirst({ where: { telegramUserId: fromId, isActive: true } });
  if (!user) return null;
  if (!can(user, "payment.record") && !can(user, "order.edit")) return null;
  return user;
}

type RefResult =
  | { kind: "none" }
  | { kind: "notfound"; ref: string }
  | { kind: "found"; order: ResolvedOrder };

/** Resolve a caption/text to a floor OR gazoblok order. Gazoblok ("B-…") is
 *  tried FIRST so "B-06-0010" isn't mis-read as the floor number it embeds. */
async function resolveRef(text: string | null | undefined): Promise<RefResult> {
  const year = new Date().getFullYear();
  const gref = parseGazoblokOrderRef(text, year);
  if (gref) {
    const o = await prisma.gazoblokOrder.findFirst({
      where: { orderNumber: gref },
      select: { id: true, orderNumber: true, status: true },
    });
    return o
      ? { kind: "found", order: { id: o.id, orderNumber: o.orderNumber, status: o.status, system: "GAZOBLOK" } }
      : { kind: "notfound", ref: gref };
  }
  const fref = parseOrderRef(text, year);
  if (fref) {
    const o = await prisma.order.findFirst({
      where: { orderNumber: fref },
      select: { id: true, orderNumber: true, status: true },
    });
    return o
      ? { kind: "found", order: { id: o.id, orderNumber: o.orderNumber, status: o.status, system: "FLOOR" } }
      : { kind: "notfound", ref: fref };
  }
  return { kind: "none" };
}

function kindButtons(token: string, system: ResolvedOrder["system"]): InlineButton[][] {
  const receipt: InlineButton = { text: "🧾 Чек · Receipt", callback_data: encodePhotoCallback(token, "RECEIPT") };
  // Gazoblok has no bot-side truck-loading, so it's receipt-only.
  if (system === "GAZOBLOK") return [[receipt]];
  return [[receipt, { text: "🚚 Юк машина · Truck", callback_data: encodePhotoCallback(token, "LOADED") }]];
}

/** Ask the operator which kind this photo is. Marks the session so an album of
 *  several photos only prompts once. INVARIANT: the `buttonsSent` read + set
 *  below MUST stay synchronous (no `await` before the assignment) — Telegram
 *  delivers album items as concurrent webhook POSTs, and that await-free window
 *  is what dedups the prompt. Don't insert an await above the assignment. */
async function promptKind(session: PhotoSession): Promise<void> {
  if (session.buttonsSent || !session.order) return;
  session.buttonsSent = true;
  await tgSendMessageWithInlineKeyboard(
    session.chatId,
    `№${session.order.orderNumber} — расм тури? · Receipt or truck?`,
    kindButtons(session.token, session.order.system),
  );
}

/** Download a Telegram photo and attach it to an order as the chosen kind.
 *  Idempotent: a row whose stored URL already contains this photo's
 *  file_unique_id is the same photo (Telegram redelivery / re-tap). */
async function attachPhoto(
  operatorId: string,
  order: ResolvedOrder,
  photo: PhotoRef,
  kind: PhotoKind,
): Promise<AttachResult> {
  const orderId = order.id;
  try {
    // Gazoblok: receipts only (no truck button is shown for it).
    if (order.system === "GAZOBLOK") {
      const existing = await prisma.gazoblokReceipt.findFirst({
        where: { orderId, imageUrl: { contains: photo.fileUniqueId } },
      });
      if (existing) return "duplicate";
      const filePath = await tgGetFilePath(photo.fileId);
      const buf = await tgDownloadFile(filePath);
      if (!looksLikeImage(buf)) return "invalid_image";
      const ext = imageExtFromBytes(buf) ?? "jpg";
      const url = await saveBufferToUploads(buf, `receipts/gazoblok/order-${orderId}`, `${photo.fileUniqueId}.${ext}`);
      await prisma.gazoblokReceipt.create({
        data: { orderId, paymentId: null, imageUrl: url, source: "TELEGRAM_BOT", uploadedById: operatorId },
      });
      return "added";
    }

    if (kind === "RECEIPT") {
      const existing = await prisma.receipt.findFirst({
        where: { orderId, imageUrl: { contains: photo.fileUniqueId } },
      });
      if (existing) return "duplicate";
    } else {
      const existing = await prisma.galleryPhoto.findFirst({
        where: { orderId, kind: "LOADED", url: { contains: photo.fileUniqueId } },
      });
      if (existing) return "duplicate";
    }

    const filePath = await tgGetFilePath(photo.fileId);
    const buf = await tgDownloadFile(filePath);
    if (!looksLikeImage(buf)) return "invalid_image";
    const ext = imageExtFromBytes(buf) ?? "jpg";

    if (kind === "RECEIPT") {
      const url = await saveBufferToUploads(buf, `receipts/order-${orderId}`, `${photo.fileUniqueId}.${ext}`);
      await prisma.receipt.create({
        data: { orderId, paymentId: null, imageUrl: url, source: "TELEGRAM_BOT", uploadedById: operatorId },
      });
    } else {
      const url = await saveBufferToUploads(buf, `orders/${orderId}`, `loaded-${photo.fileUniqueId}.${ext}`);
      await prisma.galleryPhoto.create({
        data: { orderId, kind: "LOADED", url, uploadedById: operatorId },
      });
    }
    return "added";
  } catch (err) {
    console.error("[operator-photo attach]", err);
    return "error";
  }
}

function attachSummary(orderNumber: string, kind: PhotoKind, added: number, dup: number, failed: number): string {
  const what = kind === "RECEIPT" ? "чек · receipt" : "юк расми · truck photo";
  if (added === 0 && failed === 0 && dup > 0) {
    return `✅ №${orderNumber} — ${what} аллақачон бор · already added`;
  }
  const bits = [`${added} та қўшилди · ${added} added`];
  if (dup) bits.push(`${dup} аллақачон бор · ${dup} already there`);
  if (failed) bits.push(`${failed} хато · ${failed} failed`);
  return `✅ №${orderNumber} ${what}: ${bits.join(", ")}`;
}

/**
 * A PHOTO sent directly to the bot. Resolves the order from the caption if
 * present (then asks the kind), otherwise stashes the photo and asks for the
 * order number.
 */
export async function handleOperatorPhotoDm(dm: OperatorPhotoDm): Promise<void> {
  const chatId = String(dm.chat.id);
  try {
    const fromId = String(dm.from?.id ?? "");
    const sender = await resolveSender(fromId);
    if (!sender) {
      await reply(chatId, "⚠️ Сиз боғланмагансиз ёки рухсат йўқ · You're not linked / not authorized");
      return;
    }

    const photos = dm.photo ?? [];
    const largest = photos[photos.length - 1];
    if (!largest) return;

    const r = await resolveRef(dm.caption);
    if (r.kind === "notfound") {
      await reply(chatId, `⚠️ Буюртма топилмади: ${r.ref} · Order not found`);
      return;
    }
    const order: PhotoSession["order"] = r.kind === "found" ? r.order : null;

    const { session, isNew } = stashPhoto(
      fromId,
      chatId,
      { fileId: largest.file_id, fileUniqueId: largest.file_unique_id },
      order,
    );

    if (session.order) {
      await promptKind(session); // captioned photo → straight to the buttons (once)
    } else if (isNew) {
      await reply(
        chatId,
        "📎 Расм қабул қилинди. Буюртма рақамини юборинг (масалан 06-0010 ёки газоблок учун B-06-0010) · Photo received — send the order number (e.g. 06-0010, or B-06-0010 for gazoblok)",
      );
    }
  } catch (err) {
    console.error("[operator-photo dm]", err);
    try {
      await reply(chatId, "⚠️ Хатолик · Error");
    } catch {
      /* swallow — original error already logged */
    }
  }
}

/**
 * A TEXT DM that may be the order number for a previously-sent photo (the
 * forwarded-photo case). Returns true if it consumed the message. Fast path: a
 * sender with no pending session returns false immediately (in-memory check), so
 * customer/agent text DMs are untouched and pay no DB cost.
 */
export async function handleOperatorPhotoNumber(dm: OperatorPhotoDm): Promise<boolean> {
  const fromId = String(dm.from?.id ?? "");
  if (!fromId || !hasPendingSession(fromId)) return false;

  const chatId = String(dm.chat.id);
  try {
    const sender = await resolveSender(fromId);
    if (!sender) {
      clearSession(fromId);
      return false;
    }

    const session = getSessionByFrom(fromId);
    // Order already resolved (buttons are showing) — stop intercepting their text.
    if (!session || session.order) return false;

    const r = await resolveRef(dm.text);
    if (r.kind === "none") {
      await reply(chatId, "⚠️ Буюртма рақамини юборинг (масалан 06-0010 ёки B-06-0010) · Send the order number (e.g. 06-0010 or B-06-0010)");
      return true; // keep pending — stay in the mini-flow
    }
    if (r.kind === "notfound") {
      await reply(chatId, `⚠️ Буюртма топилмади: ${r.ref} · Order not found`);
      return true; // keep pending — let them retry
    }

    const updated = setSessionOrder(fromId, r.order);
    if (updated) await promptKind(updated);
    return true;
  } catch (err) {
    console.error("[operator-photo number]", err);
    try {
      await reply(chatId, "⚠️ Хатолик · Error");
    } catch {
      /* swallow */
    }
    return true;
  }
}

/**
 * A button tap (🧾 Receipt / 🚚 Truck). Authorizes the tapper for the chosen
 * kind, guards truck photos behind the LOADED status, and attaches every photo
 * in the session.
 */
export async function handleOperatorPhotoCallback(cbq: OperatorPhotoCallbackQuery): Promise<void> {
  const parsed = parsePhotoCallback(cbq.data);
  if (!parsed) return; // not ours — webhook should have routed by prefix, defensive
  const chatId = String(cbq.message?.chat?.id ?? "");
  const messageId = String(cbq.message?.message_id ?? "");
  const fromId = String(cbq.from?.id ?? "");

  try {
    const session = takeSessionByToken(parsed.token);
    if (!session) {
      await tgAnswerCallbackQuery(cbq.id, { text: "⏳ Муддати тугади, қайта юборинг · Expired — re-send" });
      return;
    }

    const sender = await resolveSender(fromId);
    if (!sender || !can(sender, PERM_FOR_KIND[parsed.kind])) {
      await tgAnswerCallbackQuery(cbq.id, { text: "⚠️ Бунга рухсат йўқ · Not authorized for this" });
      return;
    }
    const order = session.order;
    if (!order) {
      await tgAnswerCallbackQuery(cbq.id, { text: "⚠️ Буюртма рақами йўқ · No order number" });
      return;
    }

    if (parsed.kind === "LOADED") {
      // Gazoblok is receipt-only over the bot (no truck button is offered);
      // a LOADED tap here would only come from a stale/tampered client.
      if (order.system === "GAZOBLOK") {
        await tgAnswerCallbackQuery(cbq.id, { text: "⚠️ Газоблок учун эмас · Not supported for gazoblok" });
        return;
      }
      // Re-check status fresh — it may have changed since the photo arrived.
      const fresh = await prisma.order.findUnique({ where: { id: order.id }, select: { status: true } });
      if (!fresh || !canAddLoadedPhoto(fresh.status)) {
        await tgAnswerCallbackQuery(cbq.id, {
          text: "⚠️ Буюртма ҳали юкланмаган · Order isn't loaded yet",
          showAlert: true,
        });
        return;
      }
    }

    let added = 0;
    let dup = 0;
    let failed = 0;
    for (const p of session.photos) {
      const res = await attachPhoto(sender.id, order, p, parsed.kind);
      if (res === "added") added++;
      else if (res === "duplicate") dup++;
      else failed++;
    }

    if (parsed.kind === "LOADED" && added > 0) {
      recordAudit({
        userId: sender.id,
        action: "order.loadedPhotoAdded",
        targetType: "order",
        targetId: order.id,
        message: `Loaded photo(s) added to ${order.orderNumber} via bot (${added})`,
      });
    }

    const summary = attachSummary(order.orderNumber, parsed.kind, added, dup, failed);
    await tgAnswerCallbackQuery(cbq.id, { text: summary });
    if (chatId && messageId) {
      await tgEditMessageText(chatId, messageId, summary, { inlineKeyboard: [] }).catch(() => {});
    }
  } catch (err) {
    console.error("[operator-photo callback]", err);
    try {
      await tgAnswerCallbackQuery(cbq.id, { text: "⚠️ Хатолик · Error" });
    } catch {
      /* swallow */
    }
  }
}
