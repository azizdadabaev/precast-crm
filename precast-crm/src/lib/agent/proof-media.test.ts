import { describe, it, expect } from 'vitest';
import {
  selectProofMedia,
  normalizeTopic,
  parseProofMediaConfig,
  PROOF_MEDIA_SEND_CAP,
  type ProofMediaItem,
} from './proof-media';

function item(over: Partial<ProofMediaItem> = {}): ProofMediaItem {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    kind: over.kind ?? 'VIDEO',
    fileId: over.fileId ?? 'file_' + (over.id ?? 'x'),
    title: over.title ?? '',
    tags: over.tags ?? [],
    caption: over.caption ?? null,
    enabled: over.enabled ?? true,
    order: over.order ?? 0,
    previewPath: over.previewPath ?? null,
  };
}

describe('normalizeTopic', () => {
  it('lowercases and underscores spaces', () => {
    expect(normalizeTopic('Tayyor Obyekt')).toBe('tayyor_obyekt');
    expect(normalizeTopic('  MONTAJ ')).toBe('montaj');
  });
});

describe('selectProofMedia', () => {
  it('returns nothing when the library is empty', () => {
    expect(selectProofMedia([])).toEqual([]);
  });

  it('drops disabled items and items with no fileId', () => {
    const items = [
      item({ id: 'a', enabled: false }),
      item({ id: 'b', fileId: '' }),
      item({ id: 'c' }),
    ];
    const got = selectProofMedia(items);
    expect(got.map((i) => i.id)).toEqual(['c']);
  });

  it('matches by topic tag (case/space-insensitive)', () => {
    const items = [
      item({ id: 'montaj1', tags: ['montaj'], order: 1 }),
      item({ id: 'obyekt1', tags: ['tayyor_obyekt'], order: 2 }),
      item({ id: 'montaj2', tags: ['Montaj'], order: 3 }),
    ];
    const got = selectProofMedia(items, { topic: 'MONTAJ' });
    expect(got.map((i) => i.id)).toEqual(['montaj1', 'montaj2']);
  });

  it('falls back to the default set (by order) when the topic has no match', () => {
    const items = [
      item({ id: 'b', order: 2 }),
      item({ id: 'a', order: 1 }),
    ];
    const got = selectProofMedia(items, { topic: 'nonexistent' });
    expect(got.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('returns the default set (by order) when no topic is given', () => {
    const items = [item({ id: 'z', order: 9 }), item({ id: 'a', order: 1 })];
    expect(selectProofMedia(items).map((i) => i.id)).toEqual(['a', 'z']);
  });

  it('caps the number of clips sent', () => {
    const items = Array.from({ length: 10 }, (_, i) => item({ id: `i${i}`, order: i }));
    expect(selectProofMedia(items).length).toBe(PROOF_MEDIA_SEND_CAP);
    expect(selectProofMedia(items, { cap: 2 }).length).toBe(2);
  });
});

describe('parseProofMediaConfig', () => {
  it('parses a valid config', () => {
    const cfg = parseProofMediaConfig({ items: [{ id: 'a', kind: 'PHOTO', fileId: 'f1' }] });
    expect(cfg.items).toHaveLength(1);
    expect(cfg.items[0].enabled).toBe(true); // default applied
  });

  it('drops malformed items but keeps the valid ones', () => {
    const cfg = parseProofMediaConfig({
      items: [{ id: 'good', kind: 'VIDEO', fileId: 'f' }, { kind: 'NOPE' }, 42],
    });
    expect(cfg.items.map((i) => i.id)).toEqual(['good']);
  });

  it('returns empty for junk', () => {
    expect(parseProofMediaConfig(null).items).toEqual([]);
    expect(parseProofMediaConfig({ nope: 1 }).items).toEqual([]);
  });
});
