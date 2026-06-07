// Gemini provider — Google Gen AI via @google/genai. Also the fixed voice-note
// STT path (spec §3): Claude can't take raw audio, so a Gemini instance handles
// transcription regardless of which model wins the conversation bake-off. Thin
// pass-through over the adapters (system → config.systemInstruction; messages →
// contents; tools/toolConfig from the agnostic shapes).

import { GoogleGenAI } from '@google/genai';
import type { LlmProvider, GenerateRequest, GenerateResult, TranscribeInput } from './provider';
import type { ModelSpec } from './models';
import { toGeminiContents, toGeminiTools, toGeminiToolChoice, fromGeminiResponse } from './adapters';

const DEFAULT_MAX_TOKENS = 4096;

export interface GeminiLike {
  models: { generateContent(req: unknown): Promise<unknown> };
}

export interface GeminiProviderDeps {
  client?: GeminiLike;
  apiKey?: string;
}

export class GeminiProvider implements LlmProvider {
  readonly model: ModelSpec;
  private readonly apiKey?: string;
  private client?: GeminiLike;

  constructor(model: ModelSpec, deps: GeminiProviderDeps = {}) {
    this.model = model;
    this.client = deps.client;
    this.apiKey = deps.apiKey ?? process.env.GEMINI_API_KEY;
  }

  private getClient(): GeminiLike {
    return (this.client ??= new GoogleGenAI({ apiKey: this.apiKey }) as unknown as GeminiLike);
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const config: Record<string, unknown> = { maxOutputTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS };
    if (req.system) config.systemInstruction = req.system;
    if (req.tools.length) config.tools = [toGeminiTools(req.tools)];
    if (req.toolChoice) config.toolConfig = toGeminiToolChoice(req.toolChoice);

    const resp = await this.getClient().models.generateContent({
      model: this.model.modelId,
      contents: toGeminiContents(req.messages),
      config,
    });
    return fromGeminiResponse(resp);
  }

  /** Voice-note STT (spec §3). Sends allowlisted audio inline and returns the
   *  transcript text; quotes built from voice are human-checked downstream. */
  async transcribe(audio: TranscribeInput): Promise<string> {
    const resp = await this.getClient().models.generateContent({
      model: this.model.modelId,
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Transcribe this audio verbatim in its original language. Output only the transcript text, nothing else.' },
            { inlineData: { mimeType: audio.mimeType, data: audio.data } },
          ],
        },
      ],
    });
    return fromGeminiResponse(resp).text;
  }
}
