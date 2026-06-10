// Webhook entry for the agent (Plan 08 Task 6). The Telegram webhook calls this
// for each inbound customer text message. It reads the kill-switch + per-chat
// gate FIRST (spec §10), then runs the message through the agent and PERSISTS a
// proposal. What happens next depends on the mode: shadow & suggest send nothing
// (suggest exposes Send/Edit in /inbox); auto auto-sends a reply and routes
// everything else to a human (applyAutoMode). Best-effort: it never throws, so
// the webhook always returns 200.

import { prisma } from '@/lib/prisma';
import { loadAgentRuntimeConfig, loadKnowledgeBase, loadFewShot, shouldAgentHandle } from './runtime-config';
import { createProviderForModelKey, createVisionProvider, createTranscriptionProvider } from './llm/factory';
import { createToolRegistry } from './tools/registry';
import { runAgentShadow, toLlmHistory, type HistoryRow, type ShadowOutcome } from './shadow';
import { saveAgentProposal, saveAgentProposalRow } from './proposal';
import { applyAutoMode, defaultAutoModeDeps } from './auto-mode';
import { detectConversationLanguage, type ReplyLanguage } from './prompt';
import { describeExtractedRooms, visionFallbackReply, mediaCorrectionNote } from './vision';
import { detectLocationIntent, locationReplyText, COMPANY_LOCATION } from './location';
import { extractQuotedRooms, persistConversationDraft } from './persist-quote';
import { extractProofTopics } from './tools/share-proof';
import { loadProofMedia, selectProofMedia } from './proof-media';
import { renderAgentQuoteImage } from './quote-card-shot';
import { sendBusinessPhoto, sendBusinessReply, sendBusinessLocation, sendBusinessProofMedia } from '@/lib/inbox-send';
import { startTyping } from './typing';
import type { RoomInput } from '@/lib/calc-persistence';

const HISTORY_LIMIT = 20;

export interface InboundConversation {
  id: string;
  aiState: string;
  aiPaused: boolean;
  sharedContactPhone: string | null;
}

/** Shared core: load recent history, build prompt + KB, run the agent, and
 *  PERSIST the proposal (send-free). Returns the outcome so the caller decides
 *  what to do next — auto-send for text (auto mode); voice/vision callers
 *  persist-only and never auto-send. */
async function generateAndPersistProposal(
  conversation: InboundConversation,
  inboundText: string,
  inboundMessageId: string,
  config: { modelKey: string },
): Promise<{ outcome: ShadowOutcome; quotedRooms: RoomInput[]; proofTopics: (string | null)[] }> {
  // Recent prior turns (this message excluded; media-only rows dropped later).
  const rows = await prisma.message.findMany({
    where: { conversationId: conversation.id, id: { not: inboundMessageId }, text: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
    select: { direction: true, text: true },
  });
  const history = toLlmHistory(rows.reverse() as HistoryRow[]);
  const [kbContent, fewShot] = await Promise.all([loadKnowledgeBase(), loadFewShot()]);
  // Model is owner-selected via the control panel (config.modelKey); the API key
  // resolves from UI-saved DB keys → env.
  const provider = await createProviderForModelKey(config.modelKey);
  const outcome = await runAgentShadow(
    { conversationId: conversation.id, history, inboundRaw: inboundText },
    { provider, tools: createToolRegistry(), kbContent, fewShot, ctx: { sharedContactPhone: conversation.sharedContactPhone } },
  );
  await saveAgentProposal(outcome, { conversationId: conversation.id, inboundMessageId, modelKey: config.modelKey });
  // Rooms the agent priced THIS turn (from the get_quote tool inputs in the turn
  // transcript) — used by Auto mode to save an operator-side draft. Slice off the
  // prior history so a long chat never resurrects superseded dimensions.
  const turnMessages = outcome.result ? outcome.result.messages.slice(history.length) : [];
  const quotedRooms = extractQuotedRooms(turnMessages);
  // Topics the agent asked to show proof for THIS turn (share_proof tool calls);
  // the actual clips are sent post-turn, mode-gated.
  const proofTopics = extractProofTopics(turnMessages);
  return { outcome, quotedRooms, proofTopics };
}

/**
 * Auto-mode only: persist the operator-side DRAFT Project for this quote, then
 * send the rendered calculation-summary image into the chat — right AFTER the
 * short price reply has gone out. Best-effort: any failure is logged and
 * swallowed so the already-sent reply is never affected. The customer's text
 * reply stays short; this image is the equivalent of the manual "Send to chat".
 */
async function saveDraftAndSendSummary(
  conversation: InboundConversation,
  rooms: RoomInput[],
  opts: { source: 'text' | 'image' | 'voice'; language: ReplyLanguage },
): Promise<void> {
  try {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversation.id },
      select: { displayName: true },
    });
    const draft = await persistConversationDraft(
      {
        id: conversation.id,
        displayName: conv?.displayName ?? null,
        sharedContactPhone: conversation.sharedContactPhone,
      },
      rooms,
    );
    if (!draft) return;

    // Pixel-identical to the operator's "Send to chat" card (headless screenshot
    // of the real CalculationShareCard; next/og fallback if the browser is
    // unavailable). The customer's text reply stays short — this is the image.
    const png = await renderAgentQuoteImage(draft.projectId);
    await sendBusinessPhoto({
      conversationId: conversation.id,
      photo: png,
      mime: 'image/png',
      userId: null,
      filename: `quote-${draft.draftNumber ?? draft.projectId}.png`,
    });

    // For EXTRACTED dimensions (drawing/voice), follow the image with a line that
    // states what we read and invites a typed correction → recalculation. Typed
    // dimensions don't need it (the customer typed them).
    if (opts.source !== 'text') {
      await sendBusinessReply({
        conversationId: conversation.id,
        text: mediaCorrectionNote(rooms, opts.language, opts.source),
        userId: null,
      });
    }
  } catch (err) {
    console.error('[agent:draft+summary]', err);
  }
}

/**
 * Auto-mode only: the agent called share_proof this turn → send the actual
 * curated clips into the chat right after its short confident line. One batch
 * per turn, capped (selectProofMedia), by stored file_id (no upload). If the
 * library is empty we send nothing — the agent already told the customer the
 * team will follow up. Best-effort: failures are logged and swallowed.
 */
async function sendProofForTurn(
  conversation: InboundConversation,
  topics: (string | null)[],
): Promise<void> {
  if (topics.length === 0) return;
  try {
    const { items } = await loadProofMedia();
    if (items.length === 0) return;
    const topic = topics.find((t) => t) ?? null; // first explicit topic, else default set
    const selected = selectProofMedia(items, { topic });
    for (const item of selected) {
      await sendBusinessProofMedia({
        conversationId: conversation.id,
        kind: item.kind,
        fileId: item.fileId,
        previewPath: item.previewPath, // Instagram sends this as a public URL
        caption: item.caption ?? null,
        userId: null,
      });
    }
  } catch (err) {
    console.error('[agent:proof-send]', err);
  }
}

/**
 * Auto-mode quick reply for "where are you?" — the company address text + a
 * native map pin, in the conversation language. Works with no history (the caller
 * gated on Auto mode + location intent). Best-effort.
 */
async function sendCompanyLocation(
  conversation: InboundConversation,
  inboundText: string,
  inboundMessageId: string,
): Promise<void> {
  const rows = await prisma.message.findMany({
    where: { conversationId: conversation.id, id: { not: inboundMessageId }, text: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
    select: { direction: true, text: true },
  });
  const language = detectConversationLanguage(inboundText, toLlmHistory(rows.reverse() as HistoryRow[]));
  await sendBusinessReply({ conversationId: conversation.id, text: locationReplyText(language), userId: null });
  await sendBusinessLocation({
    conversationId: conversation.id,
    latitude: COMPANY_LOCATION.lat,
    longitude: COMPANY_LOCATION.long,
    userId: null,
  });
}

export async function runAgentForInbound(
  conversation: InboundConversation,
  inboundText: string,
  excludeMessageId: string,
  source: 'text' | 'image' | 'voice' = 'text',
): Promise<void> {
  try {
    const config = await loadAgentRuntimeConfig();
    if (!shouldAgentHandle(conversation, config)) return;

    // Company location: a request for our location (to visit / load trucks) — even
    // a bare "lokatsiya?" with no history — is answered directly in Auto mode with
    // the address + a native map pin, skipping the quote flow.
    if (config.mode === 'auto' && detectLocationIntent(inboundText)) {
      await sendCompanyLocation(conversation, inboundText, excludeMessageId);
      return;
    }

    // Show the customer a live "typing…" indicator while we prepare an auto reply.
    // Only the direct TEXT path starts it here; for image/voice the vision/voice
    // handler already started one covering its transcription/extraction too.
    const typing = config.mode === 'auto' && source === 'text' ? startTyping(conversation.id) : null;
    try {
      const { outcome, quotedRooms, proofTopics } = await generateAndPersistProposal(
        conversation,
        inboundText,
        excludeMessageId,
        config,
      );

      // Auto mode (spec §14 Stage 3): auto-send a reply; route everything else to a
      // human. Orders are NEVER auto-placed — request_approval escalates to the
      // operator who places it in /inbox. shadow/suggest do nothing here.
      if (config.mode === 'auto') {
        await applyAutoMode(
          outcome,
          { conversationId: conversation.id, inboundMessageId: excludeMessageId },
          defaultAutoModeDeps(),
        );
        // Auto only: once the short price has been sent, save the operator-side
        // draft Project and send the calculation-summary image after it.
        if (outcome.decision.action === 'reply' && quotedRooms.length > 0) {
          await saveDraftAndSendSummary(conversation, quotedRooms, {
            source,
            language: outcome.language as ReplyLanguage,
          });
        }
        // Auto only: the agent asked to show proof this turn → send the clips after
        // its line. (PROOF stage — the strongest buying signal, delivered instantly.)
        if (outcome.decision.action === 'reply' && proofTopics.length > 0) {
          await sendProofForTurn(conversation, proofTopics);
        }
      }
    } finally {
      typing?.stop();
    }
  } catch (err) {
    // Shadow is non-critical; a failure must never break inbox delivery.
    console.error('[agent:webhook-entry]', err);
  }
}

/**
 * Floor-plan vision (spec §4.5). Gemini reads the room dimensions; the read is
 * accurate enough that we PROCEED without a confirm step. On a clear read we store
 * the dimensions on the image message (a transcription, like voice) and run the
 * SAME pipeline typed dimensions use (runAgentForInbound) — quote, short price, a
 * conversation-linked draft, and the 1:1 summary image, honoring the mode. If the
 * plan can't be read, we ask for typed dimensions. Best-effort: never throws.
 */
export async function runVisionForInbound(
  conversation: InboundConversation,
  mediaPath: string,
  mimeType: string,
  inboundMessageId: string,
  /** The image's caption, if any. Vision LEADS for captioned images; when the
   *  image turns out non-construction, the caption falls through to the normal
   *  text agent so a joke/forward still gets a (light) human reply. */
  caption?: string | null,
): Promise<void> {
  let typing: ReturnType<typeof startTyping> | null = null;
  try {
    const config = await loadAgentRuntimeConfig();
    if (!shouldAgentHandle(conversation, config)) return;
    // "typing…" across the whole prepare window — Gemini read + quote + image.
    if (config.mode === 'auto') typing = startTyping(conversation.id);

    // Vision is fixed to Gemini (spec §3/§4.5), regardless of the brain model.
    const { resolveApiKey } = await import('./provider-keys');
    const apiKey = await resolveApiKey('google');
    if (!apiKey) {
      console.warn('[agent:vision] no Google API key configured — skipping image');
      return;
    }
    const provider = createVisionProvider({ apiKey });
    if (!provider.extractDimensions) return;

    // Read the saved image bytes → base64. mediaPath is "/uploads/...".
    const { readFile } = await import('fs/promises');
    const { join } = await import('path');
    const data = (await readFile(join(process.cwd(), 'public', mediaPath))).toString('base64');

    const dims = await provider.extractDimensions({ data, mimeType });

    // No text on an image turn — keep the conversation's established language.
    const rows = await prisma.message.findMany({
      where: { conversationId: conversation.id, id: { not: inboundMessageId }, text: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      select: { direction: true, text: true },
    });
    const language = detectConversationLanguage('', toLlmHistory(rows.reverse() as HistoryRow[]));

    // Clear read → treat the plan as typed dimensions: store them on the image
    // message (so the inbox + history show them), then run the SAME pipeline typed
    // dimensions use — quote, short price, conversation-linked draft, 1:1 image,
    // honoring the mode. No confirmation step: Gemini's vision is accurate enough.
    if (dims.found && dims.confidence === 'high' && dims.rooms.length > 0) {
      const dimsText = describeExtractedRooms(dims.rooms, language);
      await prisma.message.update({ where: { id: inboundMessageId }, data: { text: dimsText } });
      await runAgentForInbound(conversation, dimsText, inboundMessageId, 'image');
      return;
    }

    // NOT a construction image at all (a product ad, a meme, a selfie…) → never
    // ask for "room dimensions" (the robotic tell; live bug: a forwarded cap ad
    // got a dimensions request — twice). If the image carried a caption, hand it
    // to the normal TEXT agent now (vision led; the OFF-TOPIC prompt rule gives
    // jokes/forwards a light human reply). No caption → stay silent.
    if (dims.isPlanLike === false) {
      if (caption && caption.trim()) {
        console.log('[agent:vision] non-construction image — routing caption to the text agent');
        await runAgentForInbound(conversation, caption, inboundMessageId, 'text');
      } else {
        console.log('[agent:vision] non-construction image — no dimensions fallback sent');
      }
      return;
    }

    // Couldn't read it → ask for typed dimensions. Auto mode sends the ask;
    // otherwise persist it as a proposal for the operator to send.
    const fallback = visionFallbackReply(language);
    if (config.mode === 'auto') {
      await sendBusinessReply({ conversationId: conversation.id, text: fallback, userId: null });
    } else {
      await saveAgentProposalRow({
        conversationId: conversation.id,
        inboundMessageId,
        language,
        decision: 'reply',
        reply: fallback,
        escalationReason: null,
        screen: { tooLong: false, injection: false, link: false, verdict: 'ok' },
        escalatedEarly: false,
        modelKey: provider.model.key,
        toolCalls: [],
        usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
        turns: 1,
        confidence: dims.confidence,
      });
    }
  } catch (err) {
    console.error('[agent:vision]', err);
  } finally {
    typing?.stop();
  }
}

/**
 * Voice note (spec §3 / §4.5). Transcribe with Gemini (the fixed STT path), store
 * the transcript on the message so the inbox + history show it, then run the SAME
 * pipeline typed dimensions use (runAgentForInbound) — quote, short price, a
 * conversation-linked draft, and the 1:1 summary image, honoring the mode. The
 * transcription is accurate enough to proceed without a confirm step (like vision).
 * Never throws.
 */
export async function runVoiceForInbound(
  conversation: InboundConversation,
  mediaPath: string,
  mimeType: string,
  inboundMessageId: string,
): Promise<void> {
  let typing: ReturnType<typeof startTyping> | null = null;
  try {
    const config = await loadAgentRuntimeConfig();
    if (!shouldAgentHandle(conversation, config)) return;
    // "typing…" across transcription + quote + image.
    if (config.mode === 'auto') typing = startTyping(conversation.id);

    const { resolveApiKey } = await import('./provider-keys');
    const apiKey = await resolveApiKey('google');
    if (!apiKey) {
      console.warn('[agent:voice] no Google API key configured — skipping voice note');
      return;
    }
    const provider = createTranscriptionProvider({ apiKey });
    if (!provider.transcribe) return;

    const { readFile } = await import('fs/promises');
    const { join } = await import('path');
    const data = (await readFile(join(process.cwd(), 'public', mediaPath))).toString('base64');
    const transcript = (await provider.transcribe({ data, mimeType })).trim();
    if (!transcript) {
      console.warn('[agent:voice] empty transcript — skipping');
      return;
    }

    // Surface the transcript on the voice message (the inbox shows it + it feeds
    // future history), then run the normal pipeline on it — same as a typed message
    // (quote, short price, conversation-linked draft, 1:1 image), honoring the mode.
    await prisma.message.update({ where: { id: inboundMessageId }, data: { text: transcript } });
    await runAgentForInbound(conversation, transcript, inboundMessageId, 'voice');
  } catch (err) {
    console.error('[agent:voice]', err);
  } finally {
    typing?.stop();
  }
}
