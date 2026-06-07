export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { loadAgentRuntimeConfig, saveAgentRuntimeConfig } from "@/lib/agent/runtime-config";
import { bakeOffModels } from "@/lib/agent/llm/models";
import { providerKeyStatus } from "@/lib/agent/provider-keys";

/** Models offered in the conversation-brain dropdown (the bake-off candidates). */
function modelOptions() {
  return bakeOffModels().map((m) => ({
    key: m.key,
    label: m.label,
    provider: m.provider,
    inputPerMTok: m.pricing.inputPerMTok,
    outputPerMTok: m.pricing.outputPerMTok,
    requiresSnapshotPin: m.requiresSnapshotPin ?? false,
  }));
}

/**
 * GET /api/agent/runtime — owner-only (inbox.access). Current config + the
 * model dropdown options. Reuses the inbox owner-gate since the agent is the
 * inbox feature.
 */
export const GET = withPermission("inbox.access", async () => {
  const [config, keyStatus] = await Promise.all([loadAgentRuntimeConfig(), providerKeyStatus()]);
  return ok({ config, models: modelOptions(), keyStatus });
});

/**
 * PUT /api/agent/runtime — owner-only. Persist the kill-switch, mode, and model
 * selection. Validated against the model registry + mode enum.
 */
export const PUT = withPermission("inbox.access", async (req: NextRequest, { user }) => {
  const result = await saveAgentRuntimeConfig(await req.json().catch(() => null));
  if (!result.ok) return fail(result.error, 422);

  recordAudit({
    userId: user.id,
    action: "agent.runtime.update",
    targetType: "appConfig",
    targetId: "agent.runtime",
    message: `AI agent ${result.config.enabled ? "enabled" : "disabled"} · ${result.config.mode} · ${result.config.modelKey}`,
    metadata: { ...result.config },
  });

  return ok({ config: result.config });
});
