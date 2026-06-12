export const runtime = "nodejs";

import { NextRequest } from "next/server";
import path from "path";
import { prisma } from "@/lib/prisma";
import { parseBusinessUpdate, type ParsedMedia } from "@/lib/telegram/parse";
import { isValidWebhookSecret } from "@/lib/telegram/webhook-secret";
import { tgGetFilePath, tgDownloadFile, TELEGRAM_MAX_DOWNLOAD_BYTES } from "@/lib/telegram/api";
import { saveBufferToUploads } from "@/lib/uploads";
import { emitInbox } from "@/lib/inbox-bus";
import { runAgentForInbound, runVisionForInbound, runVoiceForInbound } from "@/lib/agent/webhook-entry";
import { enqueueInboundText } from "@/lib/agent/burst";
import { handleApprovalCallback } from "@/lib/agent/approval-webhook";

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

  // Deletions from a connected business account (the user deleted messages on
  // their phone/Desktop Telegram) — mirror them into the CRM. This update has
  // no message body; it's a batch of message ids for one chat.
  const del = update?.deleted_business_messages;
  if (del?.chat?.id != null && Array.isArray(del.message_ids)) {
    try {
      const conv = await prisma.conversation.findUnique({
        where: { channel_externalId: { channel: "TELEGRAM", externalId: String(del.chat.id) } },
        select: { id: true },
      });
      if (conv) {
        const ids = del.message_ids.map((m: number) => String(m));
        const rows = await prisma.message.findMany({
          where: { conversationId: conv.id, telegramMsgId: { in: ids } },
          select: { id: true },
        });
        if (rows.length) {
          await prisma.message.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
          for (const r of rows) {
            emitInbox({ type: "message:deleted", conversationId: conv.id, messageId: r.id });
          }
        }
      }
    } catch (err) {
      console.error("[telegram webhook deleted_business_messages]", err);
    }
    return new Response("ok");
  }

  // Staff [Approve]/[Reject] tap on an Action Card arrives as a callback_query
  // (not a business message). Commit/reject via the approval handler, ack fast.
  if (update?.callback_query) {
    void handleApprovalCallback(update.callback_query, {
      secret: process.env.QUOTE_SIGNING_SECRET ?? "",
    }).catch((err) => console.error("[telegram webhook callback]", err));
    return new Response("ok");
  }

  const parsed = update ? parseBusinessUpdate(update) : null;
  if (!parsed || !parsed.chatId) return new Response("ok");

  try {
    // 3. Upsert the conversation.
    const bump = !parsed.isEdited;
    // Capture a client's shared-contact phone (digits-only) for the
    // calculator handoff. Inbound only — never store the owner's own
    // number from an outgoing message.
    const contactPhonePatch =
      !parsed.outgoing && parsed.contact?.phone
        ? { sharedContactPhone: parsed.contact.phone }
        : {};
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
        ...contactPhonePatch,
      },
      update: {
        ...(!parsed.outgoing ? { displayName: parsed.displayName, username: parsed.username } : {}),
        businessConnectionId: parsed.businessConnectionId,
        ...contactPhonePatch,
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

    // Albums: Telegram delivers a media group as N separate updates — run
    // vision ONLY on the group's first photo, or the customer gets N identical
    // replies (live bug: a 2-photo forward → 2 fallbacks).
    let firstOfMediaGroup = true;
    if (parsed.mediaGroupId) {
      const groupCount = await prisma.message.count({
        where: { conversationId: conversation.id, mediaGroupId: parsed.mediaGroupId },
      });
      firstOfMediaGroup = groupCount <= 1; // only the row we just inserted
    }
    // For a CAPTIONED image, vision LEADS (one brain at a time): the caption is
    // handed to runVisionForInbound, which either proceeds with the plan flow or
    // falls the caption through to the text agent when the image turns out to be
    // non-construction — otherwise the text agent and the vision pipeline both
    // answer the same message (live bug: a captioned cap ad got a beam spiel AND
    // dimension requests).
    const visionWillRun = mediaKind === "IMAGE" && !!mediaPath && firstOfMediaGroup;

    // 8. AI agent (Plan 08 Task 6) — inbound customer TEXT, fire-and-forget so the
    //    webhook still 200s fast. Rapid message bursts are COALESCED per
    //    conversation (burst.ts): the agent reads the whole burst, then replies
    //    once — never per-message racing duplicate answers.
    if (!parsed.outgoing && !parsed.isEdited && parsed.text && parsed.text.trim() && !visionWillRun) {
      enqueueInboundText(
        {
          id: conversation.id,
          aiState: conversation.aiState,
          aiPaused: conversation.aiPaused,
          sharedContactPhone: conversation.sharedContactPhone,
        },
        parsed.text,
        message.id,
        (conv, joined, ids) => runAgentForInbound(conv, joined, ids),
      );
    }

    // 8b. AI vision (spec §4.5) — inbound floor-plan IMAGE → read dimensions →
    //     echo them back to confirm. Fire-and-forget; image-derived proposals are
    //     always human-reviewed (never auto-sent).
    if (!parsed.outgoing && !parsed.isEdited && visionWillRun && mediaPath) {
      void runVisionForInbound(
        {
          id: conversation.id,
          aiState: conversation.aiState,
          aiPaused: conversation.aiPaused,
          sharedContactPhone: conversation.sharedContactPhone,
        },
        mediaPath,
        "image/jpeg",
        message.id,
        parsed.text, // caption — falls through to the text agent if the image is non-construction
      ).catch((e) => console.error("[telegram webhook vision]", e));
    }

    // 8c. AI voice (spec §3/§4.5) — inbound VOICE note → transcribe → run the
    //     agent. Fire-and-forget; voice-derived proposals are always human-reviewed.
    if (!parsed.outgoing && !parsed.isEdited && mediaKind === "VOICE" && mediaPath) {
      void runVoiceForInbound(
        {
          id: conversation.id,
          aiState: conversation.aiState,
          aiPaused: conversation.aiPaused,
          sharedContactPhone: conversation.sharedContactPhone,
        },
        mediaPath,
        "audio/ogg",
        message.id,
      ).catch((e) => console.error("[telegram webhook voice]", e));
    }
  } catch (err) {
    // Log but still 200 — a 500 makes Telegram retry the same update for 24h.
    console.error("[telegram webhook]", err);
  }

  return new Response("ok");
}
