import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { enqueueInboundText, _resetBurstsForTest, type BurstConversation } from './burst';

const conv = (id = 'c1'): BurstConversation => ({ id, aiState: 'AI_HANDLING', aiPaused: false, sharedContactPhone: null, channel: 'TELEGRAM' });

describe('enqueueInboundText (burst coalescing)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetBurstsForTest();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces a rapid burst into ONE run with the joined text + all ids', async () => {
    const runs: Array<{ text: string; ids: string[] }> = [];
    const run = async (_c: BurstConversation, text: string, ids: string[]) => {
      runs.push({ text, ids });
    };
    enqueueInboundText(conv(), 'Narxi qancha?', 'm1', run, { debounceMs: 1000, maxWaitMs: 5000 });
    await vi.advanceTimersByTimeAsync(400);
    enqueueInboundText(conv(), "Sinovdan o'tganmi?", 'm2', run, { debounceMs: 1000, maxWaitMs: 5000 });
    await vi.advanceTimersByTimeAsync(400);
    enqueueInboundText(conv(), 'Tayyori bormi?', 'm3', run, { debounceMs: 1000, maxWaitMs: 5000 });
    await vi.advanceTimersByTimeAsync(1100); // debounce after the LAST message

    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe("Narxi qancha?\nSinovdan o'tganmi?\nTayyori bormi?");
    expect(runs[0].ids).toEqual(['m1', 'm2', 'm3']);
  });

  it('messages arriving during an in-flight run buffer into a SECOND run (never concurrent)', async () => {
    const runs: string[] = [];
    let live = 0;
    let maxLive = 0;
    const run = async (_c: BurstConversation, text: string) => {
      live += 1;
      maxLive = Math.max(maxLive, live);
      runs.push(text);
      await new Promise((r) => setTimeout(r, 3000)); // slow LLM
      live -= 1;
    };
    enqueueInboundText(conv(), 'first', 'm1', run, { debounceMs: 500, maxWaitMs: 5000 });
    await vi.advanceTimersByTimeAsync(600); // run 1 starts (slow)
    enqueueInboundText(conv(), 'second', 'm2', run, { debounceMs: 500, maxWaitMs: 5000 });
    enqueueInboundText(conv(), 'third', 'm3', run, { debounceMs: 500, maxWaitMs: 5000 });
    await vi.advanceTimersByTimeAsync(10_000); // run 1 finishes → run 2 fires

    expect(runs).toEqual(['first', 'second\nthird']);
    expect(maxLive).toBe(1); // strictly serialized
  });

  it('caps total waiting at maxWaitMs even if messages keep trickling', async () => {
    const runs: string[] = [];
    const run = async (_c: BurstConversation, text: string) => {
      runs.push(text);
    };
    // A message every 800ms forever would push a pure debounce out indefinitely.
    enqueueInboundText(conv(), 't0', 'm0', run, { debounceMs: 1000, maxWaitMs: 3000 });
    for (let i = 1; i <= 5; i++) {
      await vi.advanceTimersByTimeAsync(800);
      enqueueInboundText(conv(), `t${i}`, `m${i}`, run, { debounceMs: 1000, maxWaitMs: 3000 });
    }
    expect(runs.length).toBeGreaterThanOrEqual(1); // fired by the cap, not starved
    expect(runs[0].startsWith('t0')).toBe(true);
  });

  it('separate conversations never coalesce together', async () => {
    const runs: Array<{ id: string; text: string }> = [];
    const run = async (c: BurstConversation, text: string) => {
      runs.push({ id: c.id, text });
    };
    enqueueInboundText(conv('a'), 'salom A', 'a1', run, { debounceMs: 500, maxWaitMs: 5000 });
    enqueueInboundText(conv('b'), 'salom B', 'b1', run, { debounceMs: 500, maxWaitMs: 5000 });
    await vi.advanceTimersByTimeAsync(600);
    expect(runs).toHaveLength(2);
    expect(new Set(runs.map((r) => r.id))).toEqual(new Set(['a', 'b']));
  });
});
