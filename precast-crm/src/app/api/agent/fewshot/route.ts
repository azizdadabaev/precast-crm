export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { recordAudit } from "@/lib/audit";

const FEWSHOT_KEY = "agent.few_shot";
const Body = z.object({ content: z.string().max(20000) });

interface DocValue {
  content?: string;
  updatedAt?: string;
  updatedBy?: string;
}

/**
 * GET /api/agent/fewshot — owner-only. The curated few-shot block + last-saved
 * stamp. Injected into the system prompt as a TONE guide (spec §3) — example
 * exchanges only, never a source of facts/prices.
 */
export const GET = withPermission("inbox.access", async () => {
  const row = await prisma.appConfig.findUnique({ where: { key: FEWSHOT_KEY } });
  const v = (row?.value ?? {}) as DocValue;
  return ok({ content: v.content ?? "", updatedAt: v.updatedAt ?? null, updatedBy: v.updatedBy ?? null });
});

/** PUT /api/agent/fewshot — owner-only. Save + stamp + audit. */
export const PUT = withPermission("inbox.access", async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("content is required (max 20000 chars)", 422);

  const value: DocValue = { content: parsed.data.content, updatedAt: new Date().toISOString(), updatedBy: user.name };
  const jsonValue = value as Prisma.InputJsonValue;
  await prisma.appConfig.upsert({
    where: { key: FEWSHOT_KEY },
    create: { key: FEWSHOT_KEY, value: jsonValue },
    update: { value: jsonValue },
  });

  recordAudit({
    userId: user.id,
    action: "agent.fewshot.update",
    targetType: "appConfig",
    targetId: FEWSHOT_KEY,
    message: `AI few-shot examples updated (${parsed.data.content.length} chars)`,
  });

  return ok(value);
});
