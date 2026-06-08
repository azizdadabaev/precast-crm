// Gemini provider — Google Gen AI via @google/genai. Also the fixed voice-note
// STT path (spec §3): Claude can't take raw audio, so a Gemini instance handles
// transcription regardless of which model wins the conversation bake-off. Thin
// pass-through over the adapters (system → config.systemInstruction; messages →
// contents; tools/toolConfig from the agnostic shapes).

import { GoogleGenAI } from '@google/genai';
import { createHash } from 'crypto';
import type { LlmProvider, GenerateRequest, GenerateResult, TranscribeInput, ImageInput, ExtractedDimensions, ExtractedRoom } from './provider';
import type { ModelSpec } from './models';
import { toGeminiContents, toGeminiTools, toGeminiToolChoice, fromGeminiResponse } from './adapters';

const DEFAULT_MAX_TOKENS = 4096;

// Explicit context caching for the stable prefix (system prompt + KB + tools).
// That prefix is re-sent every turn, so caching it cuts input cost sharply (cached
// reads bill a fraction; spec §4.2/§4.4). Keyed by a hash of (model + system +
// tools): when the owner edits the KB the hash changes → a fresh cache is created,
// so an edit is live immediately (no stale-cache lag). The store is process-local
// (one container per deploy); ANY cache failure falls back to inline so the live
// agent never breaks. Only generate() caches — transcribe()/extractDimensions()
// send small one-off prompts.
const CACHE_TTL_SECONDS = 3600; // 1h — Telegram replies arrive minutes-to-hours apart
const CACHE_REUSE_BUFFER_MS = 60_000; // stop reusing a cache 1 min before it expires
const cacheStore = new Map<string, { name: string; expiresAt: number }>();

function cachePrefixKey(modelId: string, system: string, tools: unknown): string {
  return createHash('sha256').update(`${modelId}\n${system}\n${JSON.stringify(tools ?? null)}`).digest('hex');
}

const DIMENSIONS_PROMPT = [
  'Read this floor-plan / room sketch and extract EVERY room\'s INNER wall-to-wall dimensions in METERS.',
  'Return ONLY strict JSON, no prose and no code fence:',
  '{"found": boolean, "rooms": [{"widthM": number, "lengthM": number, "label": string}], "confidence": "high"|"low", "note": string}.',
  'Include one entry per distinct room (convert cm/mm to meters if the drawing is labelled in those units).',
  'MULTIPLE rooms are fine — list them all. Set found=true and confidence="high" when you can read at least one',
  'room\'s two inner dimensions clearly. If no dimensions are readable or you are unsure, set found=false,',
  'confidence="low", rooms=[] with a short note. NEVER guess a number you cannot actually read.',
].join(' ');

/** Parse the model's JSON dimension output defensively — any malformed or
 *  incomplete output degrades to a low-confidence not-found so the caller asks
 *  for typed dimensions instead of quoting off a misread (spec §4.5). Rooms with a
 *  missing/invalid dimension are dropped; found requires ≥1 valid room. Pure. */
export function parseDimensions(text: string): ExtractedDimensions {
  const cleaned = text.replace(/```json|```/gi, '').trim();
  try {
    const o = JSON.parse(cleaned) as Record<string, unknown>;
    const note = typeof o.note === 'string' ? o.note : undefined;
    const rawRooms = Array.isArray(o.rooms) ? o.rooms : [];
    const rooms: ExtractedRoom[] = [];
    for (const r of rawRooms) {
      if (!r || typeof r !== 'object') continue;
      const rr = r as Record<string, unknown>;
      const w = typeof rr.widthM === 'number' ? rr.widthM : undefined;
      const l = typeof rr.lengthM === 'number' ? rr.lengthM : undefined;
      if (w == null || l == null || w <= 0 || l <= 0) continue; // drop incomplete rooms
      rooms.push({ widthM: w, lengthM: l, label: typeof rr.label === 'string' && rr.label.trim() ? rr.label.trim() : undefined });
    }
    const found = o.found === true && rooms.length > 0;
    return { found, rooms, confidence: found && o.confidence === 'high' ? 'high' : 'low', note };
  } catch {
    return { found: false, rooms: [], confidence: 'low', note: 'could not parse vision output' };
  }
}

export interface GeminiLike {
  models: { generateContent(req: unknown): Promise<unknown> };
  /** Explicit context caching. Optional — absent in the test fakes and the
   *  vision/STT one-off paths, so generate() simply runs inline when it's missing. */
  caches?: { create(req: unknown): Promise<{ name?: string }> };
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
    const client = this.getClient();
    const tools = req.tools.length ? [toGeminiTools(req.tools)] : undefined;
    const contents = toGeminiContents(req.messages);
    // toolChoice + maxTokens are PER-REQUEST (not cached) — the tool defs and the
    // system prompt are what get cached.
    const baseConfig: Record<string, unknown> = { maxOutputTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS };
    if (req.toolChoice) baseConfig.toolConfig = toGeminiToolChoice(req.toolChoice);

    const cacheName = await this.getOrCreateCache(client, req.system, tools);
    if (cacheName) {
      try {
        const resp = await client.models.generateContent({
          model: this.model.modelId,
          contents,
          config: { ...baseConfig, cachedContent: cacheName },
        });
        return fromGeminiResponse(resp);
      } catch (err) {
        // Stale/evicted cache (or a bad combo) must never lose a reply — drop the
        // cache entry and retry inline below.
        console.warn('[gemini cache] cached generate failed — retrying inline:', err instanceof Error ? err.message : String(err));
        this.dropCache(req.system, tools);
      }
    }

    // Inline (no cache available, create failed, or a cached call failed).
    const config: Record<string, unknown> = { ...baseConfig };
    if (req.system) config.systemInstruction = req.system;
    if (tools) config.tools = tools;
    const resp = await client.models.generateContent({ model: this.model.modelId, contents, config });
    return fromGeminiResponse(resp);
  }

  /** Live cached-content name for the stable prefix, creating one on miss. Returns
   *  null (→ inline) when caching is unavailable, or create fails (min-token
   *  threshold, quota, unsupported model) — a cache problem never breaks a reply. */
  private async getOrCreateCache(client: GeminiLike, system: string, tools: unknown): Promise<string | null> {
    if (!client.caches || !system) return null;
    const key = cachePrefixKey(this.model.modelId, system, tools);
    const now = Date.now();
    const hit = cacheStore.get(key);
    if (hit && hit.expiresAt - CACHE_REUSE_BUFFER_MS > now) return hit.name;
    try {
      const created = await client.caches.create({
        model: this.model.modelId,
        config: { systemInstruction: system, ...(tools ? { tools } : {}), ttl: `${CACHE_TTL_SECONDS}s` },
      });
      if (!created?.name) return null;
      cacheStore.set(key, { name: created.name, expiresAt: now + CACHE_TTL_SECONDS * 1000 });
      return created.name;
    } catch (err) {
      console.warn('[gemini cache] create failed — sending inline:', err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  private dropCache(system: string, tools: unknown): void {
    cacheStore.delete(cachePrefixKey(this.model.modelId, system, tools));
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
