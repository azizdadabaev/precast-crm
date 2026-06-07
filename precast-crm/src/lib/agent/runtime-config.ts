// Agent runtime config + the kill-switch gate (spec §10 / §14).
//
// The webhook reads this FIRST: a global kill-switch (AppConfig) and, per-chat,
// the conversation's aiState + aiPaused decide whether the agent runs at all.
// `mode` controls how far it goes: in Plan 08 only `shadow` is implemented —
// the agent generates + LOGS a proposed reply but sends nothing (spec §14
// Stage 1). `suggest`/`auto` are later rollout stages (Plan 09).

import { prisma } from '@/lib/prisma';
import { getModel } from './llm/models';

export type AgentMode = 'shadow' | 'suggest' | 'auto';

export interface AgentRuntimeConfig {
  /** Global kill-switch. Default OFF — the owner explicitly enables the agent. */
  enabled: boolean;
  mode: AgentMode;
  /** Registry key of the model that drives conversations (the model dropdown). */
  modelKey: string;
}

/** Fallback model key when nothing is configured (AppConfig → env → this). */
export const FALLBACK_MODEL_KEY = 'claude-opus-4-8';

export const DEFAULT_AGENT_RUNTIME: AgentRuntimeConfig = {
  enabled: false,
  mode: 'shadow',
  modelKey: FALLBACK_MODEL_KEY,
};

const RUNTIME_KEY = 'agent.runtime';
const KB_KEY = 'agent.knowledge_base';

function isMode(v: unknown): v is AgentMode {
  return v === 'shadow' || v === 'suggest' || v === 'auto';
}

function resolvedDefaultModelKey(): string {
  const env = process.env.AGENT_MODEL_KEY;
  return env && getModel(env) ? env : FALLBACK_MODEL_KEY;
}

/** Load the global runtime config (kill-switch + mode + model). Fails safe to
 *  OFF; the model key resolves AppConfig → env AGENT_MODEL_KEY → fallback, and
 *  is validated against the registry (an unknown stored key falls back). */
export async function loadAgentRuntimeConfig(): Promise<AgentRuntimeConfig> {
  const row = await prisma.appConfig.findUnique({ where: { key: RUNTIME_KEY } });
  const v = row?.value;
  const envDefault = resolvedDefaultModelKey();
  if (!v || typeof v !== 'object') return { ...DEFAULT_AGENT_RUNTIME, modelKey: envDefault };
  const o = v as Record<string, unknown>;
  const storedKey = typeof o.modelKey === 'string' && getModel(o.modelKey) ? o.modelKey : envDefault;
  return {
    enabled: o.enabled === true,
    mode: isMode(o.mode) ? o.mode : 'shadow',
    modelKey: storedKey,
  };
}

export type RuntimeUpdateResult =
  | { ok: true; config: AgentRuntimeConfig }
  | { ok: false; error: string };

/** Pure validation of an owner-submitted runtime update (used by the route). */
export function validateRuntimeUpdate(input: unknown): RuntimeUpdateResult {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid body' };
  const o = input as Record<string, unknown>;
  if (typeof o.enabled !== 'boolean') return { ok: false, error: 'enabled must be a boolean' };
  if (!isMode(o.mode)) return { ok: false, error: 'mode must be shadow | suggest | auto' };
  if (typeof o.modelKey !== 'string' || !getModel(o.modelKey)) {
    return { ok: false, error: 'modelKey must be a known model' };
  }
  return { ok: true, config: { enabled: o.enabled, mode: o.mode, modelKey: o.modelKey } };
}

/** Persist the runtime config (owner action). Validates first. */
export async function saveAgentRuntimeConfig(input: unknown): Promise<RuntimeUpdateResult> {
  const v = validateRuntimeUpdate(input);
  if (!v.ok) return v;
  await prisma.appConfig.upsert({
    where: { key: RUNTIME_KEY },
    create: { key: RUNTIME_KEY, value: v.config as object },
    update: { value: v.config as object },
  });
  return v;
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
  config: { enabled: boolean },
): boolean {
  return config.enabled && conversation.aiState === 'AI_HANDLING' && !conversation.aiPaused;
}
