// Provider API-key storage (Plan 09). Lets the owner save Anthropic/Google/
// OpenAI keys from the control panel so switching the model in the dropdown
// "just works" without editing env files. Keys are stored in AppConfig and
// resolved DB → env at call time.
//
// SECURITY NOTE: keys are stored in the DB (AppConfig) in plaintext. For a
// single-owner CRM this is an accepted tradeoff; a hardened deployment can keep
// keys in server env instead (resolve() prefers a DB key, then falls back to
// env). Key VALUES are never returned to the client — only a set/not-set status.

import { prisma } from '@/lib/prisma';
import type { LlmProviderName } from './llm/models';

export interface ProviderKeys {
  anthropic?: string;
  google?: string;
  openai?: string;
}

const KEYS_CONFIG_KEY = 'agent.provider_keys';

const ENV_VAR: Record<LlmProviderName, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
};

/**
 * Merge an update into existing keys — only non-empty string values overwrite,
 * so a blank field in the UI leaves the stored key untouched (write-only edit).
 * Pure + unit-tested.
 */
export function mergeProviderKeys(existing: ProviderKeys, update: ProviderKeys): ProviderKeys {
  const out: ProviderKeys = { ...existing };
  for (const p of ['anthropic', 'google', 'openai'] as const) {
    const v = update[p];
    if (typeof v === 'string' && v.trim()) out[p] = v.trim();
  }
  return out;
}

export async function loadProviderKeys(): Promise<ProviderKeys> {
  const row = await prisma.appConfig.findUnique({ where: { key: KEYS_CONFIG_KEY } });
  const v = row?.value;
  if (!v || typeof v !== 'object') return {};
  const o = v as Record<string, unknown>;
  const pick = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : undefined);
  return { anthropic: pick('anthropic'), google: pick('google'), openai: pick('openai') };
}

/** Save (merge) keys — only provided non-empty values overwrite. */
export async function saveProviderKeys(update: ProviderKeys): Promise<void> {
  const merged = mergeProviderKeys(await loadProviderKeys(), update);
  await prisma.appConfig.upsert({
    where: { key: KEYS_CONFIG_KEY },
    create: { key: KEYS_CONFIG_KEY, value: merged as object },
    update: { value: merged as object },
  });
}

/** Resolve a provider's API key: DB (UI-saved) first, then the env var. */
export async function resolveApiKey(provider: LlmProviderName): Promise<string | undefined> {
  const keys = await loadProviderKeys();
  const fromDb = keys[provider];
  if (fromDb && fromDb.trim()) return fromDb.trim();
  const fromEnv = process.env[ENV_VAR[provider]];
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : undefined;
}

/** Set/not-set status per provider (never the values) — for the control panel. */
export async function providerKeyStatus(): Promise<Record<LlmProviderName, boolean>> {
  const keys = await loadProviderKeys();
  const has = (p: LlmProviderName) =>
    !!(keys[p]?.trim()) || !!(process.env[ENV_VAR[p]]?.trim());
  return { anthropic: has('anthropic'), google: has('google'), openai: has('openai') };
}
