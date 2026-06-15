export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { extractDimensionsFromText } from "@/lib/agent/extract-dimensions-text";
import { createProviderForModelKey, createVisionProvider } from "@/lib/agent/llm/factory";
import { loadAgentRuntimeConfig } from "@/lib/agent/runtime-config";
import { resolveApiKey } from "@/lib/agent/provider-keys";
import { looksLikeImage, MAX_IMAGE_SIZE_BYTES } from "@/lib/uploads";
import { RateLimiter } from "@/lib/agent/rate-limiter";
import type { ExtractedDimensions } from "@/lib/agent/llm/provider";
import { AiExtractBody } from "./schema";

// Module-level limiter (per server instance). Conservative caps just to stop a
// stuck loop running up model cost; a later plan swaps in a shared store.
const limiter = new RateLimiter({
  perMinute: 12,
  perHour: 120,
  userDailyTokens: 300_000,
  globalDailyTokens: 3_000_000,
});
const EST_TOKENS = 2000; // rough per-call estimate for the budget gate

/**
 * POST /api/calculations/ai-extract — calculator.aiAssist. Turn pasted text or a
 * room image into { rooms, confidence, note } for the calculator to price. Does
 * NOT price, persist, or send anything. Text → conversation model; image → the
 * existing Gemini vision reader.
 */
export const POST = withPermission("calculator.aiAssist", async (req: NextRequest, { user }) => {
  const parsed = AiExtractBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("text or image is required", 422);
  const { text, imageBase64, imageMime } = parsed.data;

  const gate = limiter.check(user.id, EST_TOKENS);
  if (!gate.allowed) {
    return fail(`Бир оздан кейин қайта уриниб кўринг · Try again shortly (${gate.reason})`, 429);
  }

  let dims: ExtractedDimensions;

  if (imageBase64) {
    const buf = Buffer.from(imageBase64, "base64");
    if (!looksLikeImage(buf)) return fail("not a valid JPG/PNG/WEBP image", 422);
    if (buf.length > MAX_IMAGE_SIZE_BYTES) return fail("image too large (max 8 MB)", 413);
    const apiKey = await resolveApiKey("google");
    const vision = createVisionProvider({ apiKey });
    dims = await vision.extractDimensions!({ data: imageBase64, mimeType: imageMime || "image/jpeg" });
    // The vision reader doesn't surface token usage, so record the flat
    // estimate — keeps image calls visible to the daily token budget.
    limiter.record(user.id, EST_TOKENS);
  } else {
    const config = await loadAgentRuntimeConfig();
    const provider = await createProviderForModelKey(config.modelKey);
    const out = await extractDimensionsFromText(text!, provider);
    dims = out.dims;
    limiter.record(user.id, (out.usage?.inputTokens ?? 0) + (out.usage?.outputTokens ?? 0));
  }

  return ok({
    rooms: dims.rooms,
    confidence: dims.confidence,
    note: dims.note,
    isPlanLike: dims.isPlanLike,
  });
});
