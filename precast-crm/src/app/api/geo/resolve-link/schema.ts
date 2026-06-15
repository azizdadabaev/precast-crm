import { z } from "zod";

/**
 * Request body for POST /api/geo/resolve-link — a single pasted Google Maps URL.
 *
 * Lives in its own module (not route.ts) because Next's App Router forbids
 * non-route exports from a route file — `next build` rejects them.
 */
export const ResolveLinkBody = z.object({
  url: z.string().min(1).max(2000),
});
