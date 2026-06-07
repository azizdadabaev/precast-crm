import { describe, it, expect } from 'vitest';
import {
  MODELS,
  getModel,
  bakeOffModels,
  modelsByRole,
  modelsByProvider,
  type LlmProviderName,
} from './models';

describe('model registry invariants', () => {
  it('has unique keys and unique (provider, modelId) pairs', () => {
    const keys = MODELS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    const ids = MODELS.map((m) => `${m.provider}:${m.modelId}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('quotes sane pricing (positive, output ≥ input) and at least one role each', () => {
    for (const m of MODELS) {
      expect(m.pricing.inputPerMTok).toBeGreaterThan(0);
      expect(m.pricing.outputPerMTok).toBeGreaterThanOrEqual(m.pricing.inputPerMTok);
      if (m.pricing.cachedInputPerMTok != null) {
        expect(m.pricing.cachedInputPerMTok).toBeLessThanOrEqual(m.pricing.inputPerMTok);
      }
      expect(m.roles.length).toBeGreaterThan(0);
    }
  });

  it('includes the latest flagship from all three providers as bake-off brains', () => {
    const providers = new Set<LlmProviderName>(bakeOffModels().map((m) => m.provider));
    expect(providers).toEqual(new Set(['anthropic', 'google', 'openai']));
    // Every bake-off model must actually be usable as a brain.
    for (const m of bakeOffModels()) expect(m.roles).toContain('brain');
  });

  it('lists the specific latest models we verified for testing', () => {
    for (const key of [
      'claude-opus-4-8',
      'claude-sonnet-4-6',
      'gemini-3.1-pro',
      'gemini-3.5-flash',
      'gpt-5.5',
      'gpt-5.4',
    ]) {
      const m = getModel(key);
      expect(m, `expected ${key} in the registry`).toBeDefined();
      expect(m!.bakeOff).toBe(true);
    }
  });

  it('fixes voice transcription to Google (spec §3 — Claude has no audio input)', () => {
    const stt = modelsByRole('transcription');
    expect(stt.length).toBeGreaterThan(0);
    for (const m of stt) {
      expect(m.provider).toBe('google');
      expect(m.capabilities.audioInput).toBe(true);
    }
    // No Anthropic model ever claims audio input.
    for (const m of modelsByProvider('anthropic')) {
      expect(m.capabilities.audioInput).toBe(false);
    }
  });

  it('offers a cheap classifier and vision candidates from ≥2 providers', () => {
    expect(modelsByRole('classifier').length).toBeGreaterThan(0);
    const visionProviders = new Set(modelsByRole('vision').map((m) => m.provider));
    // Floor-plan reading is benchmarked across Claude + Gemini (spec §4.5).
    expect(visionProviders.has('anthropic')).toBe(true);
    expect(visionProviders.has('google')).toBe(true);
  });

  it('flags alias-only models so a dated snapshot is pinned before Shadow', () => {
    // The keystone brain must not silently ship on a moving alias.
    expect(getModel('claude-opus-4-8')!.requiresSnapshotPin).toBe(true);
  });

  it('getModel returns undefined for an unknown key', () => {
    expect(getModel('gpt-9-ultra')).toBeUndefined();
  });
});
