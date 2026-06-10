export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { igVerifyToken, igAppSecret, verifyWebhookSignature } from "@/lib/instagram/config";
import { parseInstagramWebhook } from "@/lib/instagram/parse";
import { igGetName, igDownloadMedia } from "@/lib/instagram/api";
import { saveBufferToUploads } from "@/lib/uploads";
import { emitInbox } from "@/lib/inbox-bus";
import { runAgentForInbound, runVisionForInbound, runVoiceForInbound } from "@/lib/agent/webhook-entry";

/** GET — Meta's subscription handshake: echo hub.challenge iff the verify token matches. */
export function GET(req: NextRequest): Response {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === igVerifyToken()) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

/**
 * POST — inbound Instagram DMs. The public endpoint is authenticated by the
 * x-hub-signature-256 HMAC over the raw body (fail-closed). Each message is
 * normalized, persisted (channel=INSTAGRAM, media downloaded to /uploads), and
 * dispatched into the SAME channel-agnostic agent pipeline Telegram uses. Always
 * 200s after auth so Meta doesn't retry a permanently-unprocessable event.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"), igAppSecret())) {
    // Diagnostic: distinguishes "Meta never called" (no log at all) from
    // "called but the app secret mismatches" (this log) when DMs don't arrive.
    console.warn("[instagram webhook] signature check failed — app secret mismatch or unsigned probe");
    return new Response("forbidden", { status: 401 });
  }

  const body = JSON.parse(raw || "null");
  const msgs = parseInstagramWebhook(body);
  console.log(`[instagram webhook] delivery ok — ${msgs.length} message(s)`);

  for (const m of msgs) {
    try {
      const snippet = (m.text ?? (m.media ? "[media]" : "")).slice(0, 80);
      const conversation = await prisma.conversation.upsert({
        where: { channel_externalId: { channel: "INSTAGRAM", externalId: m.externalId } },
        create: {
          channel: "INSTAGRAM",
          externalId: m.externalId,
          displayName: await igGetName(m.externalId),
          lastMessageAt: new Date(),
          lastSnippet: snippet,
          unread: true,
        },
        update: { lastMessageAt: new Date(), lastSnippet: snippet, unread: true },
      });

      // Download image/voice for the vision/voice pipeline (best-effort).
      let mediaPath: string | null = null;
      if (m.media && (m.media.kind === "IMAGE" || m.media.kind === "VOICE")) {
        try {
          const buf = await igDownloadMedia(m.media.url);
          const ext = m.media.kind === "IMAGE" ? ".jpg" : ".ogg";
          mediaPath = await saveBufferToUploads(buf, `inbox/${conversation.id}`, `${m.externalMsgId}${ext}`);
        } catch (err) {
          console.error("[instagram media download]", err);
        }
      }

      const mediaKind = m.media?.kind === "IMAGE" ? "IMAGE" : m.media?.kind === "VOICE" ? "VOICE" : null;
      const message = await prisma.message.upsert({
        where: { conversationId_telegramMsgId: { conversationId: conversation.id, telegramMsgId: m.externalMsgId } },
        create: {
          conversationId: conversation.id,
          direction: "INBOUND",
          text: m.text,
          mediaKind: mediaKind as never,
          mediaPath,
          telegramMsgId: m.externalMsgId, // generic external message id (reused column)
        },
        update: {}, // duplicate delivery → no-op
        select: { id: true },
      });
      emitInbox({ type: "message:new", conversationId: conversation.id, messageId: message.id });

      // Dispatch into the channel-agnostic agent pipeline (same as Telegram).
      const conv = {
        id: conversation.id,
        aiState: conversation.aiState,
        aiPaused: conversation.aiPaused,
        sharedContactPhone: conversation.sharedContactPhone,
      };
      if (m.text && m.text.trim()) {
        void runAgentForInbound(conv, m.text, message.id).catch((e) => console.error("[ig agent]", e));
      } else if (m.media?.kind === "IMAGE" && mediaPath) {
        void runVisionForInbound(conv, mediaPath, "image/jpeg", message.id).catch((e) => console.error("[ig vision]", e));
      } else if (m.media?.kind === "VOICE" && mediaPath) {
        void runVoiceForInbound(conv, mediaPath, "audio/ogg", message.id).catch((e) => console.error("[ig voice]", e));
      }
    } catch (err) {
      console.error("[instagram webhook]", err);
    }
  }

  return new Response("ok");
}
