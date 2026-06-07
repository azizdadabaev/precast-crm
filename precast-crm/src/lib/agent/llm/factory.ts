// Provider factory — resolve a ModelSpec (or a registry key) to a concrete
// LlmProvider. The agent loop calls createProviderByKey(AGENT_MODEL_KEY); the
// Shadow bake-off calls createProvider over bakeOffModels() to run every
// candidate behind the one interface (spec §14).

import type { LlmProvider } from './provider';
import { getModel, modelsByRole, type ModelSpec } from './models';
import { ClaudeProvider } from './claude';
import { GeminiProvider } from './gemini';
import { OpenAIProvider } from './openai';

export interface ProviderDeps {
  apiKey?: string;
}

/** Build the provider for a model. The provider is chosen by `model.provider`,
 *  so the concrete client always matches the model's vendor. */
export function createProvider(model: ModelSpec, deps: ProviderDeps = {}): LlmProvider {
  switch (model.provider) {
    case 'anthropic':
      return new ClaudeProvider(model, deps);
    case 'google':
      return new GeminiProvider(model, deps);
    case 'openai':
      return new OpenAIProvider(model, deps);
  }
}

/** Build a provider from a registry key (e.g. process.env.AGENT_MODEL_KEY). */
export function createProviderByKey(key: string, deps: ProviderDeps = {}): LlmProvider {
  const model = getModel(key);
  if (!model) throw new Error(`createProviderByKey: unknown model key "${key}"`);
  return createProvider(model, deps);
}

/** The Gemini provider used for voice-note transcription (spec §3 fixes STT to
 *  Google regardless of which model wins the conversation bake-off). Picks the
 *  first audio-capable Google transcription model from the registry. */
export function createTranscriptionProvider(deps: ProviderDeps = {}): GeminiProvider {
  const model =
    modelsByRole('transcription').find((m) => m.provider === 'google' && m.capabilities.audioInput) ??
    null;
  if (!model) throw new Error('createTranscriptionProvider: no Google transcription model in registry');
  return new GeminiProvider(model, deps);
}
