// OpenAI provider — Chat Completions via the official openai SDK. Thin
// pass-through over the adapters. Uses max_completion_tokens (GPT-5.x reasoning
// models reject the legacy max_tokens) and no sampling params.

import OpenAI from 'openai';
import type { LlmProvider, GenerateRequest, GenerateResult } from './provider';
import type { ModelSpec } from './models';
import { toOpenAIMessages, toOpenAITools, toOpenAIToolChoice, fromOpenAIResponse } from './adapters';

const DEFAULT_MAX_TOKENS = 4096;

export interface OpenAILike {
  chat: { completions: { create(body: unknown): Promise<unknown> } };
}

export interface OpenAIProviderDeps {
  client?: OpenAILike;
  apiKey?: string;
}

export class OpenAIProvider implements LlmProvider {
  readonly model: ModelSpec;
  private readonly apiKey?: string;
  private client?: OpenAILike;

  constructor(model: ModelSpec, deps: OpenAIProviderDeps = {}) {
    this.model = model;
    this.client = deps.client;
    this.apiKey = deps.apiKey ?? process.env.OPENAI_API_KEY;
  }

  private getClient(): OpenAILike {
    return (this.client ??= new OpenAI({ apiKey: this.apiKey }) as unknown as OpenAILike);
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const body: Record<string, unknown> = {
      model: this.model.modelId,
      messages: toOpenAIMessages(req.system, req.messages),
      max_completion_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    };
    if (req.tools.length) body.tools = toOpenAITools(req.tools);
    if (req.toolChoice) body.tool_choice = toOpenAIToolChoice(req.toolChoice);

    const resp = await this.getClient().chat.completions.create(body);
    return fromOpenAIResponse(resp);
  }
}
