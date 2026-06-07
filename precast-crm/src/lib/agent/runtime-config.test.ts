import { describe, it, expect } from 'vitest';
import { validateRuntimeUpdate, DEFAULT_AGENT_RUNTIME, FALLBACK_MODEL_KEY } from './runtime-config';
import { getModel } from './llm/models';

describe('validateRuntimeUpdate', () => {
  it('accepts a well-formed update with a known model', () => {
    const r = validateRuntimeUpdate({ enabled: true, mode: 'shadow', modelKey: 'gemini-3.1-pro' });
    expect(r).toEqual({ ok: true, config: { enabled: true, mode: 'shadow', modelKey: 'gemini-3.1-pro' } });
  });

  it('rejects a non-boolean enabled', () => {
    expect(validateRuntimeUpdate({ enabled: 'yes', mode: 'shadow', modelKey: 'claude-opus-4-8' })).toMatchObject({ ok: false });
  });

  it('rejects an unknown mode', () => {
    expect(validateRuntimeUpdate({ enabled: true, mode: 'turbo', modelKey: 'claude-opus-4-8' })).toMatchObject({ ok: false });
  });

  it('rejects an unknown model key', () => {
    expect(validateRuntimeUpdate({ enabled: true, mode: 'shadow', modelKey: 'gpt-9-ultra' })).toMatchObject({ ok: false, error: expect.stringContaining('model') });
  });

  it('rejects non-object input', () => {
    expect(validateRuntimeUpdate(null).ok).toBe(false);
    expect(validateRuntimeUpdate('x').ok).toBe(false);
  });

  it('the default is OFF and its fallback model exists in the registry', () => {
    expect(DEFAULT_AGENT_RUNTIME.enabled).toBe(false);
    expect(DEFAULT_AGENT_RUNTIME.mode).toBe('shadow');
    expect(getModel(FALLBACK_MODEL_KEY)).toBeDefined();
  });
});
