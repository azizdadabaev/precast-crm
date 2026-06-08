// Webhook entry for the agent (Plan 08 Task 6). The Telegram webhook calls this
// for each inbound customer text message. It reads the kill-switch + per-chat
// gate FIRST (spec §10), then runs the message through the agent in SHADOW mode
// (generate + log, send nothing — spec §14 Stage 1). Best-effort: it never
// throws, so the webhook always returns 200. Auto-send is a later rollout stage.

import { prisma } from '@/lib/prisma';
import { loadAgentRuntimeConfig, loadKnowledgeBase, shouldAgentHandle } from './runtime-config';
import { createProviderForModelKey } from './llm/factory';
import { createToolRegistry } from './tools/registry';
import { runAgentShadow, toLlmHistory, type HistoryRow } from './shadow';
import { saveAgentProposal } from './proposal';

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
    if (config.mode !== 'shadow') {
      // suggest/auto are later rollout stages (Plan 09); leave a breadcrumb so a
      // premature mode change isn't a silent no-op.
      console.warn(`[agent:webhook-entry] mode "${config.mode}" not implemented yet — skipping`);
      return;
    }

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
  } catch (err) {
    // Shadow is non-critical; a failure must never break inbox delivery.
    console.error('[agent:webhook-entry]', err);
  }
}
