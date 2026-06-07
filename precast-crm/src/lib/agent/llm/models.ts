// Model registry — the candidate models for the provider bake-off (spec §3 / §14).
//
// Provider-agnostic catalog of the LATEST models from each provider, with the
// exact API id, price, and capabilities, so the (Plan 08) LlmProvider can be
// pointed at any of them and the Stage-1 Shadow bake-off (Claude vs Gemini vs
// OpenAI) can run all candidates over the same real inbox messages.
//
// ⚠️ Prices + ids were verified on the date in `PRICING_VERIFIED_AT` (USD per
// MILLION tokens). The spec requires re-verifying id + price at build time and
// pinning a DATED snapshot (not a moving alias) before the Shadow stage —
// `requiresSnapshotPin` flags the ones still on an alias. Uzbek/Russian tokenize
// ~1.5–2.5× English, so real cost runs materially higher than these rates imply
// (spec §12) — measure on real history before budgeting.

export const PRICING_VERIFIED_AT = '2026-06-07';

export type LlmProviderName = 'anthropic' | 'google' | 'openai';

/** What we'd use a model for. A model can serve several roles. */
export type ModelRole =
  | 'brain' // the conversation agent (bake-off candidate)
  | 'vision' // floor-plan / image reading (spec §4.5)
  | 'transcription' // voice-note STT (spec §3 fixes this to Google/Gemini)
  | 'classifier'; // cheap pre-LLM input screen (spec §6.4)

export interface ModelPricing {
  /** USD per 1M input tokens. */
  inputPerMTok: number;
  /** USD per 1M output tokens. */
  outputPerMTok: number;
  /** USD per 1M cached-read input tokens, if the provider offers prompt caching. */
  cachedInputPerMTok?: number;
}

export interface ModelCapabilities {
  /** Accepts image input (floor-plan reading). */
  vision: boolean;
  /** Accepts raw audio input (voice-note transcription). Claude cannot. */
  audioInput: boolean;
  /** Max context window in tokens, if known. */
  contextWindow?: number;
}

export interface ModelSpec {
  /** Stable internal key used in config / AppConfig / logs. */
  key: string;
  provider: LlmProviderName;
  /** Exact model id sent to the provider API. */
  modelId: string;
  label: string;
  roles: ModelRole[];
  pricing: ModelPricing;
  capabilities: ModelCapabilities;
  /** True ⇒ a candidate in the Stage-1 conversation-brain bake-off (spec §14). */
  bakeOff: boolean;
  /** True ⇒ modelId is a moving alias; pin a dated snapshot before Shadow. */
  requiresSnapshotPin?: boolean;
  notes?: string;
}

// ── Anthropic Claude ────────────────────────────────────────────
// Best measured Uzbek score in the lineage + strongest agentic tool-calling;
// no raw-audio input, so Claude never does voice STT. (spec §3)
const ANTHROPIC: ModelSpec[] = [
  {
    key: 'claude-opus-4-8',
    provider: 'anthropic',
    modelId: 'claude-opus-4-8',
    label: 'Claude Opus 4.8',
    roles: ['brain', 'vision'],
    pricing: { inputPerMTok: 5, outputPerMTok: 25, cachedInputPerMTok: 0.5 },
    capabilities: { vision: true, audioInput: false, contextWindow: 1_000_000 },
    bakeOff: true,
    requiresSnapshotPin: true,
    notes: 'Quality flagship; pin a dated snapshot before Shadow. Fast Mode 10/50.',
  },
  {
    key: 'claude-sonnet-4-6',
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    roles: ['brain', 'vision'],
    pricing: { inputPerMTok: 3, outputPerMTok: 15, cachedInputPerMTok: 0.3 },
    capabilities: { vision: true, audioInput: false, contextWindow: 1_000_000 },
    bakeOff: true,
    requiresSnapshotPin: true,
    notes: 'Cheaper brain candidate (~40% less than Opus).',
  },
  {
    key: 'claude-haiku-4-5',
    provider: 'anthropic',
    modelId: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    roles: ['classifier'],
    pricing: { inputPerMTok: 1, outputPerMTok: 5, cachedInputPerMTok: 0.1 },
    capabilities: { vision: true, audioInput: false, contextWindow: 200_000 },
    bakeOff: false,
    notes: 'Cheap input-screen classifier (spec §6.4). Already a dated snapshot.',
  },
];

// ── Google Gemini ───────────────────────────────────────────────
// Strong image + NATIVE AUDIO (the fixed choice for voice-note STT, spec §3);
// the 3.x line supersedes the 2.5 line.
const GOOGLE: ModelSpec[] = [
  {
    key: 'gemini-3.1-pro',
    provider: 'google',
    modelId: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    roles: ['brain', 'vision', 'transcription'],
    pricing: { inputPerMTok: 2, outputPerMTok: 12 },
    capabilities: { vision: true, audioInput: true, contextWindow: 2_000_000 },
    bakeOff: true,
    requiresSnapshotPin: true,
    notes: 'Largest context (2M). Preview id — pin a stable id before Shadow. >200k ctx is priced higher.',
  },
  {
    key: 'gemini-3.5-flash',
    provider: 'google',
    modelId: 'gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    roles: ['brain', 'vision', 'transcription'],
    pricing: { inputPerMTok: 1.5, outputPerMTok: 9 },
    capabilities: { vision: true, audioInput: true },
    bakeOff: true,
    notes: 'Low-cost/low-latency brain + primary voice-STT candidate (native audio). Stable id.',
  },
  {
    key: 'gemini-3.1-flash-lite',
    provider: 'google',
    modelId: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    roles: ['classifier'],
    pricing: { inputPerMTok: 0.25, outputPerMTok: 1.5 },
    capabilities: { vision: true, audioInput: true },
    bakeOff: false,
    notes: 'Cheapest classifier candidate.',
  },
];

// ── OpenAI GPT ──────────────────────────────────────────────────
// Included for completeness in the bake-off (spec §3).
const OPENAI: ModelSpec[] = [
  {
    key: 'gpt-5.5',
    provider: 'openai',
    modelId: 'gpt-5.5',
    label: 'GPT-5.5',
    roles: ['brain', 'vision'],
    pricing: { inputPerMTok: 5, outputPerMTok: 30, cachedInputPerMTok: 0.5 },
    capabilities: { vision: true, audioInput: false, contextWindow: 1_050_000 },
    bakeOff: true,
    notes: 'Flagship. Confirm exact id/price at wiring time (vendor naming varies: gpt-5.5 / -pro).',
  },
  {
    key: 'gpt-5.4',
    provider: 'openai',
    modelId: 'gpt-5.4',
    label: 'GPT-5.4',
    roles: ['brain', 'vision'],
    pricing: { inputPerMTok: 2.5, outputPerMTok: 15 },
    capabilities: { vision: true, audioInput: false },
    bakeOff: true,
    notes: 'Cost/quality balance candidate.',
  },
  {
    key: 'gpt-5-mini',
    provider: 'openai',
    modelId: 'gpt-5-mini',
    label: 'GPT-5 Mini',
    roles: ['classifier'],
    pricing: { inputPerMTok: 0.25, outputPerMTok: 2 },
    capabilities: { vision: true, audioInput: false },
    bakeOff: false,
    notes: 'Cheap classifier alternative.',
  },
];

/** The full registry. */
export const MODELS: readonly ModelSpec[] = [...ANTHROPIC, ...GOOGLE, ...OPENAI];

/** Look up a model by its stable key. */
export function getModel(key: string): ModelSpec | undefined {
  return MODELS.find((m) => m.key === key);
}

/** Models tagged as conversation-brain bake-off candidates (spec §14 Stage 1). */
export function bakeOffModels(): ModelSpec[] {
  return MODELS.filter((m) => m.bakeOff);
}

/** Models that can serve a given role. */
export function modelsByRole(role: ModelRole): ModelSpec[] {
  return MODELS.filter((m) => m.roles.includes(role));
}

/** Models from a given provider. */
export function modelsByProvider(provider: LlmProviderName): ModelSpec[] {
  return MODELS.filter((m) => m.provider === provider);
}
