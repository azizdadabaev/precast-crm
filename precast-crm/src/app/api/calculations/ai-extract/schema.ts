import { z } from "zod";

/**
 * Request body for POST /api/calculations/ai-extract — text OR image (raw
 * base64, no data-URL prefix), like /api/agent/simulate-inbound.
 *
 * Lives in its own module (not route.ts) because Next's App Router forbids
 * non-route exports from a route file — `next build` rejects them.
 */
export const AiExtractBody = z
  .object({
    text: z.string().min(1).max(4000).optional(),
    imageBase64: z.string().max(12_000_000).optional(),
    imageMime: z.string().max(60).optional(),
    imagePath: z.string().max(500).optional(),
  })
  .refine((b) => !!b.text || !!b.imageBase64 || !!b.imagePath, {
    message: "text or image is required",
  });
