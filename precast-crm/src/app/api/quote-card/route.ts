export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { fail, handler } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { QUOTE_CARD_TOKEN } from "@/lib/agent/quote-card";
import { screenshotQuoteCardPath } from "@/lib/agent/quote-card-shot";
import {
  QuoteCardPayloadSchema,
  dropQuoteCardPayload,
  parkQuoteCardPayload,
} from "@/lib/quote-card-payload";

/**
 * `POST /api/quote-card` — the quote card as a PNG, drawn by this server.
 *
 * Exists because the Android calculator was drawing its own copy of the card in
 * Compose. Two renderers means two cards: every change to the web's design left
 * the phone's behind, and a customer could receive two different-looking quotes
 * from the same company. Now the phone sends the figures and this route sends
 * back the same picture the web produces, screenshotted from the same React
 * component.
 *
 * Takes a payload rather than a project id on purpose. Pressing «Юбориш» shows a
 * customer a price; it does not save anything, and it is deliberately usable by
 * an operator who holds `calculator.use` but not `order.create`. Requiring a
 * saved project would have changed both of those.
 *
 * Creates nothing and reads nothing: the payload is parked in this process for
 * the length of one screenshot and dropped immediately after.
 */
export const POST = handler(async (req: NextRequest) => {
  const user = await getCurrentUser();
  if (!user || !user.isActive) {
    return fail("Авторизация талаб қилинади · Authentication required", 401);
  }
  if (!can(user, "calculator.use")) {
    return fail("Рухсат йўқ · Permission denied (calculator.use)", 403);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("Нотўғри сўров · Malformed request body", 400);
  }

  const parsed = QuoteCardPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("Ҳисоб-китоб маълумотлари нотўғри · Invalid quote payload", 400);
  }

  const nonce = parkQuoteCardPayload(parsed.data);
  try {
    const png = await screenshotQuoteCardPath(
      `/internal/quote-card/payload/${nonce}?k=${QUOTE_CARD_TOKEN}`,
    );
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        // Per-request and never re-fetched; the phone shares the bytes it got.
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    // No next/og fallback here, unlike the agent's path. The agent has already
    // sent the customer a price in text and an image is a bonus; here the image
    // IS the answer, and a second, different-looking card would reintroduce the
    // exact drift this route exists to remove. The app falls back to its own
    // card when it cannot reach us at all, which is a different situation.
    console.error("[quote-card] headless render failed:", err instanceof Error ? err.message : String(err));
    return fail("Расмни тайёрлаб бўлмади · Could not render the quote card", 503);
  } finally {
    dropQuoteCardPayload(nonce);
  }
});
