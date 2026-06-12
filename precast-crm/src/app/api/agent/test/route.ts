export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { loadAgentRuntimeConfig, loadKnowledgeBase, loadFewShot } from "@/lib/agent/runtime-config";
import { getModel } from "@/lib/agent/llm/models";
import { createProvider } from "@/lib/agent/llm/factory";
import { resolveApiKey } from "@/lib/agent/provider-keys";
import { createToolRegistry } from "@/lib/agent/tools/registry";
import { runAgentShadow } from "@/lib/agent/shadow";
import type { LlmMessage } from "@/lib/agent/llm/provider";

const Body = z.object({
  message: z.string().min(1).max(2000),
  modelKey: z.string().optional(),
  // Prior turns so the tester can exercise multi-turn flow (mirrors how the live
  // webhook loads conversation history). Plain text turns only.
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .max(40)
    .optional(),
});

/**
 * POST /api/agent/test — owner-only. Run the FULL agent pipeline (input screen →
 * language detect → system prompt + KB → loop + tools) against a typed message
 * and return the decision/reply + tool calls + token usage. Makes a REAL model
 * call with the resolved provider key. Lets the owner test every model locally
 * without Telegram. Sends nothing; writes nothing.
 */
export const POST = withPermission("inbox.access", async (req: NextRequest) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("message is required", 422);

  const config = await loadAgentRuntimeConfig();
  const key = parsed.data.modelKey ?? config.modelKey;
  const model = getModel(key);
  if (!model) return fail(`Unknown model "${key}"`, 422);

  const apiKey = await resolveApiKey(model.provider);
  if (!apiKey) {
    return fail(`No API key set for ${model.provider}. Add it in the control panel, then retry.`, 400);
  }

  try {
    const startedAt = Date.now();
    const outcome = await runAgentShadow(
      { conversationId: "agent-test", history: (parsed.data.history ?? []) as LlmMessage[], inboundRaw: parsed.data.message },
      {
        provider: createProvider(model, { apiKey }),
        tools: createToolRegistry(),
        kbContent: await loadKnowledgeBase(),
        fewShot: await loadFewShot(),
        startingTier: await (async () => {
          // Same live starting-rate injection the webhook uses, so the test
          // console reproduces real behavior on a bare "narxi qancha?".
          const { loadPricingConfig } = await import("@/lib/pricing-config");
          const t = (await loadPricingConfig()).m2_price_tiers[0];
          return t ? { price: t.price, maxBeamLengthM: t.max_beam_length } : undefined;
        })(),
        log: () => {}, // the response IS the output here
      },
    );
    return ok({
      model: { key: model.key, label: model.label, provider: model.provider },
      language: outcome.language,
      escalatedEarly: outcome.escalatedEarly,
      decision: outcome.decision,
      toolCalls: outcome.result?.toolCalls ?? [],
      usage: outcome.result?.usage ?? null,
      // Server-side wall time for the whole pipeline (model call(s) + tools).
      // Excludes the tunnel/browser hop, so the real number you feel is higher.
      tookMs: Date.now() - startedAt,
      turns: outcome.result?.turns ?? 0,
    });
  } catch (err) {
    // Surface the provider error (bad key, model id, rate limit) to the UI.
    return fail(`Model call failed: ${err instanceof Error ? err.message : String(err)}`, 502);
  }
});
