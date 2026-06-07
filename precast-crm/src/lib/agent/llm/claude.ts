// Claude provider — Anthropic Messages API via the official @anthropic-ai/sdk
// (per the claude-api skill). A thin pass-through: buildClaudeRequest assembles
// the cached, tool-forced body (adapters.ts), the SDK sends it, fromClaudeResponse
// normalizes. No raw fetch, no OpenAI-compat shim. Has no transcribe() — Claude
// cannot accept raw audio (spec §3); voice goes through the Gemini provider.

import Anthropic from '@anthropic-ai/sdk';
import type { LlmProvider, GenerateRequest, GenerateResult } from './provider';
import type { ModelSpec } from './models';
import { buildClaudeRequest, fromClaudeResponse, type BuildClaudeOptions } from './adapters';

/** The slice of the Anthropic client this provider uses — lets tests inject a
 *  fake without an API key or network. */
export interface ClaudeLike {
  messages: { create(body: unknown): Promise<unknown> };
}

export interface ClaudeProviderDeps extends BuildClaudeOptions {
  /** Inject a fake client (tests) or a pre-built Anthropic instance. */
  client?: ClaudeLike;
  apiKey?: string;
}

export class ClaudeProvider implements LlmProvider {
  readonly model: ModelSpec;
  private readonly apiKey?: string;
  private readonly buildOpts: BuildClaudeOptions;
  private client?: ClaudeLike;

  constructor(model: ModelSpec, deps: ClaudeProviderDeps = {}) {
    this.model = model;
    this.client = deps.client;
    this.apiKey = deps.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.buildOpts = { thinking: deps.thinking, cache: deps.cache };
  }

  /** Lazily construct the real SDK client so creating a provider without a key
   *  never throws — it only fails if you actually call generate() without one. */
  private getClient(): ClaudeLike {
    return (this.client ??= new Anthropic({ apiKey: this.apiKey }) as unknown as ClaudeLike);
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const body = buildClaudeRequest(req, this.model, this.buildOpts);
    const resp = await this.getClient().messages.create(body);
    return fromClaudeResponse(resp);
  }
}
