// Gemini provider — Google Gen AI via @google/genai. Also the fixed voice-note
// STT path (spec §3): Claude can't take raw audio, so a Gemini instance handles
// transcription regardless of which model wins the conversation bake-off. Thin
// pass-through over the adapters (system → config.systemInstruction; messages →
// contents; tools/toolConfig from the agnostic shapes).

import { GoogleGenAI } from '@google/genai';
import type { LlmProvider, GenerateRequest, GenerateResult, TranscribeInput, ImageInput, ExtractedDimensions } from './provider';
import type { ModelSpec } from './models';
import { toGeminiContents, toGeminiTools, toGeminiToolChoice, fromGeminiResponse } from './adapters';

const DEFAULT_MAX_TOKENS = 4096;

const DIMENSIONS_PROMPT = [
  "Read this floor-plan / room sketch to get ONE room's INNER wall-to-wall dimensions in METERS.",
  'Return ONLY strict JSON, no prose and no code fence:',
  '{"found": boolean, "innerWidthM": number|null, "innerLengthM": number|null, "confidence": "high"|"low", "note": string}.',
  'If the image shows a single clear room with two readable inner dimensions, set found=true, fill both in meters',
  '(convert cm/mm if the drawing is labelled in those units), confidence="high".',
  'If dimensions are missing, ambiguous, span multiple rooms, or you are unsure, set found=false, confidence="low",',
  'with a short note. NEVER guess a number you cannot actually read.',
].join(' ');

/** Parse the model's JSON dimension output defensively — any malformed or
 *  incomplete output degrades to a low-confidence not-found so the caller asks
 *  for typed dimensions instead of quoting off a misread (spec §4.5). Pure. */
export function parseDimensions(text: string): ExtractedDimensions {
  const cleaned = text.replace(/```json|```/gi, '').trim();
  try {
    const o = JSON.parse(cleaned) as Record<string, unknown>;
    const found = o.found === true;
    const w = typeof o.innerWidthM === 'number' ? o.innerWidthM : undefined;
    const l = typeof o.innerLengthM === 'number' ? o.innerLengthM : undefined;
    const note = typeof o.note === 'string' ? o.note : undefined;
    // A "found" result MUST carry two sane positive dimensions, else it's not found.
    if (found && (w == null || l == null || w <= 0 || l <= 0)) {
      return { found: false, confidence: 'low', note: note ?? 'incomplete dimensions' };
    }
    return { found, innerWidthM: w, innerLengthM: l, confidence: found && o.confidence === 'high' ? 'high' : 'low', note };
  } catch {
    return { found: false, confidence: 'low', note: 'could not parse vision output' };
  }
}

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

  /** Floor-plan dimension reading (spec §4.5). Sends the image inline and parses
   *  the model's JSON; the caller echoes the dims to the customer to confirm and
   *  never quotes off a misread sketch. */
  async extractDimensions(image: ImageInput): Promise<ExtractedDimensions> {
    const resp = await this.getClient().models.generateContent({
      model: this.model.modelId,
      contents: [
        {
          role: 'user',
          parts: [
            { text: DIMENSIONS_PROMPT },
            { inlineData: { mimeType: image.mimeType, data: image.data } },
          ],
        },
      ],
    });
    return parseDimensions(fromGeminiResponse(resp).text);
  }
}
