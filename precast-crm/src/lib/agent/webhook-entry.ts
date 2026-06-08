// Webhook entry for the agent (Plan 08 Task 6). The Telegram webhook calls this
// for each inbound customer text message. It reads the kill-switch + per-chat
// gate FIRST (spec §10), then runs the message through the agent and PERSISTS a
// proposal. What happens next depends on the mode: shadow & suggest send nothing
// (suggest exposes Send/Edit in /inbox); auto auto-sends a reply and routes
// everything else to a human (applyAutoMode). Best-effort: it never throws, so
// the webhook always returns 200.

import { prisma } from '@/lib/prisma';
import { loadAgentRuntimeConfig, loadKnowledgeBase, shouldAgentHandle } from './runtime-config';
import { createProviderForModelKey } from './llm/factory';
import { createToolRegistry } from './tools/registry';
import { runAgentShadow, toLlmHistory, type HistoryRow } from './shadow';
import { saveAgentProposal } from './proposal';
import { applyAutoMode, defaultAutoModeDeps } from './auto-mode';

const HISTORY_LIMIT = 20;

export interface InboundConversation {
  id: string;
  aiState: string;
  aiPaused: boolean;
  sharedContactPhone: string | null;
}

export async function runAgentForInbound(
  conversation: InboundConversation,
  inboundText: string,
  excludeMessageId: string,
): Promise<void> {
  try {
    const config = await loadAgentRuntimeConfig();
    if (!shouldAgentHandle(conversation, config)) return;

    // Recent prior turns (this message excluded; media-only rows dropped later).
    const rows = await prisma.message.findMany({
      where: { conversationId: conversation.id, id: { not: excludeMessageId }, text: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      select: { direction: true, text: true },
    });
    const history = toLlmHistory(rows.reverse() as HistoryRow[]);
    const kbContent = await loadKnowledgeBase();
    // Model is owner-selected via the control panel (config.modelKey); the API
    // key resolves from UI-saved DB keys → env.
    const provider = await createProviderForModelKey(config.modelKey);

    const outcome = await runAgentShadow(
      { conversationId: conversation.id, history, inboundRaw: inboundText },
      {
        provider,
        tools: createToolRegistry(),
        kbContent,
        ctx: { sharedContactPhone: conversation.sharedContactPhone },
      },
    );

    // Persist the proposal (Plan 09 Slice B): turn the console-only Shadow log
    // into an inbox-visible, eval-queryable row. `excludeMessageId` is the inbound
    // Message that triggered this run (its UNIQUE key makes a retry a no-op).
    // Persisting is NOT sending — Shadow stays send/write-free.
    await saveAgentProposal(outcome, {
      conversationId: conversation.id,
      inboundMessageId: excludeMessageId,
      modelKey: config.modelKey,
    });

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
