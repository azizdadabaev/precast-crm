"use client";

// ── AI agent (Plan 09 Slice B) ─────────────────────────────────────────

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { AlertTriangle, Bot, Check, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentProposal } from "./inbox-types";

// Status badges: 4px radius, 4px/8px padding. Colour is functional — systemOrange
// marks the ones waiting on a human, red marks a block; a plain reply is
// neutral, since nothing about it is resolved yet.
const BADGE = "rounded-[var(--inbox-r-badge)] px-2 py-1 text-[11px] leading-[1.4]";
const NEEDS_HUMAN =
  "bg-[var(--inbox-warn-wash)] text-[color:var(--inbox-warn-text)]";
const DECISION_STYLE: Record<string, { label: string; cls: string }> = {
  reply: { label: "Жавоб · Reply", cls: "bg-[var(--inbox-surface-2)] text-[color:var(--inbox-ink)]" },
  escalate: { label: "Одамга · Escalate", cls: NEEDS_HUMAN },
  max_turns: { label: "Лимит · Max turns", cls: NEEDS_HUMAN },
  blocked: { label: "Блок · Blocked", cls: "bg-[var(--inbox-surface-2)] text-[color:var(--inbox-alert)]" },
  request_approval: { label: "Буюртма · Approval", cls: NEEDS_HUMAN },
};

// The agent's latest PENDING proposal for this chat. Read-only in Shadow; in
// Suggest mode a reply becomes an editable box with Send / Dismiss (Slice C).
// Once acted (sent/dismissed) the proposal is no longer PENDING, so it disappears
// — the sent message then lives in the thread.
export function GhostDraft({ conversationId }: { conversationId: string }) {
  const { data: proposal } = useQuery({
    queryKey: ["agent-proposal", conversationId],
    queryFn: () => api<AgentProposal | null>(`/api/agent/proposals?conversationId=${conversationId}`),
    refetchInterval: 15_000,
  });
  const { data: runtime } = useQuery({
    queryKey: ["agent-runtime"],
    queryFn: () => api<{ config: { mode: string } }>("/api/agent/runtime"),
    staleTime: 30_000,
  });
  if (!proposal || proposal.status !== "PENDING") return null;

  const mode = runtime?.config?.mode ?? "shadow";
  const suggest = mode === "suggest";
  const canSend = suggest && proposal.decision === "reply" && !!proposal.reply;
  // Orders are operator-placed in suggest AND auto (auto never auto-places an order).
  const canPlaceOrder = (suggest || mode === "auto") && proposal.decision === "request_approval";

  const ds = DECISION_STYLE[proposal.decision] ?? {
    label: proposal.decision,
    cls: "bg-[var(--inbox-surface-2)] text-[color:var(--inbox-steel)]",
  };
  const body =
    proposal.decision === "reply"
      ? proposal.reply
      : proposal.decision === "request_approval"
        ? `Буюртмани тасдиқлашга таклиф қилади · Proposes an order for approval${proposal.approvalDraft?.customerName ? ` — ${proposal.approvalDraft.customerName}` : ""}`
        : proposal.escalationReason;
  const tools = (proposal.toolCalls ?? []).map((t) => t.name);

  return (
    <div className="shrink-0 border-t border-[color:var(--inbox-border)] bg-[var(--inbox-panel)] px-4 pt-2">
      {/* Dashed edge = a draft, not a sent message. */}
      <div className="rounded-[var(--inbox-r-card)] border border-dashed border-[color:var(--inbox-silver)] bg-[var(--inbox-surface-2)] p-4">
        <div className="flex flex-wrap items-center gap-2 text-[11px] leading-[1.4]">
          <span className="flex items-center gap-1 font-medium text-[var(--inbox-ink)]">
            <Bot className="h-4 w-4" /> AI таклифи · AI proposal
          </span>
          <span className={cn(BADGE, "bg-[var(--inbox-panel)] text-[color:var(--inbox-steel)]")}>{mode === "shadow" ? "shadow · read-only" : mode}</span>
          <span className={cn(BADGE, "font-medium", ds.cls)}>{ds.label}</span>
          <span className={cn(BADGE, "bg-[var(--inbox-panel)] text-[color:var(--inbox-steel)]")}>{proposal.modelKey}</span>
          <span className={cn(BADGE, "bg-[var(--inbox-panel)] text-[color:var(--inbox-steel)]")}>{proposal.language}</span>
          {tools.length > 0 && (
            <span className={cn(BADGE, "bg-[var(--inbox-panel)] text-[color:var(--inbox-steel)]")}>🔧 {tools.join(", ")}</span>
          )}
          {proposal.screen?.verdict === "suspicious" && (
            <span className={cn(BADGE, "flex items-center gap-1 bg-[var(--inbox-panel)] font-medium text-[color:var(--inbox-alert)]")}>
              <AlertTriangle className="h-3.5 w-3.5" /> suspicious
            </span>
          )}
        </div>

        {canSend ? (
          <GhostSuggestForm key={proposal.id} conversationId={conversationId} proposalId={proposal.id} reply={proposal.reply ?? ""} />
        ) : canPlaceOrder ? (
          <GhostOrderForm key={proposal.id} conversationId={conversationId} proposalId={proposal.id} draft={proposal.approvalDraft} />
        ) : (
          <>
            <div className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-[1.56] text-[var(--inbox-ink)]">
              {body || <span className="italic text-[color:var(--inbox-silver)]">—</span>}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] leading-[1.4] text-[color:var(--inbox-steel)]">
                {proposal.turns} turn(s)
                {proposal.usage?.inputTokens != null && ` · ${proposal.usage.inputTokens}+${proposal.usage.outputTokens ?? 0} tok`}
                {mode === "shadow" && " · юборилмади · not sent"}
              </span>
              {/* Let the operator clear a non-actionable card (escalate / blocked /
                  max_turns) in any active mode — without this, an auto-mode
                  escalation has no way to be dismissed. */}
              {mode !== "shadow" && <GhostDismiss conversationId={conversationId} proposalId={proposal.id} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Suggest mode: editable reply + Send / Dismiss. Keyed by proposal.id so a new
// proposal resets the edit box. Send goes through /act → the inbox outbound path.
function GhostSuggestForm({ conversationId, proposalId, reply }: { conversationId: string; proposalId: string; reply: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState(reply);
  const [error, setError] = useState<string | null>(null);

  const act = useMutation({
    mutationFn: (vars: { action: "send" | "dismiss"; text?: string }) =>
      api(`/api/agent/proposals/${proposalId}/act`, { method: "POST", json: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-proposal", conversationId] });
      qc.invalidateQueries({ queryKey: ["inbox-thread", conversationId] });
      qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const edited = text.trim() !== reply.trim();
  return (
    <div className="mt-2">
      <textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full resize-none rounded-[var(--inbox-r-input)] border border-[color:var(--inbox-border)] bg-[var(--inbox-input-bg)] px-3 py-2 text-[15px] text-[var(--inbox-ink)] outline-none transition-colors focus:border-[color:var(--inbox-focus-ring)]"
      />
      {error && <div className="mt-1 text-[11px] leading-[1.4] text-[color:var(--inbox-alert)]">{error}</div>}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={act.isPending || !text.trim()}
          onClick={() => { setError(null); act.mutate({ action: "send", text: text.trim() }); }}
          className="flex items-center gap-1.5 rounded-[var(--inbox-r-pill)] px-3 py-1.5 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ background: "var(--inbox-accent)", color: "var(--inbox-accent-contrast)" }}
        >
          {act.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {edited ? "Таҳрирлаб юбориш · Send edited" : "Юбориш · Send"}
        </button>
        <button
          type="button"
          disabled={act.isPending}
          onClick={() => { setError(null); act.mutate({ action: "dismiss" }); }}
          className="rounded-[var(--inbox-r-pill)] px-3 py-1.5 text-[13px] text-[color:var(--inbox-steel)] transition-colors hover:bg-[var(--inbox-hover)] disabled:opacity-60"
        >
          Рад этиш · Dismiss
        </button>
        <span className="ml-auto text-[11px] leading-[1.4] text-[color:var(--inbox-silver)]">текширинг · review before sending</span>
      </div>
    </div>
  );
}

// Suggest mode, request_approval: review the order + Place / Reject. Place commits
// a real Order under the operator (decision c) and auto-confirms the customer.
function GhostOrderForm({
  conversationId,
  proposalId,
  draft,
}: {
  conversationId: string;
  proposalId: string;
  draft: AgentProposal["approvalDraft"];
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const act = useMutation({
    mutationFn: (action: "place_order" | "dismiss") =>
      api(`/api/agent/proposals/${proposalId}/act`, { method: "POST", json: { action } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-proposal", conversationId] });
      qc.invalidateQueries({ queryKey: ["inbox-thread", conversationId] });
      qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const need = (v: string | null | undefined) => v || <span className="text-[color:var(--inbox-alert)]">— kerak · needed</span>;
  const missing = !draft?.customerName || !draft?.customerPhone || !draft?.deliveryAddress;

  return (
    <div className="mt-2">
      <div className="rounded-[var(--inbox-r-card)] border border-[color:var(--inbox-border)] bg-[var(--inbox-panel)] p-4 text-[13px] leading-[1.4] text-[var(--inbox-ink)]">
        <div className="mb-2 font-medium">Buyurtma · Order</div>
        <div>Mijoz · Customer: {need(draft?.customerName)}</div>
        <div>Tel: {need(draft?.customerPhone)}</div>
        <div>Manzil · Address: {need(draft?.deliveryAddress)}</div>
      </div>
      {missing && (
        <div className="mt-1 text-[11px] leading-[1.4] text-[color:var(--inbox-steel)]">
          Ism, telefon va manzil yig&apos;ilgach joylash mumkin · collect name, phone and address first
        </div>
      )}
      {error && <div className="mt-1 text-[11px] leading-[1.4] text-[color:var(--inbox-alert)]">{error}</div>}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={act.isPending || missing}
          onClick={() => { setError(null); act.mutate("place_order"); }}
          className="flex items-center gap-1.5 rounded-[var(--inbox-r-pill)] px-3 py-1.5 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ background: "var(--inbox-accent)", color: "var(--inbox-accent-contrast)" }}
        >
          {act.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Tasdiqlab joylash · Place order
        </button>
        <button
          type="button"
          disabled={act.isPending}
          onClick={() => { setError(null); act.mutate("dismiss"); }}
          className="rounded-[var(--inbox-r-pill)] px-3 py-1.5 text-[13px] text-[color:var(--inbox-steel)] transition-colors hover:bg-[var(--inbox-hover)] disabled:opacity-60"
        >
          Рад этиш · Reject
        </button>
      </div>
    </div>
  );
}

// Dismiss a non-reply proposal (escalate / approval) in Suggest mode.
function GhostDismiss({ conversationId, proposalId }: { conversationId: string; proposalId: string }) {
  const qc = useQueryClient();
  const act = useMutation({
    mutationFn: () => api(`/api/agent/proposals/${proposalId}/act`, { method: "POST", json: { action: "dismiss" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-proposal", conversationId] }),
  });
  return (
    <button
      type="button"
      disabled={act.isPending}
      onClick={() => act.mutate()}
      className="shrink-0 rounded-[var(--inbox-r-pill)] px-2 py-0.5 text-[11px] leading-[1.4] text-[color:var(--inbox-steel)] transition-colors hover:bg-[var(--inbox-hover)] disabled:opacity-60"
    >
      Рад этиш · Dismiss
    </button>
  );
}
