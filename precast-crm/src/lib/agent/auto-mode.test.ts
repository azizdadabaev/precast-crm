import { describe, it, expect } from 'vitest';
import { autoActionFor, applyAutoMode, type AutoModeDeps } from './auto-mode';
import type { AgentDecision } from './loop';
import type { ShadowOutcome } from './shadow';

const APPROVAL_DRAFT = { quoteId: 'q', customerName: 'Ali', customerPhone: '1', deliveryAddress: 'X', notes: null };

function outcome(decision: AgentDecision): ShadowOutcome {
  const screen = { tooLong: false, injection: false, link: false, verdict: 'ok' as const };
  return {
    screened: { normalized: '', flags: { tooLong: false, injection: false, link: false }, verdict: 'ok' },
    language: 'uz-latin',
    escalatedEarly: false,
    decision,
    entry: {
      conversationId: 'c1', language: 'uz-latin', screen, decision: decision.action, turns: 1,
      toolCalls: [], usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
    },
  };
}

function fakeDeps() {
  const calls = {
    send: [] as Array<{ cid: string; text: string }>,
    human: [] as Array<{ cid: string; reason: string }>,
    markSent: [] as string[],
  };
  const deps: AutoModeDeps = {
    send: async (cid, text) => { calls.send.push({ cid, text }); return { ok: true }; },
    routeToHuman: async (cid, reason) => { calls.human.push({ cid, reason }); },
    markSent: async (id) => { calls.markSent.push(id); },
  };
  return { deps, calls };
}

describe('autoActionFor', () => {
  it('only a reply auto-sends; every other decision needs a human', () => {
    expect(autoActionFor({ action: 'reply', reply: 'hi' })).toBe('send');
    expect(autoActionFor({ action: 'escalate', reason: 'x' })).toBe('human');
    expect(autoActionFor({ action: 'blocked', reason: 'x' })).toBe('human');
    expect(autoActionFor({ action: 'max_turns' })).toBe('human');
    expect(autoActionFor({ action: 'request_approval', draft: APPROVAL_DRAFT })).toBe('human');
  });
});

describe('applyAutoMode', () => {
  it('auto-sends a reply and marks the proposal SENT', async () => {
    const { deps, calls } = fakeDeps();
    const r = await applyAutoMode(outcome({ action: 'reply', reply: 'Assalomu alaykum' }), { conversationId: 'c1', inboundMessageId: 'm1' }, deps);
    expect(r).toBe('send');
    expect(calls.send).toEqual([{ cid: 'c1', text: 'Assalomu alaykum' }]);
    expect(calls.markSent).toEqual(['m1']);
    expect(calls.human).toEqual([]);
  });

  it('NEVER auto-places an order — request_approval routes to a human, sends nothing', async () => {
    const { deps, calls } = fakeDeps();
    const r = await applyAutoMode(outcome({ action: 'request_approval', draft: APPROVAL_DRAFT }), { conversationId: 'c1', inboundMessageId: 'm1' }, deps);
    expect(r).toBe('human');
    expect(calls.send).toEqual([]);
    expect(calls.markSent).toEqual([]);
    expect(calls.human[0].cid).toBe('c1');
  });

  it('routes an escalate to a human with its reason', async () => {
    const { deps, calls } = fakeDeps();
    await applyAutoMode(outcome({ action: 'escalate', reason: 'customer upset' }), { conversationId: 'c1', inboundMessageId: 'm1' }, deps);
    expect(calls.human[0].reason).toBe('customer upset');
    expect(calls.send).toEqual([]);
  });

  it('routes to a human when the auto-send fails (customer is never left hanging)', async () => {
    const calls = { human: [] as Array<{ cid: string; reason: string }>, markSent: [] as string[] };
    const deps: AutoModeDeps = {
      send: async () => ({ ok: false, reason: 'NO_CONNECTION' }),
      routeToHuman: async (cid, reason) => { calls.human.push({ cid, reason }); },
      markSent: async (id) => { calls.markSent.push(id); },
    };
    const r = await applyAutoMode(outcome({ action: 'reply', reply: 'hi' }), { conversationId: 'c1', inboundMessageId: 'm1' }, deps);
    expect(r).toBe('human');
    expect(calls.markSent).toEqual([]);
    expect(calls.human[0].reason).toMatch(/auto-send failed/);
  });
});
