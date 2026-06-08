export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { recordAudit } from "@/lib/audit";

const KB_KEY = "agent.knowledge_base";
const Body = z.object({ content: z.string().max(60000) });

interface KbValue {
  content?: string;
  updatedAt?: string;
  updatedBy?: string;
}

/**
 * GET /api/agent/kb — owner-only. The current knowledge-base markdown + when/who
 * last saved it. The agent reads this same AppConfig row live on every turn
 * (loadKnowledgeBase), so an edit is effective immediately in the DB.
 */
export const GET = withPermission("inbox.access", async () => {
  const row = await prisma.appConfig.findUnique({ where: { key: KB_KEY } });
  const v = (row?.value ?? {}) as KbValue;
  return ok({ content: v.content ?? "", updatedAt: v.updatedAt ?? null, updatedBy: v.updatedBy ?? null });
});

/**
 * PUT /api/agent/kb — owner-only (spec §9). Save the KB markdown + stamp
 * updatedAt/updatedBy + an AuditLog row. Preserves the `{ content }` shape
 * loadKnowledgeBase expects. NOTE: with prompt caching (ttl:'1h') an edit reaches
 * a WARM provider cache only after ~1h — the DB is updated immediately, but a
 * cached prefix can serve the old KB for up to an hour (document a manual
 * cache-bust for urgent retractions, spec §9).
 */
export const PUT = withPermission("inbox.access", async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("content is required (max 60000 chars)", 422);

  const value: KbValue = {
    content: parsed.data.content,
    updatedAt: new Date().toISOString(),
    updatedBy: user.name,
  };
  const jsonValue = value as Prisma.InputJsonValue;
  await prisma.appConfig.upsert({
    where: { key: KB_KEY },
    create: { key: KB_KEY, value: jsonValue },
    update: { value: jsonValue },
  });

  recordAudit({
    userId: user.id,
    action: "agent.kb.update",
    targetType: "appConfig",
    targetId: KB_KEY,
    message: `AI knowledge base updated (${parsed.data.content.length} chars)`,
  });

  return ok(value);
});
