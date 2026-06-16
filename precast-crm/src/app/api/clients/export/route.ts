export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ContactExportSchema } from "@/lib/validation";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { formatContactsForExport } from "@/lib/contact-export";

/**
 * POST /api/clients/export
 *
 * Body: { ids: string[] }   selected client IDs (capped at 50)
 *
 * Returns the formatted text + the exported count.
 *
 * Side effect: writes one ExportEvent row per call for the audit trail.
 * If the JWT's user no longer exists in the DB (stale cookie after a
 * schema reset), we 401 — better to force re-login than to silently
 * lose the audit link.
 */
export const POST = withPermission("client.export", async (req: NextRequest, { user }) => {
  const body = ContactExportSchema.parse(await req.json());

  // Load the requested clients. Loading by id (capped at 50) means a
  // request never pulls more than 50 rows.
  const selected = await prisma.client.findMany({
    where: {
      id: { in: body.ids },
    },
    select: { id: true, name: true, phone: true, address: true },
  });

  // Preserve the operator's selection ORDER (the table they see), not
  // the DB's row order. We do this by looking up each id in-order.
  const byId = new Map(selected.map((c) => [c.id, c]));
  const ordered = body.ids
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => !!c);

  const text = formatContactsForExport(ordered);

  // Audit trail — one row per export call.
  await prisma.exportEvent.create({
    data: {
      userId: user.id,
      clientIds: ordered.map((c) => c.id),
    },
  });

  return ok({
    text,
    exported: ordered.length,
  });
});
