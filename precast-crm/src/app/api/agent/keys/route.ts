export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { saveProviderKeys, providerKeyStatus } from "@/lib/agent/provider-keys";

// GET — set/not-set status only (never the key values).
export const GET = withPermission("inbox.access", async () => {
  return ok({ keyStatus: await providerKeyStatus() });
});

// Blank/omitted field = leave that key unchanged (write-only edit).
const Body = z.object({
  anthropic: z.string().optional(),
  google: z.string().optional(),
  openai: z.string().optional(),
});

// PUT — save provider API keys (owner-only). Values are stored, never echoed.
export const PUT = withPermission("inbox.access", async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("invalid body", 422);

  await saveProviderKeys(parsed.data);
  const keyStatus = await providerKeyStatus();

  recordAudit({
    userId: user.id,
    action: "agent.keys.update",
    targetType: "appConfig",
    targetId: "agent.provider_keys",
    // Audit which providers now have a key — never the values.
    message: `AI provider keys updated · set: ${Object.entries(keyStatus).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"}`,
  });

  return ok({ keyStatus });
});
