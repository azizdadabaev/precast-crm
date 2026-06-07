import { describe, it, expect } from 'vitest';
import { mergeProviderKeys } from './provider-keys';

describe('mergeProviderKeys', () => {
  it('overwrites only with non-empty trimmed values (blank = leave unchanged)', () => {
    const existing = { anthropic: 'a-old', google: 'g-old' };
    expect(mergeProviderKeys(existing, { anthropic: 'a-new', openai: 'o-new' })).toEqual({
      anthropic: 'a-new',
      google: 'g-old',
      openai: 'o-new',
    });
  });

  it('ignores blank / whitespace-only / missing fields', () => {
    const existing = { anthropic: 'keep' };
    expect(mergeProviderKeys(existing, { anthropic: '', google: '   ' })).toEqual({ anthropic: 'keep' });
  });

  it('trims stored values', () => {
    expect(mergeProviderKeys({}, { openai: '  sk-xyz  ' })).toEqual({ openai: 'sk-xyz' });
  });
});
