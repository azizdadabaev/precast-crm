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
import { saveAgentProposal, saveAgentProposalRow, type AgentProposalRow } from './proposal';
import { applyAutoMode, defaultAutoModeDeps } from './auto-mode';
import { detectConversationLanguage } from './prompt';
import { buildVisionEcho } from './vision';

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
): Promise<ShadowOutcome> {
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
  return outcome;
}

export async function runAgentForInbound(
  conversation: InboundConversation,
  inboundText: string,
  excludeMessageId: string,
): Promise<void> {
  try {
    const config = await loadAgentRuntimeConfig();
    if (!shouldAgentHandle(conversation, config)) return;

    const outcome = await generateAndPersistProposal(conversation, inboundText, excludeMessageId, config);

    // Auto mode (spec §14 Stage 3): auto-send a reply; route everything else to a
    // human. Orders are NEVER auto-placed — request_approval escalates to the
    // operator who places it in /inbox. shadow/suggest do nothing here.
    if (config.mode === 'auto') {
      await applyAutoMode(
        outcome,
        { conversationId: conversation.id, inboundMessageId: excludeMessageId },
        defaultAutoModeDeps(),
      );
    }
  } catch (err) {
    // Shadow is non-critical; a failure must never break inbox delivery.
    console.error('[agent:webhook-entry]', err);
  }
}

/**
 * Floor-plan vision (spec §4.5). For an inbound IMAGE: read the room dimensions
 * with the Gemini vision provider, then propose an ECHO-to-confirm reply (never a
 * quote off the sketch). The proposal is persisted and is ALWAYS human-reviewed —
 * it never auto-sends, regardless of mode (photo flows are human-checked, §10).
 * Best-effort: never throws.
 */
export async function runVisionForInbound(
  conversation: InboundConversation,
  mediaPath: string,
  mimeType: string,
  inboundMessageId: string,
): Promise<void> {
  try {
    const config = await loadAgentRuntimeConfig();
    if (!shouldAgentHandle(conversation, config)) return;

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
    const decision = buildVisionEcho(dims, language);

    // Persist as a proposal — NO auto-send (image-derived → always human-reviewed).
    const row: AgentProposalRow = {
      conversationId: conversation.id,
      inboundMessageId,
      language,
      decision: decision.action,
      reply: decision.action === 'reply' ? decision.reply : null,
      escalationReason: decision.action === 'escalate' ? decision.reason : null,
      screen: { tooLong: false, injection: false, link: false, verdict: 'ok' },
      escalatedEarly: false,
      modelKey: provider.model.key,
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
      turns: 1,
      confidence: dims.confidence,
    };
    await saveAgentProposalRow(row);
  } catch (err) {
    console.error('[agent:vision]', err);
  }
}

/**
 * Voice note (spec §3 / §4.5). Transcribe with Gemini (the fixed STT path), store
 * the transcript on the message so the inbox + history show it, then run the agent
 * on the transcript and PERSIST the proposal. Voice-derived proposals are ALWAYS
 * human-reviewed — never auto-sent, regardless of mode (spec §2/§10). Never throws.
 */
export async function runVoiceForInbound(
  conversation: InboundConversation,
  mediaPath: string,
  mimeType: string,
  inboundMessageId: string,
): Promise<void> {
  try {
    const config = await loadAgentRuntimeConfig();
    if (!shouldAgentHandle(conversation, config)) return;

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
    // future history). Then run the agent on it — persist-only, no auto-send.
    await prisma.message.update({ where: { id: inboundMessageId }, data: { text: transcript } });
    await generateAndPersistProposal(conversation, transcript, inboundMessageId, config);
  } catch (err) {
    console.error('[agent:voice]', err);
  }
}
