/** Shared data shapes for the Inbox screen. */

export interface ConversationSummary {
  id: string; channel?: string; displayName: string; username: string | null;
  lastMessageAt: string; lastSnippet: string; unread: boolean;
  aiState?: string; aiPaused?: boolean;
}

export interface InboxMessage {
  id: string; direction: "INBOUND" | "OUTBOUND"; text: string | null;
  mediaKind: string | null; mediaPath: string | null; mediaName: string | null;
  mediaMeta: Record<string, unknown> | null; failed: boolean; createdAt: string;
  mediaGroupId: string | null;
}

export type RenderItem =
  | { type: "single"; msg: InboxMessage }
  | { type: "album"; groupId: string; direction: "INBOUND" | "OUTBOUND"; items: InboxMessage[] };

export interface AgentProposal {
  id: string;
  inboundMessageId: string;
  decision: "reply" | "escalate" | "request_approval" | "blocked" | "max_turns";
  reply: string | null;
  escalationReason: string | null;
  approvalDraft: {
    quoteId?: string;
    customerName?: string | null;
    customerPhone?: string | null;
    deliveryAddress?: string | null;
    notes?: string | null;
  } | null;
  language: string;
  screen: { verdict?: string } | null;
  escalatedEarly: boolean;
  modelKey: string;
  toolCalls: Array<{ name: string; ok: boolean }> | null;
  usage: { inputTokens?: number; outputTokens?: number } | null;
  turns: number;
  confidence: string | null;
  status: "PENDING" | "SENT" | "EDITED_SENT" | "DISMISSED";
  createdAt: string;
}
