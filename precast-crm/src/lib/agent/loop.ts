// The agent loop (spec §4.3 / §6) — a hand-written tool-use loop, provider- and
// channel-agnostic. Per inbound message it: calls the active LlmProvider with
// the read toolset, dispatches tool calls, loops to a 12-turn guard, and returns
// a routed decision (reply / escalate / blocked / max_turns). It does NOT send
// anything — the caller (webhook) decides to send or, in Shadow mode, log only
// (spec §14). The price-integrity guardrails are wired here: a quote tool's
// fresh quote_id gates price-bearing replies via the outbound validator (§6.5).

import type { AgentToolContext } from './tools/types';
import type { ToolRegistry } from './tools/registry';
import { QUOTE_TOOL_NAMES } from './tools/registry';
import type { AgentToolDefinition } from './tools/types';
import type {
  GenerateRequest,
  LlmMessage,
  LlmProvider,
  LlmToolChoice,
  LlmToolResult,
} from './llm/provider';
import { validateOutbound } from './outbound-validator';

/** Terminal tool the model can call to hand off to a human (spec §5). Handled
 *  inline by the loop (no DB) — the caller performs the actual escalation. */
export const ESCALATE_TOOL: AgentToolDefinition = {
  name: 'escalate_to_human',
  description:
    'Hand this conversation to a human. Call this when you are unsure, the request is out of scope ' +
    'or non-standard, the customer is upset or makes any complaint / refund / payment dispute, or a ' +
    'tool you need failed. Provide a short reason.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['reason'],
    properties: { reason: { type: 'string', description: 'Why this needs a human.' } },
  },
};

/** The order details the model gathers to start the write-action flow. The
 *  price comes ONLY from `quoteId` (a get_quote token from this conversation);
 *  draft_order re-verifies it (spec §6.1). */
export interface ApprovalDraft {
  quoteId: string;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  notes: string | null;
}

export type AgentDecision =
  | { action: 'reply'; reply: string }
  | { action: 'escalate'; reason: string }
  | { action: 'request_approval'; draft: ApprovalDraft } // customer agreed → propose an order for staff approval
  | { action: 'blocked'; reason: string } // outbound validator blocked the reply → treat as escalate
  | { action: 'max_turns' }; // hit the turn guard without a final reply → escalate
// Deliberate simplification vs spec §4.2's 3-language structured output: language
// is pinned server-side into the prompt (prompt.ts), so the model returns ONE
// reply in the detected language rather than {message_uz_latin, _cyrillic, _ru}.
// `confidence` is deferred (Plan 09). request_approval is TERMINAL here — the
// caller (Plan 08 Task 5) runs draft_order + posts the staff Action Card.

const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

function toApprovalDraft(input: Record<string, unknown>): ApprovalDraft {
  return {
    quoteId: typeof input.quote_id === 'string' ? input.quote_id : '',
    customerName: strOrNull(input.customer_name),
    customerPhone: strOrNull(input.customer_phone),
    deliveryAddress: strOrNull(input.delivery_address),
    notes: strOrNull(input.notes),
  };
}

/** Terminal tool: the model calls this once the customer has confirmed the room
 *  dimensions AND agreed to order (spec §6.3). Carries the quote_id + customer
 *  details; the caller writes the PendingOrder and posts the staff card. */
export const REQUEST_APPROVAL_TOOL: AgentToolDefinition = {
  name: 'request_approval',
  description:
    'Start an order for staff approval. Call this ONLY after the customer has (a) confirmed the exact ' +
    'room dimensions you quoted AND (b) clearly agreed to place the order. Provide the quote_id from a ' +
    'get_quote call in THIS conversation plus the customer name, phone, and delivery address. Do not ' +
    'call it speculatively — if the customer is still deciding, keep answering instead.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['quote_id', 'customer_name', 'customer_phone', 'delivery_address'],
    properties: {
      quote_id: { type: 'string', description: 'The signed quote_id the customer agreed to.' },
      customer_name: { type: 'string' },
      customer_phone: { type: 'string' },
      delivery_address: { type: 'string' },
      notes: { type: 'string', description: 'Optional order notes.' },
    },
  },
};

export interface AgentTurnInput {
  /** Cached system prompt (from prompt.ts). */
  system: string;
  /** Prior conversation turns. */
  history: LlmMessage[];
  /** The inbound customer text. PRECONDITION: the caller (webhook, Plan 08
   *  Task 6) has already run the Plan 05 input-screen (normalize / length cap /
   *  injection flags) + rate limits — the loop does not re-screen. */
  inbound: string;
  /** Force a tool on the FIRST model call (spec §4.2 — price-intent turns). The
   *  caller maps intent → choice (e.g. {type:'tool',name:'get_quote'} for slab,
   *  or {type:'required'} to let the model pick the right quote tool). */
  forceFirstTool?: LlmToolChoice;
}

export interface AgentTurnDeps {
  provider: LlmProvider;
  tools: ToolRegistry;
  /** Tool execution context (sharedContactPhone, clock). */
  ctx?: AgentToolContext;
  /** Turn guard (spec §4.3). Default 12. */
  maxTurns?: number;
  /** Per-call output cap. */
  maxTokens?: number;
  /** Published starting rate (lowest m² tier, UZS) — the ONE price the outbound
   *  validator allows without a fresh quote_id (the "dan boshlanadi" answer). */
  startingTierPrice?: number;
}

export interface AgentTurnResult {
  decision: AgentDecision;
  /** Number of model calls made. */
  turns: number;
  toolCalls: Array<{ name: string; ok: boolean }>;
  /** A fresh, signed quote_id was minted this run (gates price replies). */
  freshQuote: boolean;
  usage: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number };
  /** The full message list after the run (for persistence / Shadow logging).
   *  Only a `reply` decision yields a resumable transcript; `escalate` ends on an
   *  assistant `tool_use` with no matching `tool_result`, so do NOT re-feed the
   *  messages from a non-reply decision to a provider. */
  messages: LlmMessage[];
}

export async function runAgentTurn(
  input: AgentTurnInput,
  deps: AgentTurnDeps,
): Promise<AgentTurnResult> {
  const maxTurns = deps.maxTurns ?? 12;
  const definitions = [...deps.tools.definitions(), ESCALATE_TOOL, REQUEST_APPROVAL_TOOL];
  const messages: LlmMessage[] = [...input.history, { role: 'user', content: input.inbound }];
  const toolCalls: Array<{ name: string; ok: boolean }> = [];
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };
  let freshQuote = false;
  let turns = 0;

  const done = (decision: AgentDecision): AgentTurnResult => ({
    decision,
    turns,
    toolCalls,
    freshQuote,
    usage,
    messages,
  });

  for (let turn = 1; turn <= maxTurns; turn++) {
    turns = turn;
    const toolChoice: LlmToolChoice =
      turn === 1 && input.forceFirstTool ? input.forceFirstTool : { type: 'auto' };

    const req: GenerateRequest = {
      system: input.system,
      messages,
      tools: definitions,
      toolChoice,
      maxTokens: deps.maxTokens,
    };
    const res = await deps.provider.generate(req);

    usage.inputTokens += res.usage?.inputTokens ?? 0;
    usage.outputTokens += res.usage?.outputTokens ?? 0;
    usage.cacheReadInputTokens += res.usage?.cacheReadInputTokens ?? 0;
    usage.cacheCreationInputTokens += res.usage?.cacheCreationInputTokens ?? 0;

    // DEFERRED (spec §4.3 rolling key-facts summary from ~turn 10) → Plan 09:
    // inject a synthesized name/dims/agreed-price/quote_id note here once
    // multi-turn degradation is measured. The 12-turn guard bounds it for now.

    messages.push({
      role: 'assistant',
      content: res.text,
      ...(res.toolCalls.length ? { toolCalls: res.toolCalls } : {}),
    });

    // No tool calls → this is the final reply. Validate before returning it.
    if (res.toolCalls.length === 0) {
      const reply = res.text.trim();
      const verdict = validateOutbound(reply, { hasFreshQuote: freshQuote, startingTierPrice: deps.startingTierPrice });
      return verdict.ok ? done({ action: 'reply', reply }) : done({ action: 'blocked', reason: verdict.reason });
    }

    // Terminal tools end the run deterministically — wherever they sit among the
    // calls, no read tools run (order-independent). Escalate wins over approval.
    const escalateCall = res.toolCalls.find((c) => c.name === ESCALATE_TOOL.name);
    if (escalateCall) {
      const reason = typeof escalateCall.input?.reason === 'string' ? escalateCall.input.reason : 'agent requested escalation';
      return done({ action: 'escalate', reason });
    }
    const approvalCall = res.toolCalls.find((c) => c.name === REQUEST_APPROVAL_TOOL.name);
    if (approvalCall) {
      return done({ action: 'request_approval', draft: toApprovalDraft(approvalCall.input) });
    }

    // Dispatch every (non-terminal) tool call; feed all results back as one turn.
    const results: LlmToolResult[] = [];
    for (const call of res.toolCalls) {
      const out = await deps.tools.execute(call.name, call.input, deps.ctx);
      toolCalls.push({ name: call.name, ok: out.ok });
      if (out.ok && QUOTE_TOOL_NAMES.has(call.name)) freshQuote = true;
      results.push({
        type: 'tool_result',
        toolUseId: call.id,
        name: call.name,
        content: JSON.stringify(out),
        isError: !out.ok,
      });
    }
    messages.push({ role: 'user', content: results });
  }

  // Exhausted the turn guard without a final reply → escalate.
  return done({ action: 'max_turns' });
}
