export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail, handler } from "@/lib/api";
import { HANDOFF_ACTION, resolveHandoffCaller } from "@/lib/handoff-caller";
import { findReachableChats } from "@/lib/handoff-reach";
import { dispatchHandoffPresets } from "@/lib/handoff-dispatch";
import { isHandoffPresetKey, type HandoffPresetKey } from "@/lib/handoff-presets";
import { normalizePhone } from "@/lib/phone";

/**
 * Reaching a caller who has written before, without the SMS handshake.
 *
 * `GET  /api/handoff/reach?phone=…` — is there a live Telegram chat for this
 * number, and is the match proven or only likely? See `handoff-reach.ts` for why
 * that distinction carries the whole risk.
 *
 * `POST /api/handoff/reach` — send the presets straight into a chat. This is the
 * "firsthand" path the owner asked for: no SMS, no token, no waiting for the
 * customer to press send. It works only because that customer already opened the
 * conversation at some point; a bot still cannot start one.
 *
 * Both take the same credential as `POST /api/handoff` — the device token or an
 * operator with `inbox.access`.
 */

const SendSchema = z.object({
  conversationId: z.string().min(1),
  presets: z.array(z.string()).min(1),
  /** Echoed back so the app can record which number this chat now answers for. */
  phone: z.string().min(1),
});

export const GET = handler(async (req: NextRequest) => {
  const caller = await resolveHandoffCaller(req);
  if (!caller) return fail("Авторизация талаб қилинади · Authentication required", 401);

  const phone = new URL(req.url).searchParams.get("phone") ?? "";
  if (!phone.trim()) return fail("Телефон рақами керак · phone is required", 400);

  return ok(await findReachableChats(phone));
});

export const POST = handler(async (req: NextRequest) => {
  const caller = await resolveHandoffCaller(req);
  if (!caller) return fail("Авторизация талаб қилинади · Authentication required", 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("Нотўғри сўров · Malformed request body", 400);
  }
  const parsed = SendSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("Чат ва камида битта тавсия керак · conversationId and presets are required", 400);
  }

  const presets: HandoffPresetKey[] = [];
  for (const p of parsed.data.presets) {
    if (!isHandoffPresetKey(p)) return fail("Нотўғри тавсия тури · Unknown preset key", 400);
    if (!presets.includes(p)) presets.push(p);
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: parsed.data.conversationId },
    select: { id: true, businessConnectionId: true },
  });
  if (!conversation) return fail("Чат топилмади · Conversation not found", 404);
  // Without a live connection the send would fail inside the dispatcher and be
  // reported as a skipped preset; refusing here says the real reason instead.
  if (!conversation.businessConnectionId) {
    return fail("Бу чатга ёзиб бўлмайди · This chat has no live connection", 409);
  }

  const result = await dispatchHandoffPresets({
    conversationId: conversation.id,
    presets,
    userId: caller.userId,
  });

  // The operator has just confirmed this chat belongs to this number. Record it,
  // so the next call to the same customer is PROVEN rather than a question — the
  // link is the scarce thing here, and this is the cheapest place to earn one.
  const phone = normalizePhone(parsed.data.phone);
  if (phone && result.sent.length > 0) {
    await prisma.conversation
      .updateMany({
        where: { id: conversation.id, sharedContactPhone: null },
        data: { sharedContactPhone: phone },
      })
      .catch(() => {
        /* the link is an optimisation, never a reason to fail a delivered send */
      });
  }

  // 200 with the per-preset outcome rather than an error on a partial send: the
  // customer really did receive whatever `sent` lists, and the operator needs to
  // know which of the four actually went.
  return ok(result);
});
