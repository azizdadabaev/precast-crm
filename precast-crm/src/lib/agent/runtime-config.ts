// Agent runtime config + the kill-switch gate (spec §10 / §14).
//
// The webhook reads this FIRST: a global kill-switch (AppConfig) and, per-chat,
// the conversation's aiState + aiPaused decide whether the agent runs at all.
// `mode` controls how far it goes: in Plan 08 only `shadow` is implemented —
// the agent generates + LOGS a proposed reply but sends nothing (spec §14
// Stage 1). `suggest`/`auto` are later rollout stages (Plan 09).

import { prisma } from '@/lib/prisma';

export type AgentMode = 'shadow' | 'suggest' | 'auto';

export interface AgentRuntimeConfig {
  /** Global kill-switch. Default OFF — the owner explicitly enables the agent. */
  enabled: boolean;
  mode: AgentMode;
}

export const DEFAULT_AGENT_RUNTIME: AgentRuntimeConfig = { enabled: false, mode: 'shadow' };

const RUNTIME_KEY = 'agent.runtime';
const KB_KEY = 'agent.knowledge_base';

function isMode(v: unknown): v is AgentMode {
  return v === 'shadow' || v === 'suggest' || v === 'auto';
}

/** Load the global runtime config (kill-switch + mode). Fails safe to OFF. */
export async function loadAgentRuntimeConfig(): Promise<AgentRuntimeConfig> {
  const row = await prisma.appConfig.findUnique({ where: { key: RUNTIME_KEY } });
  const v = row?.value;
  if (!v || typeof v !== 'object') return DEFAULT_AGENT_RUNTIME;
  const o = v as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    mode: isMode(o.mode) ? o.mode : 'shadow',
  };
}

/** Load the owner-managed knowledge-base markdown (spec §9). Empty if unset —
 *  the agent then escalates anything not covered by its hard constraints. */
export async function loadKnowledgeBase(): Promise<string> {
  const row = await prisma.appConfig.findUnique({ where: { key: KB_KEY } });
  const v = row?.value as { content?: unknown } | null | undefined;
  return v && typeof v.content === 'string' ? v.content : '';
}

/**
 * Pure gate: should the agent act on this chat right now? Only when globally
 * enabled AND the conversation is AI-driven AND not transiently paused (e.g. the
 * owner started typing in the real Telegram app). Any other aiState
 * (PENDING_HUMAN / HUMAN_ACTIVE / RESOLVED) means a human owns the chat.
 */
export function shouldAgentHandle(
  conversation: { aiState: string; aiPaused: boolean },
  config: AgentRuntimeConfig,
): boolean {
  return config.enabled && conversation.aiState === 'AI_HANDLING' && !conversation.aiPaused;
}
