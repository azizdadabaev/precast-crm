import { describe, it, expect } from 'vitest';
import { runShareProof, extractProofTopics } from './share-proof';
import type { ProofMediaConfig } from '../proof-media';
import type { LlmMessage } from '../llm/provider';

const lib = (...items: ProofMediaConfig['items']): (() => Promise<ProofMediaConfig>) => async () => ({ items });

const media = (id: string, tags: string[] = []) => ({
  id,
  kind: 'VIDEO' as const,
  fileId: `file_${id}`,
  title: id,
  tags,
  caption: null,
  enabled: true,
  order: 0,
  previewPath: null,
});

describe('runShareProof', () => {
  it('reports available + the selected clips', async () => {
    const res = await runShareProof({ topic: 'montaj' }, lib(media('m1', ['montaj']), media('o1', ['tayyor_obyekt'])));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.available).toBe(true);
      expect(res.data.count).toBe(1);
      expect(res.data.items[0].id).toBe('m1');
      expect(res.data.topic).toBe('montaj');
    }
  });

  it('reports available:false when the library is empty (NOT an escalation)', async () => {
    const res = await runShareProof({}, lib());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.available).toBe(false);
      expect(res.data.count).toBe(0);
    }
  });

  it('falls back to the default set when the topic has no match', async () => {
    const res = await runShareProof({ topic: 'zina' }, lib(media('m1', ['montaj'])));
    expect(res.ok && res.data.available).toBe(true);
    expect(res.ok && res.data.items[0].id).toBe('m1');
  });
});

describe('extractProofTopics', () => {
  it('returns the topic of each non-errored share_proof call', () => {
    const turn: LlmMessage[] = [
      { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'share_proof', input: { topic: 'montaj' } }] },
      { role: 'user', content: [{ type: 'tool_result', toolUseId: 't1', content: '{}' }] } as unknown as LlmMessage,
    ];
    expect(extractProofTopics(turn)).toEqual(['montaj']);
  });

  it('records null when share_proof was called without a topic', () => {
    const turn: LlmMessage[] = [
      { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'share_proof', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', toolUseId: 't1', content: '{}' }] } as unknown as LlmMessage,
    ];
    expect(extractProofTopics(turn)).toEqual([null]);
  });

  it('skips an errored share_proof call', () => {
    const turn: LlmMessage[] = [
      { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'share_proof', input: { topic: 'montaj' } }] },
      { role: 'user', content: [{ type: 'tool_result', toolUseId: 't1', content: 'err', isError: true }] } as unknown as LlmMessage,
    ];
    expect(extractProofTopics(turn)).toEqual([]);
  });

  it('ignores other tool calls', () => {
    const turn: LlmMessage[] = [
      { role: 'assistant', content: '', toolCalls: [{ id: 'q1', name: 'get_quote', input: {} }] },
    ];
    expect(extractProofTopics(turn)).toEqual([]);
  });
});
