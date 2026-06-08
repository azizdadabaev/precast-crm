import { describe, it, expect } from 'vitest';
import {
  buildProposalRow,
  saveAgentProposal,
  type AgentProposalDb,
  type AgentProposalRow,
} from './proposal';
import type { ShadowLogEntry, ShadowOutcome } from './shadow';
import type { AgentDecision } from './loop';

const USAGE = { inputTokens: 100, outputTokens: 40, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };
const SCREEN: ShadowLogEntry['screen'] = { tooLong: false, injection: false, link: false, verdict: 'ok' };
const META = { conversationId: 'c1', inboundMessageId: 'm1', modelKey: 'claude-opus-4-8' };

/** Minimal ShadowOutcome carrying only what buildProposalRow reads. */
function outcome(decision: AgentDecision, over: Partial<ShadowOutcome> = {}): ShadowOutcome {
  const entry: ShadowLogEntry = {
    conversationId: 'c1',
    language: 'uz-latin',
    screen: SCREEN,
    decision: decision.action,
    turns: 2,
    toolCalls: [{ name: 'get_quote', ok: true }],
    usage: USAGE,
  };
  return {
    screened: { normalized: 'salom', flags: { tooLong: false, injection: false, link: false }, verdict: 'ok' },
    language: 'uz-latin',
    escalatedEarly: false,
    decision,
    entry,
    ...over,
  };
}

describe('buildProposalRow', () => {
  it('maps a reply decision and carries the aggregates + meta', () => {
    const row = buildProposalRow(outcome({ action: 'reply', reply: 'Assalomu alaykum!' }), META);
    expect(row.decision).toBe('reply');
    expect(row.reply).toBe('Assalomu alaykum!');
    expect(row.escalationReason).toBeNull();
    expect(row.approvalDraft).toBeUndefined();
    expect(row.toolCalls).toEqual([{ name: 'get_quote', ok: true }]);
    expect(row.usage).toEqual(USAGE);
    expect(row.turns).toBe(2);
    expect(row.screen).toEqual(SCREEN);
    expect(row.language).toBe('uz-latin');
    expect(row.modelKey).toBe('claude-opus-4-8');
    expect(row.conversationId).toBe('c1');
    expect(row.inboundMessageId).toBe('m1');
    expect(row.confidence).toBeNull(); // deferred — always null for now
  });

  it('maps an escalate decision (reason → escalationReason, reply null)', () => {
    const row = buildProposalRow(outcome({ action: 'escalate', reason: 'customer upset' }), META);
    expect(row.decision).toBe('escalate');
    expect(row.reply).toBeNull();
    expect(row.escalationReason).toBe('customer upset');
    expect(row.approvalDraft).toBeUndefined();
  });

  it('maps a blocked decision (validator reason → escalationReason)', () => {
    const row = buildProposalRow(outcome({ action: 'blocked', reason: 'price without a fresh quote' }), META);
    expect(row.decision).toBe('blocked');
    expect(row.reply).toBeNull();
    expect(row.escalationReason).toBe('price without a fresh quote');
  });

  it('synthesizes a reason for max_turns (which carries none)', () => {
    const row = buildProposalRow(outcome({ action: 'max_turns' }), META);
    expect(row.decision).toBe('max_turns');
    expect(row.reply).toBeNull();
    expect(row.escalationReason).toMatch(/turn guard/);
  });

  it('keeps the approval draft for a request_approval decision', () => {
    const draft = {
      quoteId: 'q1',
      customerName: 'Ali',
      customerPhone: '998901234567',
      deliveryAddress: 'Tashkent',
      notes: null,
    };
    const row = buildProposalRow(outcome({ action: 'request_approval', draft }), META);
    expect(row.decision).toBe('request_approval');
    expect(row.reply).toBeNull();
    expect(row.escalationReason).toBeNull();
    expect(row.approvalDraft).toEqual(draft);
  });

  it('carries escalatedEarly + the outcome language (e.g. an early-escalated RU inbound)', () => {
    const row = buildProposalRow(
      outcome({ action: 'escalate', reason: 'suspicious inbound' }, { escalatedEarly: true, language: 'ru' }),
      META,
    );
    expect(row.escalatedEarly).toBe(true);
    expect(row.language).toBe('ru');
  });
});

describe('saveAgentProposal', () => {
  function fakeDb(count: number) {
    const calls: Array<{ data: AgentProposalRow[]; skipDuplicates: boolean }> = [];
    const db: AgentProposalDb = {
      agentProposal: {
        async createMany(args) {
          calls.push(args);
          return { count };
        },
      },
    };
    return { db, calls };
  }

  it('inserts with skipDuplicates and reports created on a fresh insert', async () => {
    const { db, calls } = fakeDb(1);
    const res = await saveAgentProposal(outcome({ action: 'reply', reply: 'hi' }), META, db);
    expect(res.created).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].skipDuplicates).toBe(true);
    expect(calls[0].data).toHaveLength(1);
    expect(calls[0].data[0].inboundMessageId).toBe('m1');
  });

  it('reports not-created when the inbound message already has a proposal (retry no-op)', async () => {
    const { db } = fakeDb(0);
    const res = await saveAgentProposal(outcome({ action: 'reply', reply: 'hi' }), META, db);
    expect(res.created).toBe(false);
  });
});
