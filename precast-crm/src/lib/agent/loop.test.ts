import { describe, it, expect } from 'vitest';
import { runAgentTurn, ESCALATE_TOOL, REQUEST_APPROVAL_TOOL } from './loop';
import { createToolRegistry } from './tools/registry';
import { type AgentTool, type ToolResult, toolOk } from './tools/types';
import type { GenerateRequest, GenerateResult, LlmProvider, LlmToolResult } from './llm/provider';
import { getModel } from './llm/models';

function provider(script: GenerateResult[]): LlmProvider & { requests: GenerateRequest[] } {
  const requests: GenerateRequest[] = [];
  let i = 0;
  return {
    model: getModel('claude-opus-4-8')!,
    requests,
    async generate(req) {
      requests.push(req);
      return script[Math.min(i++, script.length - 1)];
    },
  };
}

function tool(name: string, result: ToolResult<unknown> = toolOk({ name })): AgentTool {
  return {
    definition: { name, description: name, inputSchema: { type: 'object', additionalProperties: false, properties: {} } },
    execute: async () => result,
  };
}

const res = (over: Partial<GenerateResult> = {}): GenerateResult => ({ text: '', toolCalls: [], ...over });
const base = { system: 'SYS', history: [], inbound: 'salom' };

describe('runAgentTurn', () => {
  it('returns a plain reply when the model calls no tools', async () => {
    const p = provider([res({ text: 'Assalomu alaykum!', usage: { inputTokens: 10, outputTokens: 3, cacheReadInputTokens: 9 } })]);
    const r = await runAgentTurn(base, { provider: p, tools: createToolRegistry([]) });
    expect(r.decision).toEqual({ action: 'reply', reply: 'Assalomu alaykum!' });
    expect(r.turns).toBe(1);
    expect(r.usage).toEqual({ inputTokens: 10, outputTokens: 3, cacheReadInputTokens: 9, cacheCreationInputTokens: 0 });
  });

  it('dispatches a quote tool, then allows the priced reply (fresh quote_id)', async () => {
    const p = provider([
      res({ toolCalls: [{ id: 't1', name: 'get_quote', input: { inner_width: 4, inner_length: 5 } }] }),
      res({ text: "Narxi 1 200 000 so'm." }),
    ]);
    const reg = createToolRegistry([tool('get_quote', toolOk({ quote_id: 'q', subtotal: 1_200_000 }))]);
    const r = await runAgentTurn(base, { provider: p, tools: reg });

    expect(r.decision).toEqual({ action: 'reply', reply: "Narxi 1 200 000 so'm." });
    expect(r.freshQuote).toBe(true);
    expect(r.toolCalls).toEqual([{ name: 'get_quote', ok: true }]);
    // the tool_result was fed back as a user turn
    const toolTurn = r.messages.find((m) => m.role === 'user' && Array.isArray(m.content));
    expect(((toolTurn!.content as LlmToolResult[])[0]).toolUseId).toBe('t1');
  });

  it('BLOCKS a priced reply when no quote was minted this turn', async () => {
    const p = provider([res({ text: "Narxi 1 200 000 so'm." })]); // price, but no tool called
    const r = await runAgentTurn(base, { provider: p, tools: createToolRegistry([]) });
    expect(r.decision.action).toBe('blocked');
    expect(r.freshQuote).toBe(false);
  });

  it('escalates when the model calls escalate_to_human', async () => {
    const p = provider([res({ toolCalls: [{ id: 't1', name: ESCALATE_TOOL.name, input: { reason: 'customer is upset' } }] })]);
    const r = await runAgentTurn(base, { provider: p, tools: createToolRegistry([]) });
    expect(r.decision).toEqual({ action: 'escalate', reason: 'customer is upset' });
    // escalate_to_human is advertised to the model
    expect(p.requests[0].tools.some((t) => t.name === 'escalate_to_human')).toBe(true);
  });

  it('returns a request_approval decision with the gathered draft (terminal)', async () => {
    const p = provider([res({ toolCalls: [{ id: 't1', name: REQUEST_APPROVAL_TOOL.name, input: { quote_id: 'q1', customer_name: 'Akmal', customer_phone: '998901112233', delivery_address: 'Tashkent', notes: 'asap' } }] })]);
    const r = await runAgentTurn(base, { provider: p, tools: createToolRegistry([]) });
    expect(r.decision).toEqual({
      action: 'request_approval',
      draft: { quoteId: 'q1', customerName: 'Akmal', customerPhone: '998901112233', deliveryAddress: 'Tashkent', notes: 'asap' },
    });
    expect(p.requests[0].tools.some((t) => t.name === 'request_approval')).toBe(true);
  });

  it('forces a tool on the first turn only, then auto', async () => {
    const p = provider([
      res({ toolCalls: [{ id: 't1', name: 'get_quote', input: {} }] }),
      res({ text: 'done' }),
    ]);
    const reg = createToolRegistry([tool('get_quote', toolOk({ quote_id: 'q' }))]);
    await runAgentTurn({ ...base, forceFirstTool: { type: 'tool', name: 'get_quote' } }, { provider: p, tools: reg });
    expect(p.requests[0].toolChoice).toEqual({ type: 'tool', name: 'get_quote' });
    expect(p.requests[1].toolChoice).toEqual({ type: 'auto' });
  });

  it('escalates (max_turns) when the model never stops calling tools', async () => {
    const p = provider([res({ toolCalls: [{ id: 't1', name: 'check_stock', input: {} }] })]); // same every call
    const reg = createToolRegistry([tool('check_stock')]);
    const r = await runAgentTurn(base, { provider: p, tools: reg, maxTurns: 3 });
    expect(r.decision).toEqual({ action: 'max_turns' });
    expect(r.turns).toBe(3);
    expect(r.toolCalls).toHaveLength(3);
  });

  it('dispatches MULTIPLE tool calls in one turn and feeds all results back as one user turn', async () => {
    const p = provider([
      res({ toolCalls: [
        { id: 't1', name: 'get_quote', input: {} },
        { id: 't2', name: 'check_stock', input: {} },
      ] }),
      res({ text: 'done' }),
    ]);
    const reg = createToolRegistry([tool('get_quote', toolOk({ quote_id: 'q' })), tool('check_stock')]);
    const r = await runAgentTurn(base, { provider: p, tools: reg });
    expect(r.toolCalls).toEqual([{ name: 'get_quote', ok: true }, { name: 'check_stock', ok: true }]);
    const toolTurn = r.messages.find((m) => m.role === 'user' && Array.isArray(m.content));
    expect((toolTurn!.content as LlmToolResult[]).map((b) => b.toolUseId)).toEqual(['t1', 't2']);
  });

  it('escalates deterministically even when escalate_to_human is NOT the last call (no other tools run)', async () => {
    const reg = createToolRegistry([tool('get_quote', toolOk({ quote_id: 'q' }))]);
    const p = provider([
      res({ toolCalls: [
        { id: 't1', name: ESCALATE_TOOL.name, input: { reason: 'upset' } },
        { id: 't2', name: 'get_quote', input: {} },
      ] }),
    ]);
    const r = await runAgentTurn(base, { provider: p, tools: reg });
    expect(r.decision).toEqual({ action: 'escalate', reason: 'upset' });
    expect(r.toolCalls).toHaveLength(0); // get_quote was NOT run
    expect(r.freshQuote).toBe(false);
  });

  it('feeds a failed tool result back and records it (loop continues)', async () => {
    const p = provider([
      res({ toolCalls: [{ id: 't1', name: 'unknown_tool', input: {} }] }),
      res({ text: 'sorry, let me escalate', toolCalls: [{ id: 't2', name: ESCALATE_TOOL.name, input: { reason: 'tool failed' } }] }),
    ]);
    const r = await runAgentTurn(base, { provider: p, tools: createToolRegistry([]) });
    expect(r.toolCalls[0]).toEqual({ name: 'unknown_tool', ok: false }); // unknown → escalate result, ok:false
    expect(r.decision).toEqual({ action: 'escalate', reason: 'tool failed' });
  });
});
