// Webhook entry for the agent (Plan 08 Task 6). The Telegram webhook calls this
// for each inbound customer text message. It reads the kill-switch + per-chat
// gate FIRST (spec §10), then runs the message through the agent in SHADOW mode
// (generate + log, send nothing — spec §14 Stage 1). Best-effort: it never
// throws, so the webhook always returns 200. Auto-send is a later rollout stage.

import { prisma } from '@/lib/prisma';
import { loadAgentRuntimeConfig, loadKnowledgeBase, shouldAgentHandle } from './runtime-config';
import { createProviderByKey } from './llm/factory';
import { createToolRegistry } from './tools/registry';
import { runAgentShadow, toLlmHistory, type HistoryRow } from './shadow';

const HISTORY_LIMIT = 20;
const DEFAULT_MODEL_KEY = 'claude-opus-4-8';

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
    const provider = createProviderByKey(process.env.AGENT_MODEL_KEY ?? DEFAULT_MODEL_KEY);

    await runAgentShadow(
      { conversationId: conversation.id, history, inboundRaw: inboundText },
      {
        provider,
        tools: createToolRegistry(),
        kbContent,
        ctx: { sharedContactPhone: conversation.sharedContactPhone },
      },
    );
  } catch (err) {
    // Shadow is non-critical; a failure must never break inbox delivery.
    console.error('[agent:webhook-entry]', err);
  }
}
