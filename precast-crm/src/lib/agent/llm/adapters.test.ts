import { describe, it, expect } from 'vitest';
import {
  CACHE_TTL,
  toClaudeTools,
  toClaudeToolChoice,
  toClaudeSystem,
  toClaudeMessages,
  buildClaudeRequest,
  fromClaudeResponse,
  toGeminiTools,
  toGeminiToolChoice,
  toGeminiContents,
  fromGeminiResponse,
  toOpenAITools,
  toOpenAIToolChoice,
  toOpenAIMessages,
  fromOpenAIResponse,
} from './adapters';
import type { GenerateRequest, LlmMessage } from './provider';
import type { AgentToolDefinition } from '@/lib/agent/tools/types';
import { getModel } from './models';

const TOOLS: AgentToolDefinition[] = [
  { name: 'get_quote', description: 'price a slab', inputSchema: { type: 'object', properties: { w: { type: 'number' } }, required: ['w'], additionalProperties: false } },
  { name: 'check_stock', description: 'stock', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
];

const OPUS = getModel('claude-opus-4-8')!;

describe('Claude tool + caching adapters', () => {
  it('maps inputSchema→input_schema and caches ONLY the last tool', () => {
    const out = toClaudeTools(TOOLS);
    expect(out[0]).toEqual({ name: 'get_quote', description: 'price a slab', input_schema: TOOLS[0].inputSchema });
    expect(out[0].cache_control).toBeUndefined();
    expect(out[1].cache_control).toEqual({ type: 'ephemeral', ttl: CACHE_TTL });
    expect(CACHE_TTL).toBe('1h');
  });

  it('omits cache_control when caching is disabled', () => {
    expect(toClaudeTools(TOOLS, false).every((t) => t.cache_control === undefined)).toBe(true);
  });

  it('caches the system block (the stable identity+KB prefix)', () => {
    expect(toClaudeSystem('SYS')).toEqual([{ type: 'text', text: 'SYS', cache_control: { type: 'ephemeral', ttl: '1h' } }]);
    expect(toClaudeSystem('SYS', false)).toEqual([{ type: 'text', text: 'SYS' }]);
  });

  it('maps tool_choice: auto→auto, required→any, tool→tool', () => {
    expect(toClaudeToolChoice({ type: 'auto' })).toEqual({ type: 'auto' });
    expect(toClaudeToolChoice({ type: 'required' })).toEqual({ type: 'any' });
    expect(toClaudeToolChoice({ type: 'tool', name: 'get_quote' })).toEqual({ type: 'tool', name: 'get_quote' });
  });
});

describe('toClaudeMessages', () => {
  it('passes a plain user string through', () => {
    expect(toClaudeMessages([{ role: 'user', content: 'hi' }])).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('converts user tool_result blocks (with is_error)', () => {
    const msgs: LlmMessage[] = [
      { role: 'user', content: [{ type: 'tool_result', toolUseId: 't1', content: '{"ok":true}' }, { type: 'tool_result', toolUseId: 't2', content: 'boom', isError: true }] },
    ];
    expect(toClaudeMessages(msgs)).toEqual([
      { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 't1', content: '{"ok":true}' },
        { type: 'tool_result', tool_use_id: 't2', content: 'boom', is_error: true },
      ] },
    ]);
  });

  it('converts an assistant turn with text + tool calls', () => {
    const msgs: LlmMessage[] = [
      { role: 'assistant', content: 'let me check', toolCalls: [{ id: 't1', name: 'get_quote', input: { w: 4 } }] },
    ];
    expect(toClaudeMessages(msgs)).toEqual([
      { role: 'assistant', content: [
        { type: 'text', text: 'let me check' },
        { type: 'tool_use', id: 't1', name: 'get_quote', input: { w: 4 } },
      ] },
    ]);
  });

  it('emits tool_use only when assistant text is empty, and a fallback block when truly empty', () => {
    expect(toClaudeMessages([{ role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'x', input: {} }] }])).toEqual([
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'x', input: {} }] },
    ]);
    expect(toClaudeMessages([{ role: 'assistant', content: '' }])).toEqual([
      { role: 'assistant', content: [{ type: 'text', text: '' }] },
    ]);
  });
});

describe('buildClaudeRequest', () => {
  const req: GenerateRequest = {
    system: 'SYS',
    messages: [{ role: 'user', content: 'hi' }],
    tools: TOOLS,
    toolChoice: { type: 'tool', name: 'get_quote' },
  };

  it('assembles a cached, tool-forced body with the model id and default max_tokens', () => {
    const body = buildClaudeRequest(req, OPUS);
    expect(body.model).toBe('claude-opus-4-8');
    expect(body.max_tokens).toBe(4096);
    expect(body.system).toEqual([{ type: 'text', text: 'SYS', cache_control: { type: 'ephemeral', ttl: '1h' } }]);
    expect((body.tools as unknown[]).length).toBe(2);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'get_quote' });
    expect(body.thinking).toEqual({ type: 'adaptive' });
  });

  it('NEVER includes sampling params (they 400 on Opus 4.8)', () => {
    const body = buildClaudeRequest(req, OPUS);
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
    expect(body).not.toHaveProperty('top_k');
  });

  it('honours maxTokens override, thinking:false, and omits tools when none', () => {
    const body = buildClaudeRequest({ ...req, tools: [], toolChoice: undefined, maxTokens: 1000 }, OPUS, { thinking: false });
    expect(body.max_tokens).toBe(1000);
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('tool_choice');
    expect(body).not.toHaveProperty('thinking');
  });
});

describe('fromClaudeResponse', () => {
  it('concatenates text, extracts tool_use, ignores thinking, maps cache usage', () => {
    const res = fromClaudeResponse({
      content: [
        { type: 'thinking', text: 'hmm' },
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world' },
        { type: 'tool_use', id: 't1', name: 'get_quote', input: { w: 4 } },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 8, cache_creation_input_tokens: 0 },
    });
    expect(res.text).toBe('Hello world');
    expect(res.toolCalls).toEqual([{ id: 't1', name: 'get_quote', input: { w: 4 } }]);
    expect(res.stopReason).toBe('tool_use');
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 8, cacheCreationInputTokens: 0 });
  });

  it('handles a tool_use with missing input as empty object', () => {
    const res = fromClaudeResponse({ content: [{ type: 'tool_use', id: 't1', name: 'x' }] });
    expect(res.toolCalls[0].input).toEqual({});
  });
});

describe('Gemini adapters', () => {
  it('maps tools to functionDeclarations and forces a tool via ANY + allowedFunctionNames', () => {
    expect(toGeminiTools(TOOLS).functionDeclarations[0]).toEqual({ name: 'get_quote', description: 'price a slab', parameters: TOOLS[0].inputSchema });
    expect(toGeminiToolChoice({ type: 'auto' })).toEqual({ functionCallingConfig: { mode: 'AUTO' } });
    expect(toGeminiToolChoice({ type: 'required' })).toEqual({ functionCallingConfig: { mode: 'ANY' } });
    expect(toGeminiToolChoice({ type: 'tool', name: 'get_quote' })).toEqual({ functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['get_quote'] } });
  });

  it('converts messages to contents: model role, functionCall, functionResponse with name', () => {
    const msgs: LlmMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'checking', toolCalls: [{ id: 'c1', name: 'get_quote', input: { w: 4 } }] },
      { role: 'user', content: [{ type: 'tool_result', toolUseId: 'c1', name: 'get_quote', content: '{"price":100}' }] },
    ];
    expect(toGeminiContents(msgs)).toEqual([
      { role: 'user', parts: [{ text: 'hi' }] },
      { role: 'model', parts: [{ text: 'checking' }, { functionCall: { name: 'get_quote', id: 'c1', args: { w: 4 } } }] },
      { role: 'user', parts: [{ functionResponse: { name: 'get_quote', id: 'c1', response: { price: 100 } } }] },
    ]);
  });

  it('wraps non-object tool output in {result} for functionResponse', () => {
    const out = toGeminiContents([{ role: 'user', content: [{ type: 'tool_result', toolUseId: 'c1', name: 'x', content: 'plain text' }] }]);
    expect(out[0].parts[0]).toEqual({ functionResponse: { name: 'x', id: 'c1', response: { result: 'plain text' } } });
  });

  it('normalizes a response: text + synthesized function-call id + cached usage', () => {
    const res = fromGeminiResponse({
      candidates: [{ content: { parts: [{ text: 'Hi' }, { functionCall: { name: 'get_quote', args: { w: 4 } } }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, cachedContentTokenCount: 8 },
    });
    expect(res.text).toBe('Hi');
    expect(res.toolCalls).toEqual([{ id: 'get_quote-1', name: 'get_quote', input: { w: 4 } }]);
    expect(res.stopReason).toBe('STOP');
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 8 });
  });

  it('round-trips thoughtSignature: captured from the functionCall part and echoed back', () => {
    // Thinking models attach an opaque thoughtSignature to the functionCall part;
    // it MUST be returned verbatim on the same part next turn or Gemini 400s.
    const res = fromGeminiResponse({
      candidates: [{ content: { parts: [{ functionCall: { name: 'get_quote', args: { w: 4 } }, thoughtSignature: 'sig-abc' }] } }],
    });
    expect(res.toolCalls).toEqual([{ id: 'get_quote-0', name: 'get_quote', input: { w: 4 }, thoughtSignature: 'sig-abc' }]);

    const contents = toGeminiContents([{ role: 'assistant', content: '', toolCalls: res.toolCalls }]);
    expect(contents[0].parts).toEqual([
      { functionCall: { name: 'get_quote', id: 'get_quote-0', args: { w: 4 } }, thoughtSignature: 'sig-abc' },
    ]);
  });
});

describe('OpenAI adapters', () => {
  it('maps tools to function shape and tool_choice variants', () => {
    expect(toOpenAITools(TOOLS)[0]).toEqual({ type: 'function', function: { name: 'get_quote', description: 'price a slab', parameters: TOOLS[0].inputSchema } });
    expect(toOpenAIToolChoice({ type: 'auto' })).toBe('auto');
    expect(toOpenAIToolChoice({ type: 'required' })).toBe('required');
    expect(toOpenAIToolChoice({ type: 'tool', name: 'get_quote' })).toEqual({ type: 'function', function: { name: 'get_quote' } });
  });

  it('builds chat messages: system first, tool results as role:tool, assistant tool_calls', () => {
    const msgs: LlmMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'checking', toolCalls: [{ id: 'c1', name: 'get_quote', input: { w: 4 } }] },
      { role: 'user', content: [{ type: 'tool_result', toolUseId: 'c1', content: '{"price":100}' }] },
    ];
    expect(toOpenAIMessages('SYS', msgs)).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'checking', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_quote', arguments: '{"w":4}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: '{"price":100}' },
    ]);
  });

  it('omits the system message when system is empty and nulls empty assistant content', () => {
    const out = toOpenAIMessages('', [{ role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'x', input: {} }] }]);
    expect(out).toEqual([
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'x', arguments: '{}' } }] },
    ]);
  });

  it('parses tool-call arguments JSON and maps cached usage', () => {
    const res = fromOpenAIResponse({
      choices: [{ message: { content: 'Hi', tool_calls: [{ id: 't1', function: { name: 'get_quote', arguments: '{"w":4}' } }] }, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 8 } },
    });
    expect(res.text).toBe('Hi');
    expect(res.toolCalls).toEqual([{ id: 't1', name: 'get_quote', input: { w: 4 } }]);
    expect(res.stopReason).toBe('tool_calls');
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 8 });
  });

  it('falls back to empty input on malformed tool-call arguments', () => {
    const res = fromOpenAIResponse({ choices: [{ message: { content: null, tool_calls: [{ id: 't1', function: { name: 'x', arguments: 'not json' } }] } }] });
    expect(res.text).toBe('');
    expect(res.toolCalls[0].input).toEqual({});
  });
});
