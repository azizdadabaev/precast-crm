// share_proof — send curated proof media (installation / finished-object videos
// and photos) the instant a customer asks to SEE evidence (the PROOF stage).
//
// Like the quote tools, this tool returns a SUMMARY to the model (so it can add
// one confident line); the actual send is performed post-turn by the webhook
// layer, mode-gated (auto sends; suggest surfaces; shadow logs) — see
// extractProofTopics + the send integration. "No media on file" is a normal
// answer (available:false), NOT an escalation — the agent falls back to "the
// team will send them" without ever saying it "can't".

import { z } from 'zod';
import {
  type AgentTool,
  type AgentToolDefinition,
  type ToolResult,
  toolOk,
} from './types';
import { loadProofMedia, selectProofMedia, type ProofMediaConfig } from '../proof-media';
import type { LlmMessage } from '../llm/provider';

export const ShareProofInput = z.object({
  topic: z.string().optional(),
});

export interface ShareProofData {
  available: boolean;
  count: number;
  items: { id: string; kind: 'VIDEO' | 'PHOTO'; title: string }[];
  topic: string | null;
}

/** Pure-ish core (loader injectable for tests). Selects the clips that WOULD be
 *  sent and reports them to the model — never sends. */
export async function runShareProof(
  raw: unknown,
  loader: () => Promise<ProofMediaConfig> = loadProofMedia,
): Promise<ToolResult<ShareProofData>> {
  const parsed = ShareProofInput.safeParse(raw);
  const topic = parsed.success ? parsed.data.topic ?? null : null;
  const { items } = await loader();
  const selected = selectProofMedia(items, { topic });
  return toolOk({
    available: selected.length > 0,
    count: selected.length,
    items: selected.map((i) => ({ id: i.id, kind: i.kind, title: i.title })),
    topic,
  });
}

export const shareProofDefinition: AgentToolDefinition = {
  name: 'share_proof',
  description:
    'Send the customer REAL proof media — installation and finished-object videos/photos from the company library. ' +
    'Call this the moment the customer asks to SEE evidence ("videosi bormi?", "rasm bormi?", "obyektlaringizni ko\'rsam bo\'ladimi?", "namuna bormi?"). ' +
    'Optionally pass a topic to pick relevant clips. The clips are delivered to the customer automatically — you just add ONE short confident line (e.g. "Albatta, mana montaj videolarimiz 👍"). ' +
    'If it returns available:false, there are no clips on file: tell the customer your team will send them shortly — NEVER say you "can\'t" send video.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      topic: {
        type: 'string',
        description:
          'Optional topic to pick relevant clips: montaj (installation), tayyor_obyekt (finished object), monolit, zina, gazoblok.',
      },
    },
  },
};

export const shareProofTool: AgentTool<ShareProofData> = {
  definition: shareProofDefinition,
  async execute(rawInput) {
    return runShareProof(rawInput);
  },
};

/**
 * Pull the topics the agent requested via share_proof in THIS turn's transcript
 * (mirrors extractQuotedRooms). Each non-errored share_proof call contributes its
 * `topic` (or null when none was given). The send integration uses these to send
 * the actual clips post-turn, mode-gated. Pass only the CURRENT turn's messages.
 */
export function extractProofTopics(turnMessages: ReadonlyArray<LlmMessage>): (string | null)[] {
  const errored = new Map<string, boolean>();
  for (const m of turnMessages) {
    if (m.role !== 'user' || !Array.isArray(m.content)) continue;
    for (const part of m.content as Array<{ type?: string; toolUseId?: string; isError?: boolean }>) {
      if (part.type === 'tool_result' && part.toolUseId) errored.set(part.toolUseId, part.isError === true);
    }
  }
  const topics: (string | null)[] = [];
  for (const m of turnMessages) {
    if (m.role !== 'assistant' || !m.toolCalls) continue;
    for (const call of m.toolCalls) {
      if (call.name !== 'share_proof') continue;
      if (errored.get(call.id) === true) continue;
      const topic = typeof call.input?.topic === 'string' ? call.input.topic : null;
      topics.push(topic);
    }
  }
  return topics;
}
