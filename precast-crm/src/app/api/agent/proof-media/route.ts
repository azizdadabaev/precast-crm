export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { loadProofMedia, saveProofMedia, ProofMediaItemSchema } from "@/lib/agent/proof-media";

/**
 * GET /api/agent/proof-media — owner-only. The curated proof-media library
 * (videos/photos the agent sends in the PROOF stage). Includes previewPath for
 * the CRM thumbnail + fileId (owner view only).
 */
export const GET = withPermission("inbox.access", async () => {
  const config = await loadProofMedia();
  return ok(config);
});

// PUT replaces the metadata of the whole library (title/tags/caption/enabled/
// order, and deletions = omitted items). fileId/previewPath are preserved by the
// client from GET. Uploading new media goes through POST .../upload.
const Body = z.object({ items: z.array(ProofMediaItemSchema) });

export const PUT = withPermission("inbox.access", async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("invalid proof-media payload", 422);

  await saveProofMedia({ items: parsed.data.items });
  recordAudit({
    userId: user.id,
    action: "agent.proof_media.update",
    targetType: "appConfig",
    targetId: "agent.proof_media",
    message: `AI proof media updated (${parsed.data.items.length} items)`,
  });
  return ok({ items: parsed.data.items });
});
