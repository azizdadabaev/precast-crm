// Provider adapters — pure translation between the provider-agnostic shapes
// (provider.ts) and each vendor's wire format. No SDK imports, no I/O: the
// concrete clients call these, then hand the result to the vendor SDK. This is
// where tool-calling + prompt-caching correctness lives, so it is exhaustively
// unit-tested without needing API keys.
//
// Claude mechanics follow the verified Messages API (per the claude-api skill):
// render order tools → system → messages; cache_control {type:'ephemeral',
// ttl:'1h'} on the LAST tool def + the system block; tool_choice {type:'tool'}
// to force a tool on price turns; NO temperature/top_p/top_k (they 400 on Opus
// 4.8); adaptive thinking. Caching hits are verified via cache_read_input_tokens.

import type { AgentToolDefinition } from '@/lib/agent/tools/types';
import type {
  GenerateRequest,
  GenerateResult,
  LlmMessage,
  LlmToolCall,
  LlmToolChoice,
} from './provider';
import type { ModelSpec } from './models';

/** Default prompt-cache TTL — Telegram replies arrive minutes-to-hours apart,
 *  so 1h beats the 5-minute default (spec §4.4). */
export const CACHE_TTL = '1h' as const;
const DEFAULT_MAX_TOKENS = 4096;

type CacheControl = { type: 'ephemeral'; ttl: typeof CACHE_TTL };
const cacheControl = (): CacheControl => ({ type: 'ephemeral', ttl: CACHE_TTL });

// ── Anthropic Claude ────────────────────────────────────────────

export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  cache_control?: CacheControl;
}

/** Map tool defs to Claude format; cache_control on the LAST tool caches the
 *  whole tool block (render order puts tools first). */
export function toClaudeTools(defs: AgentToolDefinition[], cache = true): ClaudeTool[] {
  return defs.map((d, i) => ({
    name: d.name,
    description: d.description,
    input_schema: d.inputSchema,
    ...(cache && i === defs.length - 1 ? { cache_control: cacheControl() } : {}),
  }));
}

export type ClaudeToolChoice =
  | { type: 'auto' }
  | { type: 'any' }
  | { type: 'tool'; name: string };

export function toClaudeToolChoice(tc: LlmToolChoice): ClaudeToolChoice {
  switch (tc.type) {
    case 'auto':
      return { type: 'auto' };
    case 'required':
      return { type: 'any' }; // Claude spells "must call something" as `any`
    case 'tool':
      return { type: 'tool', name: tc.name };
  }
}

export interface ClaudeSystemBlock {
  type: 'text';
  text: string;
  cache_control?: CacheControl;
}

/** System as a single cached text block (the stable identity+KB prefix). */
export function toClaudeSystem(system: string, cache = true): ClaudeSystemBlock[] {
  return [{ type: 'text', text: system, ...(cache ? { cache_control: cacheControl() } : {}) }];
}

type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

export function toClaudeMessages(messages: LlmMessage[]): ClaudeMessage[] {
  return messages.map((m): ClaudeMessage => {
    if (m.role === 'user') {
      if (typeof m.content === 'string') return { role: 'user', content: m.content };
      return {
        role: 'user',
        content: m.content.map((b) =>
          b.type === 'text'
            ? { type: 'text', text: b.text }
            : { type: 'tool_result', tool_use_id: b.toolUseId, content: b.content, ...(b.isError ? { is_error: true } : {}) },
        ),
      };
    }
    // assistant: text block (if any) followed by tool_use blocks
    const blocks: ClaudeContentBlock[] = [];
    if (m.content) blocks.push({ type: 'text', text: m.content });
    for (const tc of m.toolCalls ?? []) {
      blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
    }
    // Claude requires non-empty content; fall back to an empty text block.
    return { role: 'assistant', content: blocks.length ? blocks : [{ type: 'text', text: '' }] };
  });
}

export interface BuildClaudeOptions {
  /** Adaptive thinking (spec/skill default for tool-using reasoning). */
  thinking?: boolean;
  /** Enable prompt caching (cache_control on last tool + system). */
  cache?: boolean;
}

/** Assemble the full Messages API request body. The Claude client passes this
 *  straight to `client.messages.create(...)`. No sampling params (they 400 on
 *  Opus 4.8). */
export function buildClaudeRequest(
  req: GenerateRequest,
  model: ModelSpec,
  opts: BuildClaudeOptions = {},
): Record<string, unknown> {
  const cache = opts.cache ?? true;
  const body: Record<string, unknown> = {
    model: model.modelId,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: toClaudeSystem(req.system, cache),
    messages: toClaudeMessages(req.messages),
  };
  if (req.tools.length) body.tools = toClaudeTools(req.tools, cache);
  if (req.toolChoice) body.tool_choice = toClaudeToolChoice(req.toolChoice);
  if (opts.thinking ?? true) body.thinking = { type: 'adaptive' };
  return body;
}

interface ClaudeResponseLike {
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
  stop_reason?: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

export function fromClaudeResponse(resp: ClaudeResponseLike): GenerateResult {
  let text = '';
  const toolCalls: LlmToolCall[] = [];
  for (const block of resp.content ?? []) {
    if (block.type === 'text' && block.text) text += block.text;
    else if (block.type === 'tool_use' && block.id && block.name) {
      toolCalls.push({ id: block.id, name: block.name, input: (block.input as Record<string, unknown>) ?? {} });
    }
    // thinking / redacted_thinking blocks are intentionally ignored
  }
  return {
    text,
    toolCalls,
    stopReason: resp.stop_reason ?? undefined,
    usage: resp.usage && {
      inputTokens: resp.usage.input_tokens,
      outputTokens: resp.usage.output_tokens,
      cacheReadInputTokens: resp.usage.cache_read_input_tokens,
      cacheCreationInputTokens: resp.usage.cache_creation_input_tokens,
    },
  };
}

// ── Google Gemini ───────────────────────────────────────────────

export interface GeminiTools {
  functionDeclarations: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
}

export function toGeminiTools(defs: AgentToolDefinition[]): GeminiTools {
  return {
    functionDeclarations: defs.map((d) => ({
      name: d.name,
      description: d.description,
      parameters: d.inputSchema,
    })),
  };
}

export interface GeminiToolConfig {
  functionCallingConfig: { mode: 'AUTO' | 'ANY'; allowedFunctionNames?: string[] };
}

export function toGeminiToolChoice(tc: LlmToolChoice): GeminiToolConfig {
  switch (tc.type) {
    case 'auto':
      return { functionCallingConfig: { mode: 'AUTO' } };
    case 'required':
      return { functionCallingConfig: { mode: 'ANY' } };
    case 'tool':
      return { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [tc.name] } };
  }
}

interface GeminiResponseLike {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }> };
    finishReason?: string;
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number };
}

export function fromGeminiResponse(resp: GeminiResponseLike): GenerateResult {
  const cand = resp.candidates?.[0];
  let text = '';
  const toolCalls: LlmToolCall[] = [];
  const parts = cand?.content?.parts ?? [];
  parts.forEach((p, i) => {
    if (p.text) text += p.text;
    else if (p.functionCall) {
      // Gemini function calls carry no id; synthesize a stable one for the loop.
      toolCalls.push({ id: `${p.functionCall.name}-${i}`, name: p.functionCall.name, input: p.functionCall.args ?? {} });
    }
  });
  return {
    text,
    toolCalls,
    stopReason: cand?.finishReason,
    usage: resp.usageMetadata && {
      inputTokens: resp.usageMetadata.promptTokenCount,
      outputTokens: resp.usageMetadata.candidatesTokenCount,
      cacheReadInputTokens: resp.usageMetadata.cachedContentTokenCount,
    },
  };
}

// ── OpenAI GPT ──────────────────────────────────────────────────

export interface OpenAITool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export function toOpenAITools(defs: AgentToolDefinition[]): OpenAITool[] {
  return defs.map((d) => ({
    type: 'function',
    function: { name: d.name, description: d.description, parameters: d.inputSchema },
  }));
}

export type OpenAIToolChoice =
  | 'auto'
  | 'required'
  | { type: 'function'; function: { name: string } };

export function toOpenAIToolChoice(tc: LlmToolChoice): OpenAIToolChoice {
  switch (tc.type) {
    case 'auto':
      return 'auto';
    case 'required':
      return 'required';
    case 'tool':
      return { type: 'function', function: { name: tc.name } };
  }
}

interface OpenAIResponseLike {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
    };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
}

export function fromOpenAIResponse(resp: OpenAIResponseLike): GenerateResult {
  const choice = resp.choices?.[0];
  const toolCalls: LlmToolCall[] = [];
  for (const tc of choice?.message?.tool_calls ?? []) {
    let input: Record<string, unknown> = {};
    try {
      input = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
    } catch {
      input = {}; // malformed arguments → empty; the tool's own validation escalates
    }
    toolCalls.push({ id: tc.id, name: tc.function.name, input });
  }
  return {
    text: choice?.message?.content ?? '',
    toolCalls,
    stopReason: choice?.finish_reason,
    usage: resp.usage && {
      inputTokens: resp.usage.prompt_tokens,
      outputTokens: resp.usage.completion_tokens,
      cacheReadInputTokens: resp.usage.prompt_tokens_details?.cached_tokens,
    },
  };
}
