export const runtime = "nodejs";

import { NextRequest } from "next/server";
import path from "path";
import { prisma } from "@/lib/prisma";
import { parseBusinessUpdate, type ParsedMedia } from "@/lib/telegram/parse";
import { isValidWebhookSecret } from "@/lib/telegram/webhook-secret";
import { tgGetFilePath, tgDownloadFile, TELEGRAM_MAX_DOWNLOAD_BYTES } from "@/lib/telegram/api";
import { saveBufferToUploads } from "@/lib/uploads";
import { emitInbox } from "@/lib/inbox-bus";

const EXT_BY_KIND: Record<string, string> = {
  IMAGE: ".jpg", VIDEO: ".mp4", VIDEO_NOTE: ".mp4", VOICE: ".ogg", AUDIO: ".mp3", DOCUMENT: "",
};

function snippetFor(text: string | null, media: ParsedMedia | null): string {
  if (text && text.trim()) return text.trim().slice(0, 80);
  if (!media) return "";
  switch (media.kind) {
    case "IMAGE": return "[Расм · Photo]";
    case "VIDEO": return "[Видео · Video]";
    case "VIDEO_NOTE": return "[Видео · Round video]";
    case "VOICE": return "[Овоз · Voice]";
    case "AUDIO": return "[Аудио · Audio]";
    case "DOCUMENT": return `[Файл · ${media.fileName ?? "Document"}]`;
    case "LOCATION": return "[Жойлашув · Location]";
    default: return "[Хабар · Message]";
  }
}

export async function POST(req: NextRequest) {
  // 1. Authenticate by secret-token header (fail closed).
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!isValidWebhookSecret(secret, process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return new Response("forbidden", { status: 401 });
  }

  // 2. Parse. Malformed / non-business updates are acked with 200 so
  //    Telegram doesn't retry a permanently-unprocessable update.
  const update = await req.json().catch(() => null);
  const parsed = update ? parseBusinessUpdate(update) : null;
  if (!parsed || !parsed.chatId) return new Response("ok");

  try {
    // 3. Upsert the conversation.
    const bump = !parsed.isEdited;
    const conversation = await prisma.conversation.upsert({
      where: { channel_externalId: { channel: "TELEGRAM", externalId: parsed.chatId } },
      create: {
        channel: "TELEGRAM",
        externalId: parsed.chatId,
        businessConnectionId: parsed.businessConnectionId,
        displayName: parsed.displayName,
        username: parsed.username,
        lastMessageAt: new Date(),
        lastSnippet: snippetFor(parsed.text, parsed.media),
        unread: !parsed.outgoing,
      },
      update: {
        ...(!parsed.outgoing ? { displayName: parsed.displayName, username: parsed.username } : {}),
        businessConnectionId: parsed.businessConnectionId,
        ...(bump
          ? { lastMessageAt: new Date(), lastSnippet: snippetFor(parsed.text, parsed.media), unread: !parsed.outgoing }
          : {}),
      },
    });

    // 4. Edited message → update text in place if we have it; else fall through to insert.
    if (parsed.isEdited) {
      const existing = await prisma.message.findUnique({
        where: { conversationId_telegramMsgId: { conversationId: conversation.id, telegramMsgId: parsed.telegramMsgId } },
        select: { id: true },
      });
      if (existing) {
        await prisma.message.update({ where: { id: existing.id }, data: { text: parsed.text } });
        emitInbox({ type: "message:edited", conversationId: conversation.id, messageId: existing.id });
        return new Response("ok");
      }
    }

    // 5. Resolve media (download ≤ limit; placeholder otherwise). Never throws out of the route.
    let mediaPath: string | null = null;
    let mediaName: string | null = parsed.media?.fileName ?? null;
    let mediaMeta: Record<string, unknown> | null = parsed.media?.meta ?? null;
    const mediaKind = parsed.media?.kind ?? null;

    if (parsed.media && parsed.media.fileId && parsed.media.kind !== "LOCATION" && parsed.media.kind !== "OTHER") {
      const size = parsed.media.fileSize ?? 0;
      if (size > TELEGRAM_MAX_DOWNLOAD_BYTES) {
        mediaMeta = { ...(mediaMeta ?? {}), oversize: true };
      } else {
        // size unknown (0) or within limit — attempt the download
        try {
          const filePath = await tgGetFilePath(parsed.media.fileId);
          const buf = await tgDownloadFile(filePath);
          const ext = path.extname(filePath) || EXT_BY_KIND[parsed.media.kind] || "";
          const fname = `${parsed.telegramMsgId}${ext}`;
          mediaPath = await saveBufferToUploads(buf, `inbox/${conversation.id}`, fname);
        } catch {
          mediaMeta = { ...(mediaMeta ?? {}), unavailable: true };
        }
      }
    }

    // 6. Insert the inbound message (dedupe on (conversationId, telegramMsgId)).
    const message = await prisma.message.upsert({
      where: { conversationId_telegramMsgId: { conversationId: conversation.id, telegramMsgId: parsed.telegramMsgId } },
      create: {
        conversationId: conversation.id,
        direction: parsed.outgoing ? "OUTBOUND" : "INBOUND",
        text: parsed.text,
        mediaKind: mediaKind as never,
        mediaPath,
        mediaName,
        mediaMeta: mediaMeta as never,
        telegramMsgId: parsed.telegramMsgId,
        mediaGroupId: parsed.mediaGroupId,
      },
      update: {}, // duplicate delivery — no-op
      select: { id: true, createdAt: true },
    });

    // 7. Notify live listeners.
    emitInbox({ type: "message:new", conversationId: conversation.id, messageId: message.id });
  } catch (err) {
    // Log but still 200 — a 500 makes Telegram retry the same update for 24h.
    console.error("[telegram webhook]", err);
  }

  return new Response("ok");
}
