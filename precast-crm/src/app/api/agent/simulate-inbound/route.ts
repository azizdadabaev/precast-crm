export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { emitInbox } from "@/lib/inbox-bus";
import { runAgentForInbound, runVisionForInbound, runVoiceForInbound } from "@/lib/agent/webhook-entry";
import { loadAgentRuntimeConfig, shouldAgentHandle } from "@/lib/agent/runtime-config";
import { looksLikeImage, imageExtFromBytes, saveBufferToUploads, MAX_IMAGE_SIZE_BYTES } from "@/lib/uploads";

const Body = z
  .object({
    text: z.string().min(1).max(2000).optional(),
    // A floor-plan image to test vision: raw base64 (no data-URL prefix).
    imageBase64: z.string().max(12_000_000).optional(),
    imageMime: z.string().max(60).optional(),
    // A voice note to test transcription: raw base64.
    audioBase64: z.string().max(12_000_000).optional(),
    audioMime: z.string().max(60).optional(),
    conversationId: z.string().optional(),
    displayName: z.string().max(80).optional(),
  })
  .refine((b) => !!b.text || !!b.imageBase64 || !!b.audioBase64, { message: "text, image, or audio is required" });

/**
 * POST /api/agent/simulate-inbound — owner-only (Plan 09 Slice B). Inject a
 * customer message (text OR a floor-plan image) and run the agent on the SAME
 * path the live webhook uses, with NO Telegram. Text → runAgentForInbound (mode
 * decides send/suggest/auto). Image → runVisionForInbound (read dims → echo to
 * confirm; always human-reviewed). Awaits the agent and returns the proposal.
 */
export const POST = withPermission("inbox.access", async (req: NextRequest) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("text or image is required", 422);
  const { text, conversationId, displayName, imageBase64, imageMime, audioBase64, audioMime } = parsed.data;

  const stamp = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 1. Resolve the conversation — reuse the open one, or create a fresh test chat.
  let conversation = conversationId
    ? await prisma.conversation.findUnique({ where: { id: conversationId } })
    : null;
  if (conversationId && !conversation) return fail("conversation not found", 404);
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        channel: "TELEGRAM",
        externalId: stamp,
        displayName: displayName?.trim() || "🧪 Simulated customer",
        lastMessageAt: new Date(),
        lastSnippet: (text ?? "[Media]").slice(0, 80),
        unread: true,
      },
    });
  }

  const config = await loadAgentRuntimeConfig();
  const willRun = shouldAgentHandle(conversation, config);
  const conv = {
    id: conversation.id,
    aiState: conversation.aiState,
    aiPaused: conversation.aiPaused,
    sharedContactPhone: conversation.sharedContactPhone,
  };

  // 2. Image path (vision) ────────────────────────────────────────────────
  if (imageBase64) {
    const buf = Buffer.from(imageBase64, "base64");
    if (!looksLikeImage(buf)) return fail("not a valid JPG/PNG/WEBP image", 422);
    if (buf.length > MAX_IMAGE_SIZE_BYTES) return fail("image too large (max 8 MB)", 413);
    const ext = imageExtFromBytes(buf)!;
    const mediaPath = await saveBufferToUploads(buf, `inbox/${conversation.id}`, `${stamp}.${ext}`);
    const message = await prisma.message.create({
      data: { conversationId: conversation.id, direction: "INBOUND", mediaKind: "IMAGE", mediaPath, telegramMsgId: stamp },
      select: { id: true },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), lastSnippet: "[Rasm · Photo]", unread: true },
    });
    emitInbox({ type: "message:new", conversationId: conversation.id, messageId: message.id });

    await runVisionForInbound(conv, mediaPath, imageMime || "image/jpeg", message.id);
    const proposal = await prisma.agentProposal.findUnique({ where: { inboundMessageId: message.id } });

    const note = proposal
      ? undefined
      : willRun
        ? "Vision ran but produced no proposal — check the Google API key in /agent (or the server logs)."
        : "Agent did not run (kill-switch OFF or chat not AI_HANDLING).";
    return ok({ conversationId: conversation.id, messageId: message.id, ranAgent: willRun, proposal, note });
  }

  // 2b. Voice path (transcription) ─────────────────────────────────────────
  if (audioBase64) {
    const buf = Buffer.from(audioBase64, "base64");
    if (buf.length === 0) return fail("empty audio", 422);
    if (buf.length > MAX_IMAGE_SIZE_BYTES) return fail("audio too large (max 8 MB)", 413);
    const ext = (audioMime ?? "").includes("mpeg") ? "mp3" : "ogg";
    const mediaPath = await saveBufferToUploads(buf, `inbox/${conversation.id}`, `${stamp}.${ext}`);
    const message = await prisma.message.create({
      data: { conversationId: conversation.id, direction: "INBOUND", mediaKind: "VOICE", mediaPath, telegramMsgId: stamp },
      select: { id: true },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), lastSnippet: "[Ovoz · Voice]", unread: true },
    });
    emitInbox({ type: "message:new", conversationId: conversation.id, messageId: message.id });

    await runVoiceForInbound(conv, mediaPath, audioMime || "audio/ogg", message.id);
    const proposal = await prisma.agentProposal.findUnique({ where: { inboundMessageId: message.id } });

    const note = proposal
      ? undefined
      : willRun
        ? "Voice ran but produced no proposal — check the Google API key in /agent (or the server logs)."
        : "Agent did not run (kill-switch OFF or chat not AI_HANDLING).";
    return ok({ conversationId: conversation.id, messageId: message.id, ranAgent: willRun, proposal, note });
  }

  // 3. Text path ──────────────────────────────────────────────────────────
  const message = await prisma.message.create({
    data: { conversationId: conversation.id, direction: "INBOUND", text, telegramMsgId: stamp },
    select: { id: true },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), lastSnippet: (text ?? "").slice(0, 80), unread: true },
  });
  emitInbox({ type: "message:new", conversationId: conversation.id, messageId: message.id });

  await runAgentForInbound(conv, text!, message.id);
  const proposal = await prisma.agentProposal.findUnique({ where: { inboundMessageId: message.id } });

  const note = proposal
    ? undefined
    : willRun
      ? "Agent ran but produced no proposal — check the provider key in /agent (or the server logs)."
      : !config.enabled
        ? "Agent did not run: the kill-switch is OFF. Enable it in /agent."
        : conversation.aiState !== "AI_HANDLING"
          ? `Agent did not run: conversation is ${conversation.aiState} (a human owns this chat).`
          : conversation.aiPaused
            ? "Agent did not run: this chat is paused (aiPaused)."
            : "Agent did not run.";

  return ok({ conversationId: conversation.id, messageId: message.id, ranAgent: willRun, proposal, note });
});
