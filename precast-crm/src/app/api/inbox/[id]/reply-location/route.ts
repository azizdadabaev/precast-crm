import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { withInboxAccess } from "@/lib/inbox-auth";
import { sendBusinessLocation } from "@/lib/inbox-send";

/**
 * The same bounds `delivery-location`'s schema uses, so a pin that can be saved onto an order is
 * exactly a pin that can be sent to a chat.
 */
const Body = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * POST /api/inbox/[id]/reply-location — inbox.access.
 *
 * Sending a pin to the customer. `sendBusinessLocation` has existed since the AI agent needed to
 * send the yard's address, but it had no HTTP route: the only callers were server-side and they
 * all passed the same fixed COMPANY_LOCATION. An operator on the phone wants to send a delivery
 * point, a meeting place, wherever they happen to be — so the function gets the route it never had
 * rather than the app pasting a maps URL into a text message, which arrives as a link and not as a
 * map the customer can tap.
 */
export const POST = withInboxAccess<{ id: string }>(async (req: NextRequest, { params, user }) => {
  const { lat, lng } = Body.parse(await req.json());

  const res = await sendBusinessLocation({
    conversationId: params.id,
    latitude: lat,
    longitude: lng,
    userId: user.id,
  });
  if (!res.ok) {
    if (res.reason === "NOT_FOUND") return fail("Суҳбат топилмади · Conversation not found", 404);
    if (res.reason === "NO_CONNECTION") {
      return fail("Бизнес уланиш мавжуд эмас · No business connection for this chat", 400);
    }
    return fail("Юборилмади · Send failed", 502, { message: res.message });
  }
  return ok(res.message);
});
