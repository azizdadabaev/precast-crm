export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail, handler } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { verifyDeviceToken } from "@/lib/handoff-auth";
import { isHandoffPresetKey, type HandoffPresetKey } from "@/lib/handoff-presets";
import { expiryFrom, generateToken } from "@/lib/handoff-token";
import { normalizePhone } from "@/lib/phone";

/**
 * Call → Telegram handoff.
 *
 * POST creates the pending follow-up the Android overlay app SMSes to the
 * caller; it authenticates with the narrow device token, NOT a user session.
 * GET is the owner's list of who never replied, behind the normal cookie
 * permission gate. Two different credentials, so they stay two handlers —
 * the POST must never be routed through withPermission.
 *
 * This route only ever CREATES PendingFollowUp rows and cancels the ones it
 * previously created for the same phone. It touches no other table.
 * See docs/superpowers/specs/2026-08-12-call-to-telegram-handoff-design.md §4.3
 */

const HandoffCreateSchema = z.object({
  phone: z.string().min(1),
  presets: z.array(z.string()).min(1),
});

/** A leaked device token must not be able to flood the table. */
const MAX_CREATES_PER_HOUR = 30;
const ONE_HOUR_MS = 60 * 60 * 1000;

/** 32^6 ≈ 1.07e9 combinations, so a second collision is already astronomical. */
const MAX_TOKEN_ATTEMPTS = 5;

/**
 * The SMS body is composed here, not in the app, so the wording can change
 * without shipping a new APK. Uzbek Cyrillic — the customer reads this.
 */
function composeSmsText(token: string, handle: string): string {
  const link = `https://t.me/${handle}?text=${encodeURIComponent(token)}`;
  return `Ассалому алайкум! Сўралган маълумотлар учун: ${link}`;
}

export const POST = handler(async (req: NextRequest) => {
  if (!verifyDeviceToken(req)) {
    return fail("Авторизация талаб қилинади · Authentication required", 401);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("Нотўғри сўров · Malformed request body", 400);
  }

  const parsed = HandoffCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(
      "Телефон рақами ва камида битта тавсия керак · phone and at least one preset are required",
      400,
    );
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) {
    return fail("Телефон рақами нотўғри · Invalid phone number", 400);
  }

  const presets: HandoffPresetKey[] = [];
  for (const p of parsed.data.presets) {
    if (!isHandoffPresetKey(p)) {
      return fail("Нотўғри тавсия тури · Unknown preset key", 400);
    }
    if (!presets.includes(p)) presets.push(p);
  }

  // Rate limit by counting rows rather than holding in-memory state — the
  // server restarts on every deploy and a counter would reset with it.
  const recent = await prisma.pendingFollowUp.count({
    where: { createdAt: { gte: new Date(Date.now() - ONE_HOUR_MS) } },
  });
  if (recent >= MAX_CREATES_PER_HOUR) {
    return fail(
      "Жуда кўп сўров · Too many follow-ups created in the last hour",
      429,
    );
  }

  const handle = (process.env.HANDOFF_TG_HANDLE ?? "").trim().replace(/^@/, "");
  const handleConfigured = handle.length > 0;

  for (let attempt = 0; attempt < MAX_TOKEN_ATTEMPTS; attempt++) {
    const token = generateToken();
    try {
      const row = await prisma.$transaction(async (tx) => {
        // Supersede rule (spec §6): the same number called twice must not leave
        // two live tokens, or one inbound message could consume the wrong one.
        // Scoped to this feature's own PENDING rows for this exact phone.
        await tx.pendingFollowUp.updateMany({
          where: { phone, status: "PENDING" },
          data: { status: "CANCELED" },
        });
        return tx.pendingFollowUp.create({
          data: { token, phone, presets, expiresAt: expiryFrom(new Date()) },
        });
      });

      return ok({
        token: row.token,
        smsText: composeSmsText(row.token, handle),
        expiresAt: row.expiresAt,
        handleConfigured,
      });
    } catch (err) {
      // P2002 = the unique token collided. Anything else is a real failure.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        continue;
      }
      throw err;
    }
  }

  console.error("[handoff] token generation collided %d times", MAX_TOKEN_ATTEMPTS);
  return fail("Токен яратилмади · Could not allocate a token", 500);
});

/** The owner's view of who was sent a link and who never replied. */
export const GET = withPermission("inbox.access", async () => {
  const rows = await prisma.pendingFollowUp.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      token: true,
      phone: true,
      presets: true,
      status: true,
      createdAt: true,
      consumedAt: true,
      expiresAt: true,
      conversationId: true,
    },
  });
  return ok(rows);
});
