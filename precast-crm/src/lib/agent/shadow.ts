// Shadow-mode agent run (spec §14 Stage 1): generate a proposed reply/decision
// and LOG it — send nothing. This is the channel-agnostic orchestrator the
// webhook calls (Plan 08 Task 6) once the kill-switch + per-chat gate pass. It
// chains the pieces built across Plans 05–08: pre-LLM input screen → server-side
// language detection → system prompt + KB → the agent loop (provider + read
// tools) → a structured log entry. Auto-send is a later rollout stage (Plan 09).

import { screenInbound, type ScreenResult } from './inbound-screen';
import { detectLanguage, detectPriceIntent, buildSystemPrompt } from './prompt';
import { runAgentTurn, type AgentDecision, type AgentTurnResult } from './loop';
import type { LlmMessage, LlmProvider, LlmToolChoice } from './llm/provider';
import type { ToolRegistry } from './tools/registry';
import type { AgentToolContext } from './tools/types';

/** A persisted Message row reduced to what history mapping needs. */
export interface HistoryRow {
  direction: 'INBOUND' | 'OUTBOUND';
  text: string | null;
}

/** Map stored messages → agnostic loop history (text turns only; media handling
 *  is a later feature). INBOUND = the customer (user); OUTBOUND = us (assistant). */
export function toLlmHistory(rows: HistoryRow[]): LlmMessage[] {
  const out: LlmMessage[] = [];
  for (const r of rows) {
    const text = r.text?.trim();
    if (!text) continue;
    out.push(r.direction === 'INBOUND' ? { role: 'user', content: text } : { role: 'assistant', content: text });
  }
  return out;
}

export interface ShadowLogEntry {
  conversationId: string;
  language: string;
  screen: ScreenResult['flags'] & { verdict: ScreenResult['verdict'] };
  decision: AgentDecision['action'];
  escalationReason?: string;
  /** Truncated proposed reply (for the log only — never sent in Shadow). */
  replyPreview?: string;
  turns: number;
  toolCalls: Array<{ name: string; ok: boolean }>;
  usage: AgentTurnResult['usage'];
}

export interface ShadowDeps {
  provider: LlmProvider;
  tools: ToolRegistry;
  /** Owner KB markdown (loadKnowledgeBase()). */
  kbContent: string;
  /** Optional owner-provided, native-reviewed few-shot block. */
  fewShot?: string;
  ctx?: AgentToolContext;
  maxTurns?: number;
  maxTokens?: number;
  /** Where the Shadow proposal is logged. Defaults to console (structured). */
  log?: (entry: ShadowLogEntry) => void;
}

export interface ShadowInput {
  conversationId: string;
  /** Prior conversation turns (use toLlmHistory). */
  history: LlmMessage[];
  /** Raw inbound customer text (pre-screen). */
  inboundRaw: string;
}

export interface ShadowOutcome {
  screened: ScreenResult;
  language: string;
  /** True if a suspicious inbound short-circuited to escalation with NO model call. */
  escalatedEarly: boolean;
  decision: AgentDecision;
  result?: AgentTurnResult;
  entry: ShadowLogEntry;
}

const PREVIEW_LEN = 200;

/**
 * Run one inbound message through the agent in Shadow mode. Never sends; returns
 * (and logs) the decision. A suspicious (injection/lure) inbound escalates
 * WITHOUT a paid model call (spec §6.4).
 */
export async function runAgentShadow(input: ShadowInput, deps: ShadowDeps): Promise<ShadowOutcome> {
  const log = deps.log ?? ((e: ShadowLogEntry) => console.info('[agent:shadow]', JSON.stringify(e)));
  const screened = screenInbound(input.inboundRaw);
  const language = detectLanguage(screened.normalized);

  const baseEntry = (
    decision: AgentDecision,
    result?: AgentTurnResult,
  ): ShadowLogEntry => ({
    conversationId: input.conversationId,
    language,
    screen: { ...screened.flags, verdict: screened.verdict },
    decision: decision.action,
    escalationReason: decision.action === 'escalate' ? decision.reason : decision.action === 'blocked' ? decision.reason : undefined,
    replyPreview: decision.action === 'reply' ? decision.reply.slice(0, PREVIEW_LEN) : undefined,
    turns: result?.turns ?? 0,
    toolCalls: result?.toolCalls ?? [],
    usage: result?.usage ?? { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
  });

  // Suspicious inbound → back off without a model call (spec §6.4).
  if (screened.verdict === 'suspicious') {
    const decision: AgentDecision = { action: 'escalate', reason: 'suspicious inbound (injection/lure flagged by input screen)' };
    const entry = baseEntry(decision);
    log(entry);
    return { screened, language, escalatedEarly: true, decision, entry };
  }

  const system = buildSystemPrompt({ kbContent: deps.kbContent, language, fewShot: deps.fewShot });
  const forceFirstTool: LlmToolChoice | undefined = detectPriceIntent(screened.normalized) ? { type: 'required' } : undefined;

  const result = await runAgentTurn(
    { system, history: input.history, inbound: screened.normalized, forceFirstTool },
    { provider: deps.provider, tools: deps.tools, ctx: deps.ctx, maxTurns: deps.maxTurns, maxTokens: deps.maxTokens },
  );

  const entry = baseEntry(result.decision, result);
  log(entry);
  return { screened, language, escalatedEarly: false, decision: result.decision, result, entry };
}
