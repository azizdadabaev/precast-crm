export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ContactExportSchema } from "@/lib/validation";
import { ok, fail, handler } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { formatContactsForExport } from "@/lib/contact-export";

/**
 * POST /api/clients/export
 *
 * Body: { ids: string[] }   selected client IDs (capped at 50)
 *
 * Server enforces the GRANTED-consent gate regardless of what the UI
 * sends — defense in depth so a buggy / malicious caller can't bypass
 * the privacy filter. Returns the formatted text + counts so the dialog
 * can warn when some IDs were dropped.
 *
 * Side effect: writes one ExportEvent row per call for the audit trail.
 * If the JWT's user no longer exists in the DB (stale cookie after a
 * schema reset), we 401 — better to force re-login than to silently
 * lose the audit link.
 */
export const POST = handler(async (req: NextRequest) => {
  const body = ContactExportSchema.parse(await req.json());

  // Resolve actor + verify the row still exists (the JWT outlives the
  // user table on `prisma db push --force-reset`, see cancel-route fix).
  const user = await getCurrentUser();
  if (!user) return fail("Unauthorized", 401);
  const actor = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { id: true },
  });
  if (!actor) {
    return fail("Your session is stale — please log out and log back in.", 401);
  }

  // Load only the consenting clients. We DO load by id with the consent
  // filter rather than loading all and filtering in JS so a request for
  // 50 ids never pulls more than 50 rows.
  const consenting = await prisma.client.findMany({
    where: {
      id: { in: body.ids },
      referenceConsent: "GRANTED",
    },
    select: { id: true, name: true, phone: true, address: true },
  });

  // Preserve the operator's selection ORDER (the table they see), not
  // the DB's row order. We do this by looking up each id in-order.
  const byId = new Map(consenting.map((c) => [c.id, c]));
  const ordered = body.ids
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => !!c);

  const text = formatContactsForExport(ordered);

  // Audit trail — one row per export call.
  await prisma.exportEvent.create({
    data: {
      userId: actor.id,
      clientIds: ordered.map((c) => c.id),
    },
  });

  return ok({
    text,
    exported: ordered.length,
    excluded: body.ids.length - ordered.length,
  });
});
