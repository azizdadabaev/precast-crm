// Auto mode (spec §14 Stage 3) — the agent auto-sends straightforward replies
// with NO operator click. The hard safety line: ONLY a `reply` decision is
// auto-sent. Everything else routes to a human:
//   - request_approval → a human places the order in /inbox (orders are NEVER
//     auto-placed — the write-action double-gate is permanent, spec §14/§18),
//   - escalate / blocked / max_turns → escalate (PENDING_HUMAN + notify),
//   - a failed auto-send → also routed to a human so the customer isn't left
//     hanging.
// The kill-switch + AI_HANDLING gate (shouldAgentHandle) still apply upstream;
// this only decides what to DO with a generated proposal once the agent ran.

import type { AgentDecision } from './loop';
import type { ShadowOutcome } from './shadow';

export type AutoAction = 'send' | 'human';

/** Pure routing: only a reply auto-sends; everything else needs a human. */
export function autoActionFor(decision: AgentDecision): AutoAction {
  return decision.action === 'reply' ? 'send' : 'human';
}

export interface AutoModeDeps {
  /** Send the auto-reply to the customer. Returns ok + a reason on failure. */
  send: (conversationId: string, text: string) => Promise<{ ok: boolean; reason?: string }>;
  /** Hand the chat to a human (PENDING_HUMAN + paused + notify). */
  routeToHuman: (conversationId: string, reason: string) => Promise<void>;
  /** Mark the persisted proposal as auto-sent. */
  markSent: (inboundMessageId: string) => Promise<void>;
}

/** Why a non-reply decision was handed to a human (operator-facing note). */
function humanReason(decision: AgentDecision): string {
  switch (decision.action) {
    case 'request_approval':
      return "Mijoz buyurtmaga rozi — inboxda ko'rib chiqib joylang · Customer agreed to an order — review & place it.";
    case 'escalate':
    case 'blocked':
      return decision.reason;
    default: // max_turns
      return 'agent reached the turn limit without a reply';
  }
}

/**
 * Apply auto mode to a generated proposal. reply → auto-send (+ mark SENT); any
 * other decision, or a send failure, → route to a human. Returns what it did.
 */
export async function applyAutoMode(
  outcome: ShadowOutcome,
  ctx: { conversationId: string; inboundMessageId: string },
  deps: AutoModeDeps,
): Promise<AutoAction> {
  const decision = outcome.decision;
  if (decision.action === 'reply') {
    const sent = await deps.send(ctx.conversationId, decision.reply);
    if (sent.ok) {
      await deps.markSent(ctx.inboundMessageId);
      return 'send';
    }
    await deps.routeToHuman(ctx.conversationId, `auto-send failed (${sent.reason ?? 'unknown'}) — please reply manually`);
    return 'human';
  }
  await deps.routeToHuman(ctx.conversationId, humanReason(decision));
  return 'human';
}

/** Real escalation: pause the chat for a human and notify the inbox owners. */
export async function routeToHuman(conversationId: string, reason: string): Promise<void> {
  const { prisma } = await import('@/lib/prisma');
  const { emitNotifications, usersWithPermission } = await import('@/lib/notifications');
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { aiState: 'PENDING_HUMAN', aiPaused: true },
  });
  const userIds = await usersWithPermission('inbox.access');
  await emitNotifications({
    type: 'AGENT_ESCALATION',
    userIds,
    title: 'AI agent · diqqat talab qiladi · needs attention',
    body: reason.slice(0, 300),
  });
}

/** Real deps for the webhook: send via the inbox outbound path (system actor),
 *  escalate via routeToHuman, mark the proposal SENT. */
export function defaultAutoModeDeps(): AutoModeDeps {
  return {
    send: async (conversationId, text) => {
      const { sendBusinessReply } = await import('@/lib/inbox-send');
      const r = await sendBusinessReply({ conversationId, text, userId: null });
      return r.ok ? { ok: true } : { ok: false, reason: r.reason };
    },
    routeToHuman,
    markSent: async (inboundMessageId) => {
      const { prisma } = await import('@/lib/prisma');
      await prisma.agentProposal.update({
        where: { inboundMessageId },
        data: { status: 'SENT', actedAt: new Date(), actedById: null },
      });
    },
  };
}
