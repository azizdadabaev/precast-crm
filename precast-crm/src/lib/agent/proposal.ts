// Persist a Shadow run as an AgentProposal (Plan 09 Slice B, Step 1).
//
// Shadow mode generates the reply/decision the agent WOULD send and, until now,
// only console.logged it. This module maps a `ShadowOutcome` to an `agent_proposals`
// row and writes it — the backbone for the inbox ghost-draft, suggest/auto
// rollout, and the provider bake-off. Persisting is NOT sending: it writes only to
// the agent's own log table, never to Message / Order / Telegram.
//
// Same pure-core + thin-injectable-db shell as order-tool.ts: buildProposalRow is
// pure (unit-tested directly), saveAgentProposal is a thin write that lazy-imports
// Prisma so tests run without a database.

import type { AgentDecision } from './loop';
import type { ApprovalDraft } from './loop';
import type { ShadowLogEntry, ShadowOutcome } from './shadow';

/** Identity of the run, supplied by the caller (webhook-entry): the conversation,
 *  the inbound Message.id that triggered it, and the model that produced it. */
export interface ProposalMeta {
  conversationId: string;
  inboundMessageId: string;
  modelKey: string;
}

/** The agent_proposals row (DB-shape, no generated columns). approvalDraft is
 *  OPTIONAL (not `| null`) so it can be OMITTED for non-approval decisions —
 *  Prisma maps an omitted optional `Json?` to SQL NULL without the
 *  Prisma.DbNull/JsonNull dance a literal `null` would require. */
export interface AgentProposalRow {
  conversationId: string;
  inboundMessageId: string;
  language: string;
  decision: AgentDecision['action'];
  reply: string | null;
  escalationReason: string | null;
  approvalDraft?: ApprovalDraft;
  screen: ShadowLogEntry['screen'];
  escalatedEarly: boolean;
  modelKey: string;
  toolCalls: ShadowLogEntry['toolCalls'];
  usage: ShadowLogEntry['usage'];
  turns: number;
  confidence: string | null;
}

/** The human-readable reason for a non-reply decision (null for reply /
 *  request_approval). escalate/blocked carry their own reason; max_turns has none,
 *  so we synthesize one rather than leave the column unexplained. */
function decisionReason(d: AgentDecision): string | null {
  switch (d.action) {
    case 'escalate':
    case 'blocked':
      return d.reason;
    case 'max_turns':
      return 'hit the turn guard without a final reply';
    default:
      return null;
  }
}

/** Pure: ShadowOutcome → the row to persist. Full reply text comes from the
 *  decision (the entry only holds a truncated preview); aggregates (screen, tool
 *  calls, usage, turns) come from the already-computed entry. confidence is null
 *  until the loop surfaces it (deferred). */
export function buildProposalRow(outcome: ShadowOutcome, meta: ProposalMeta): AgentProposalRow {
  const d = outcome.decision;
  const row: AgentProposalRow = {
    conversationId: meta.conversationId,
    inboundMessageId: meta.inboundMessageId,
    language: outcome.language,
    decision: d.action,
    reply: d.action === 'reply' ? d.reply : null,
    escalationReason: decisionReason(d),
    screen: outcome.entry.screen,
    escalatedEarly: outcome.escalatedEarly,
    modelKey: meta.modelKey,
    toolCalls: outcome.entry.toolCalls,
    usage: outcome.entry.usage,
    turns: outcome.entry.turns,
    confidence: null,
  };
  // Keep the proposed order's quote_id + customer details so Slice C can wire
  // proposeOrder without re-running the model.
  if (d.action === 'request_approval') row.approvalDraft = d.draft;
  return row;
}

/** Operator-action status when a Suggest-mode proposal is sent (Plan 09 Slice C):
 *  EDITED_SENT if the final text differs from the agent's proposed reply, else
 *  SENT (sent verbatim). Feeds the Stage-2 "unedited send rate" gate (spec §14). */
export function resolveSentStatus(
  proposedReply: string | null,
  finalText: string,
): 'SENT' | 'EDITED_SENT' {
  return (proposedReply ?? '').trim() === finalText.trim() ? 'SENT' : 'EDITED_SENT';
}

/** A narrow structural subset of PrismaClient — only what saveAgentProposal needs,
 *  so a fake makes the idempotency path testable without a database. */
export interface AgentProposalDb {
  agentProposal: {
    createMany(args: {
      data: AgentProposalRow[];
      skipDuplicates: boolean;
    }): Promise<{ count: number }>;
  };
}

export interface SaveProposalResult {
  /** false when the row already existed (inboundMessageId UNIQUE collision) — a
   *  webhook retry of the same inbound message is a no-op, not a duplicate. */
  created: boolean;
}

/**
 * Thin write: build the row, then insert it idempotently.
 * `createMany({ skipDuplicates: true })` is Postgres ON CONFLICT DO NOTHING on the
 * `inboundMessageId` UNIQUE — at most one proposal per inbound message, so a
 * fire-and-forget webhook retry can never duplicate it (first run wins).
 */
export async function saveAgentProposal(
  outcome: ShadowOutcome,
  meta: ProposalMeta,
  db?: AgentProposalDb,
): Promise<SaveProposalResult> {
  return saveAgentProposalRow(buildProposalRow(outcome, meta), db);
}

/** Thin idempotent insert of a pre-built row — also used by the vision path
 *  (which builds its row directly, not from a ShadowOutcome). */
export async function saveAgentProposalRow(row: AgentProposalRow, db?: AgentProposalDb): Promise<SaveProposalResult> {
  // Lazy import so unit tests that pass a fake `db` never load the Prisma client.
  const client = db ?? ((await import('@/lib/prisma')).prisma as unknown as AgentProposalDb);
  const { count } = await client.agentProposal.createMany({ data: [row], skipDuplicates: true });
  return { created: count === 1 };
}
