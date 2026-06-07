import { describe, it, expect } from 'vitest';
import { ClaudeProvider, type ClaudeLike } from './claude';
import { GeminiProvider, type GeminiLike } from './gemini';
import { OpenAIProvider, type OpenAILike } from './openai';
import { createProvider, createProviderByKey, createTranscriptionProvider } from './factory';
import { getModel } from './models';
import type { GenerateRequest } from './provider';
import type { AgentToolDefinition } from '@/lib/agent/tools/types';

const TOOLS: AgentToolDefinition[] = [
  { name: 'get_quote', description: 'price', inputSchema: { type: 'object', properties: { w: { type: 'number' } }, required: ['w'], additionalProperties: false } },
];

const REQ: GenerateRequest = {
  system: 'You are Etalon.',
  messages: [{ role: 'user', content: 'how much for 4x5?' }],
  tools: TOOLS,
  toolChoice: { type: 'tool', name: 'get_quote' },
  maxTokens: 1234,
};

describe('ClaudeProvider', () => {
  it('sends a cached, tool-forced Messages body and normalizes the response', async () => {
    let captured: Record<string, unknown> | undefined;
    const fake: ClaudeLike = {
      messages: {
        async create(body) {
          captured = body as Record<string, unknown>;
          return {
            content: [{ type: 'text', text: 'one moment' }, { type: 'tool_use', id: 't1', name: 'get_quote', input: { w: 4 } }],
            stop_reason: 'tool_use',
            usage: { input_tokens: 10, output_tokens: 4, cache_read_input_tokens: 8 },
          };
        },
      },
    };
    const provider = new ClaudeProvider(getModel('claude-opus-4-8')!, { client: fake });
    const res = await provider.generate(REQ);

    expect(captured!.model).toBe('claude-opus-4-8');
    expect(captured!.max_tokens).toBe(1234);
    expect((captured!.system as Array<{ cache_control?: { ttl: string } }>)[0].cache_control?.ttl).toBe('1h');
    expect(captured!.tool_choice).toEqual({ type: 'tool', name: 'get_quote' });
    expect(captured).not.toHaveProperty('temperature');

    expect(res.text).toBe('one moment');
    expect(res.toolCalls).toEqual([{ id: 't1', name: 'get_quote', input: { w: 4 } }]);
    expect(res.usage?.cacheReadInputTokens).toBe(8);
  });
});

describe('GeminiProvider', () => {
  it('sends contents + config(systemInstruction/tools/toolConfig) and normalizes', async () => {
    let captured: Record<string, unknown> | undefined;
    const fake: GeminiLike = {
      models: {
        async generateContent(req) {
          captured = req as Record<string, unknown>;
          return { candidates: [{ content: { parts: [{ text: 'hello' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 5 } };
        },
      },
    };
    const provider = new GeminiProvider(getModel('gemini-3.1-pro')!, { client: fake });
    const res = await provider.generate(REQ);

    expect(captured!.model).toBe('gemini-3.1-pro-preview');
    const config = captured!.config as Record<string, unknown>;
    expect(config.systemInstruction).toBe('You are Etalon.');
    expect(config.maxOutputTokens).toBe(1234);
    expect(config.toolConfig).toEqual({ functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['get_quote'] } });
    expect(Array.isArray(captured!.contents)).toBe(true);
    expect(res.text).toBe('hello');
  });

  it('transcribes audio via an inline base64 part', async () => {
    let captured: { contents?: Array<{ parts?: Array<{ inlineData?: { mimeType: string; data: string } }> }> } | undefined;
    const fake: GeminiLike = {
      models: {
        async generateContent(req) {
          captured = req as typeof captured;
          return { candidates: [{ content: { parts: [{ text: 'salom dunyo' }] } }] };
        },
      },
    };
    const provider = new GeminiProvider(getModel('gemini-3.5-flash')!, { client: fake });
    const text = await provider.transcribe({ data: 'BASE64AUDIO', mimeType: 'audio/ogg' });

    expect(text).toBe('salom dunyo');
    const inline = captured!.contents![0].parts!.find((p) => p.inlineData);
    expect(inline!.inlineData).toEqual({ mimeType: 'audio/ogg', data: 'BASE64AUDIO' });
  });
});

describe('OpenAIProvider', () => {
  it('sends chat.completions with max_completion_tokens and normalizes tool calls', async () => {
    let captured: Record<string, unknown> | undefined;
    const fake: OpenAILike = {
      chat: {
        completions: {
          async create(body) {
            captured = body as Record<string, unknown>;
            return {
              choices: [{ message: { content: 'ok', tool_calls: [{ id: 't1', function: { name: 'get_quote', arguments: '{"w":4}' } }] }, finish_reason: 'tool_calls' }],
              usage: { prompt_tokens: 5, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 3 } },
            };
          },
        },
      },
    };
    const provider = new OpenAIProvider(getModel('gpt-5.5')!, { client: fake });
    const res = await provider.generate(REQ);

    expect(captured!.model).toBe('gpt-5.5');
    expect(captured!.max_completion_tokens).toBe(1234);
    expect(captured).not.toHaveProperty('max_tokens');
    expect((captured!.messages as Array<{ role: string }>)[0].role).toBe('system');
    expect(captured!.tool_choice).toEqual({ type: 'function', function: { name: 'get_quote' } });
    expect(res.toolCalls).toEqual([{ id: 't1', name: 'get_quote', input: { w: 4 } }]);
    expect(res.usage?.cacheReadInputTokens).toBe(3);
  });
});

describe('provider factory', () => {
  it('maps each model to its matching concrete provider', () => {
    expect(createProvider(getModel('claude-opus-4-8')!)).toBeInstanceOf(ClaudeProvider);
    expect(createProvider(getModel('gemini-3.1-pro')!)).toBeInstanceOf(GeminiProvider);
    expect(createProvider(getModel('gpt-5.5')!)).toBeInstanceOf(OpenAIProvider);
  });

  it('resolves by registry key and throws on an unknown key', () => {
    expect(createProviderByKey('claude-opus-4-8').model.key).toBe('claude-opus-4-8');
    expect(() => createProviderByKey('nope')).toThrow();
  });

  it('always returns a Google provider for transcription (spec §3)', () => {
    const stt = createTranscriptionProvider();
    expect(stt).toBeInstanceOf(GeminiProvider);
    expect(stt.model.provider).toBe('google');
    expect(stt.model.capabilities.audioInput).toBe(true);
  });
});
