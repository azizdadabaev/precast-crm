export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { fail, handler } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { QUOTE_CARD_TOKEN } from "@/lib/agent/quote-card";
import { screenshotQuoteCardPath } from "@/lib/agent/quote-card-shot";

/**
 * `GET /api/orders/{id}/share-card` — the order's share card as a PNG, drawn here.
 *
 * The Android order screen's «Юбориш (расм)» used to compose its own card in
 * Compose. It drifted from the web's, which is what the owner kept seeing: a plain
 * summary where the web sends the full table with the load list and the weight.
 *
 * Takes an ID and nothing else. For an order the server already holds every figure,
 * so there is no payload to disagree with the CRM — unlike the calculator's route,
 * which must accept one because the quote it draws has not been saved.
 *
 * No fallback render: a second, differently-drawn card is the exact thing this
 * removes. The app falls back to its own only when it cannot reach us at all.
 */
export const GET = handler(async (_req: NextRequest, ctx: { params: { id: string } }) => {
  const user = await getCurrentUser();
  if (!user || !user.isActive) {
    return fail("Авторизация талаб қилинади · Authentication required", 401);
  }
  if (!can(user, "order.view")) {
    return fail("Рухсат йўқ · Permission denied (order.view)", 403);
  }

  try {
    const png = await screenshotQuoteCardPath(
      `/internal/quote-card/order/${ctx.params.id}?k=${QUOTE_CARD_TOKEN}`,
    );
    return new Response(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[order share-card] render failed:", err instanceof Error ? err.message : String(err));
    return fail("Расмни тайёрлаб бўлмади · Could not render the card", 503);
  }
});
