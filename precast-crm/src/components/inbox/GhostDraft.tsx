"use client";

// ── AI agent (Plan 09 Slice B) ─────────────────────────────────────────

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { AlertTriangle, Bot, Check, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentProposal } from "./inbox-types";

const DECISION_STYLE: Record<string, { label: string; cls: string }> = {
  reply: { label: "Жавоб · Reply", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  escalate: { label: "Одамга · Escalate", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  max_turns: { label: "Лимит · Max turns", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  blocked: { label: "Блок · Blocked", cls: "bg-red-500/15 text-red-700 dark:text-red-400" },
  request_approval: { label: "Буюртма · Approval", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
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

  const ds = DECISION_STYLE[proposal.decision] ?? { label: proposal.decision, cls: "bg-muted text-muted-foreground" };
  const body =
    proposal.decision === "reply"
      ? proposal.reply
      : proposal.decision === "request_approval"
        ? `Буюртмани тасдиқлашга таклиф қилади · Proposes an order for approval${proposal.approvalDraft?.customerName ? ` — ${proposal.approvalDraft.customerName}` : ""}`
        : proposal.escalationReason;
  const tools = (proposal.toolCalls ?? []).map((t) => t.name);

  return (
    <div className="shrink-0 border-t border-[color:var(--tg-divider)] bg-[var(--tg-panel)] px-4 pt-2">
      <div className="rounded-xl border border-dashed border-[color:var(--tg-accent)]/50 bg-[color:var(--tg-accent)]/[0.06] p-3">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="flex items-center gap-1 font-semibold text-[var(--tg-accent)]">
            <Bot className="h-3.5 w-3.5" /> AI таклифи · AI proposal
          </span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">{mode === "shadow" ? "shadow · read-only" : mode}</span>
          <span className={cn("rounded-full px-1.5 py-0.5 font-medium", ds.cls)}>{ds.label}</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">{proposal.modelKey}</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">{proposal.language}</span>
          {tools.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">🔧 {tools.join(", ")}</span>
          )}
          {proposal.screen?.verdict === "suspicious" && (
            <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 font-medium text-red-700 dark:text-red-400">
              <AlertTriangle className="h-3 w-3" /> suspicious
            </span>
          )}
        </div>

        {canSend ? (
          <GhostSuggestForm key={proposal.id} conversationId={conversationId} proposalId={proposal.id} reply={proposal.reply ?? ""} />
        ) : canPlaceOrder ? (
          <GhostOrderForm key={proposal.id} conversationId={conversationId} proposalId={proposal.id} draft={proposal.approvalDraft} />
        ) : (
          <>
            <div className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-[1.4] text-[var(--tg-text)]">
              {body || <span className="italic text-muted-foreground">—</span>}
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-[10px] text-[color:var(--tg-text-dim)]">
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
        className="w-full resize-none rounded-lg border border-border bg-[var(--tg-input-bg)] px-3 py-2 text-[14px] text-[var(--tg-text)] outline-none focus:border-[color:var(--tg-accent)]"
      />
      {error && <div className="mt-1 text-[12px] text-destructive">{error}</div>}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={act.isPending || !text.trim()}
          onClick={() => { setError(null); act.mutate({ action: "send", text: text.trim() }); }}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-white transition-colors disabled:opacity-60"
          style={{ background: "var(--tg-accent)" }}
        >
          {act.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {edited ? "Таҳрирлаб юбориш · Send edited" : "Юбориш · Send"}
        </button>
        <button
          type="button"
          disabled={act.isPending}
          onClick={() => { setError(null); act.mutate({ action: "dismiss" }); }}
          className="rounded-lg px-3 py-1.5 text-[13px] text-[color:var(--tg-text-dim)] transition-colors hover:bg-[var(--tg-list-hover)] disabled:opacity-60"
        >
          Рад этиш · Dismiss
        </button>
        <span className="ml-auto text-[10px] text-[color:var(--tg-text-dim)]">текширинг · review before sending</span>
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

  const need = (v: string | null | undefined) => v || <span className="text-destructive">— kerak · needed</span>;
  const missing = !draft?.customerName || !draft?.customerPhone || !draft?.deliveryAddress;

  return (
    <div className="mt-2">
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/[0.06] p-2.5 text-[13px] text-[var(--tg-text)]">
        <div className="mb-1 font-semibold">Buyurtma · Order</div>
        <div>Mijoz · Customer: {need(draft?.customerName)}</div>
        <div>Tel: {need(draft?.customerPhone)}</div>
        <div>Manzil · Address: {need(draft?.deliveryAddress)}</div>
      </div>
      {missing && (
        <div className="mt-1 text-[12px] text-[color:var(--tg-text-dim)]">
          Ism, telefon va manzil yig&apos;ilgach joylash mumkin · collect name, phone and address first
        </div>
      )}
      {error && <div className="mt-1 text-[12px] text-destructive">{error}</div>}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={act.isPending || missing}
          onClick={() => { setError(null); act.mutate("place_order"); }}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-white transition-colors disabled:opacity-60"
          style={{ background: "var(--tg-accent)" }}
        >
          {act.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Tasdiqlab joylash · Place order
        </button>
        <button
          type="button"
          disabled={act.isPending}
          onClick={() => { setError(null); act.mutate("dismiss"); }}
          className="rounded-lg px-3 py-1.5 text-[13px] text-[color:var(--tg-text-dim)] transition-colors hover:bg-[var(--tg-list-hover)] disabled:opacity-60"
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
      className="shrink-0 rounded-md px-2 py-0.5 text-[11px] text-[color:var(--tg-text-dim)] transition-colors hover:bg-[var(--tg-list-hover)] disabled:opacity-60"
    >
      Рад этиш · Dismiss
    </button>
  );
}
