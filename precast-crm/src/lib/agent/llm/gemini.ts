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

// The agent reads customer-sent images to quote a precast floor. These are
// almost never clean CAD exports — they're phone photos of HAND-DRAWN plans or
// handwritten dimension lists, with clutter around the edges and messy digits.
// The prompt is engineered for that reality; a focused retry (below) runs when
// the first pass comes back empty/low-confidence before we ask the customer to type.
const STRICT_JSON_SHAPE =
  '{"found": boolean, "isConstructionImage": boolean, "rooms": [{"widthM": number, "lengthM": number, "label": string}], "confidence": "high"|"low", "note": string}';

const DIMENSIONS_PROMPT = [
  'You are reading an image a construction customer sent to get a precast beam-and-block FLOOR quote.',
  'It may be a hand-drawn floor plan (often several rooms, sketched roughly to imitate a CAD layout), a quick sketch, or simply a handwritten / typed list of room sizes. It is usually a phone photo of a notebook or paper, so expect clutter around the edges (desk, hands, tools, lighting, another page) — IGNORE everything that is not the plan or the dimension numbers.',
  '',
  "Extract EVERY distinct room's INNER wall-to-wall dimensions, in METERS.",
  'Reading rules:',
  '- Each room is two numbers, width then length, e.g. "3,40 × 5,60". Keep the written order (first = widthM, second = lengthM); do NOT reorder.',
  '- The separator may be ×, x, X, *, "·", "/", or the word "на". A decimal point may be written as a COMMA or a DOT — both mean a decimal (3,40 = 3.40). A number written alone on one side (e.g. "5") is a whole-meter value (5.00).',
  '- Values are inner room sizes, almost always in METERS (a real room side is ~1.5–12 m). If a value is clearly centimeters (e.g. 340, 560) divide by 100; if millimeters (e.g. 3400) divide by 1000. Use the plausible-room-size range to decide the unit.',
  '- List EVERY room — there are often many, in rows or scattered across a plan. A heading or word beside a group (e.g. "Zinaga", "zal", "oshxona") is that group\'s label → put it in "label".',
  '- Handwriting is messy: 5/3, 7/1, 4/9, 0/6 are easily confused. Read each digit deliberately. NEVER output a number you cannot actually read — drop that one room instead of guessing.',
  '',
  'Return ONLY strict JSON, no prose, no code fence:',
  STRICT_JSON_SHAPE,
  'Set found=true and confidence="high" ONLY when you have clearly read at least one room\'s BOTH inner dimensions. If nothing is readable or you are unsure, return found=false, confidence="low", rooms=[] and a short English note (for staff) on what blocked the read.',
  'isConstructionImage: true when the image IS construction-related (a floor plan, room sketch, building drawing, a handwritten/typed dimensions list, a slab/site/building photo) — even if unreadable. false when it is clearly something else entirely (people, products, clothing, food, ads, screenshots of shops, memes). This tells the caller whether asking for room dimensions even makes sense.',
].join('\n');

// Second pass — only when the first comes back empty/low-confidence. Pushes the
// model to ignore clutter and transcribe row by row before we give up.
const DIMENSIONS_PROMPT_RETRY = [
  'A first attempt to read room dimensions from this image failed. Look again, much more carefully.',
  'This is very likely a low-quality phone photo of a HAND-DRAWN sketch or a handwritten notebook page, with background clutter (desk, hands, tools, lighting, another page) around the edges. IGNORE all of that — focus only on the handwritten / drawn content.',
  'Scan line by line, top to bottom, for anything shaped like "<number> <separator> <number>" (separator ×, x, X, *, /, "на"). Transcribe each pair EXACTLY as written. A comma is a decimal point (3,40 = 3.40). A lone number on one side is a whole-meter value.',
  'There are usually SEVERAL rooms — capture every readable pair. A heading beside a group (e.g. "Zinaga") is that room\'s label.',
  'Convert to METERS using the plausible-room-size range (~1.5–12 m): a value like 340 is centimeters → 3.40 m.',
  'Still: never invent a digit you genuinely cannot see — omit that room instead.',
  'Return ONLY the same strict JSON, no prose, no code fence:',
  STRICT_JSON_SHAPE,
].join('\n');

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
    return {
      found,
      rooms,
      confidence: found && o.confidence === 'high' ? 'high' : 'low',
      note,
      // Only an explicit false marks the image as non-construction; absent/other
      // values default to plan-like so the ask-for-dimensions fallback (old
      // behavior) is preserved when the model omits the field.
      isPlanLike: o.isConstructionImage === false ? false : true,
    };
  } catch {
    return { found: false, rooms: [], confidence: 'low', note: 'could not parse vision output', isPlanLike: true };
  }
}

/** Pick the better of the primary + retry vision passes: a found read beats
 *  not-found, then high beats low confidence, then more rooms wins. Pure. */
export function betterDimensions(a: ExtractedDimensions, b: ExtractedDimensions): ExtractedDimensions {
  const score = (d: ExtractedDimensions) =>
    (d.found ? 100 : 0) + (d.confidence === 'high' ? 10 : 0) + d.rooms.length;
  return score(b) > score(a) ? b : a;
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

  /** One vision pass with a given prompt. */
  private async readDimensions(image: ImageInput, prompt: string): Promise<ExtractedDimensions> {
    const resp = await this.getClient().models.generateContent({
      model: this.model.modelId,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: image.mimeType, data: image.data } },
          ],
        },
      ],
    });
    return parseDimensions(fromGeminiResponse(resp).text);
  }

  /** Floor-plan dimension reading (spec §4.5). Customer images are usually messy
   *  phone photos of hand-drawn plans, so on an empty/low-confidence first pass we
   *  run ONE focused retry (clutter-ignoring, handwriting-aware) before giving up —
   *  this recovers the common "numbers buried in a cluttered photo" case. The
   *  caller still echoes the dims to the customer to confirm and never quotes off a
   *  misread sketch. */
  async extractDimensions(image: ImageInput): Promise<ExtractedDimensions> {
    const primary = await this.readDimensions(image, DIMENSIONS_PROMPT);
    if (primary.found && primary.confidence === 'high') return primary;
    // Clearly not a construction image (product ad / selfie / meme) → no point
    // re-reading harder; the caller stays silent on it.
    if (primary.isPlanLike === false) return primary;
    const retry = await this.readDimensions(image, DIMENSIONS_PROMPT_RETRY);
    return betterDimensions(primary, retry);
  }
}
