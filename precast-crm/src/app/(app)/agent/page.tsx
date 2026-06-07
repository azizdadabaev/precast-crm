"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, Save, KeyRound, FlaskConical } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";

type ProviderName = "anthropic" | "google" | "openai";

type Mode = "shadow" | "suggest" | "auto";

interface ModelOption {
  key: string;
  label: string;
  provider: string;
  inputPerMTok: number;
  outputPerMTok: number;
  requiresSnapshotPin: boolean;
}
interface RuntimeConfig {
  enabled: boolean;
  mode: Mode;
  modelKey: string;
}
interface RuntimeResponse {
  config: RuntimeConfig;
  models: ModelOption[];
  keyStatus: Record<ProviderName, boolean>;
}

interface TestResult {
  model: { label: string; provider: string };
  language: string;
  escalatedEarly: boolean;
  decision: { action: string; reply?: string; reason?: string };
  toolCalls: Array<{ name: string; ok: boolean }>;
  usage: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number } | null;
}

export default function AgentPage() {
  const t = useT();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<RuntimeResponse>({
    queryKey: ["agent-runtime"],
    queryFn: () => api("/api/agent/runtime"),
  });

  const [draft, setDraft] = useState<RuntimeConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) setDraft(data.config);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("no draft");
      const res = await fetch("/api/agent/runtime", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save");
      return json;
    },
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["agent-runtime"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  // ── Provider API keys (write-only entry) ──
  const [keyInput, setKeyInput] = useState<Record<ProviderName, string>>({ anthropic: "", google: "", openai: "" });
  const saveKeys = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = {};
      for (const p of ["anthropic", "google", "openai"] as const) if (keyInput[p].trim()) body[p] = keyInput[p].trim();
      const res = await fetch("/api/agent/keys", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save keys");
      return json;
    },
    onSuccess: () => {
      setKeyInput({ anthropic: "", google: "", openai: "" });
      qc.invalidateQueries({ queryKey: ["agent-runtime"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  // ── Test the agent (real, multi-turn model call) ──
  const [testMsg, setTestMsg] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  // The running conversation = model history. Only completed (user → reply) turns
  // are kept, so roles always alternate (mirrors the live webhook's history load).
  const [chat, setChat] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const runTest = useMutation({
    mutationFn: async () => {
      const sent = testMsg.trim();
      const res = await fetch("/api/agent/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: sent, modelKey: draft?.modelKey, history: chat }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Test failed");
      return { r: json.data as TestResult, sent };
    },
    onSuccess: ({ r, sent }) => {
      setTestResult(r);
      // Append the turn pair only when the agent actually replied, keeping the
      // history alternating; escalate/blocked just show in the meta box.
      if (r.decision.reply) {
        setChat((prev) => [...prev, { role: "user", content: sent }, { role: "assistant", content: r.decision.reply! }]);
      }
      setTestMsg("");
    },
    onError: (e: Error) => setTestResult({ model: { label: "—", provider: "—" }, language: "", escalatedEarly: false, decision: { action: "error", reason: e.message }, toolCalls: [], usage: null }),
  });

  if (isLoading || !data || !draft) {
    return <div className="p-6 text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>;
  }

  const isDirty =
    draft.enabled !== data.config.enabled ||
    draft.mode !== data.config.mode ||
    draft.modelKey !== data.config.modelKey;

  const selectedModel = data.models.find((m) => m.key === draft.modelKey);

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="h-6 w-6 text-muted-foreground" />
            AI Агент
            <span className="lang-en text-muted-foreground font-normal text-base"> · AI agent</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "Telegram сотув агенти бошқаруви. Ўчирилган бўлса, ҳеч қандай модель чақирилмайди.",
              "Telegram sales-agent controls. When off, no model is called.",
            )}
          </p>
        </div>
        <Button disabled={!isDirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {t("Сақлаш", "Save")}
        </Button>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* Kill switch */}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">{t("Ҳолат", "Status")}</div>
            <div className="text-xs text-muted-foreground">
              {t("Глобал ёқиш/ўчириш тугмаси", "Global kill-switch")}
            </div>
          </div>
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setDraft({ ...draft, enabled: false })}
              className={`px-4 py-1.5 text-sm font-medium ${!draft.enabled ? "bg-destructive text-destructive-foreground" : "bg-card text-muted-foreground"}`}
            >
              {t("Ўчиқ", "Off")}
            </button>
            <button
              type="button"
              onClick={() => setDraft({ ...draft, enabled: true })}
              className={`px-4 py-1.5 text-sm font-medium ${draft.enabled ? "bg-green-600 text-white" : "bg-card text-muted-foreground"}`}
            >
              {t("Ёқилган", "On")}
            </button>
          </div>
        </div>
      </section>

      {/* Model */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-2">
        <div className="text-sm font-semibold">{t("Модель", "Model")}</div>
        <select
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={draft.modelKey}
          onChange={(e) => setDraft({ ...draft, modelKey: e.target.value })}
        >
          {data.models.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label} · {m.provider} · ${m.inputPerMTok}/${m.outputPerMTok} per MTok
            </option>
          ))}
        </select>
        {selectedModel?.requiresSnapshotPin && (
          <div className="text-xs text-amber-600">
            ⚠️ {t(
              "Шадоудан олдин аниқ снапшот версиясини белгиланг.",
              "Pin a dated snapshot of this model before going wide.",
            )}
          </div>
        )}
      </section>

      {/* Mode */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-2">
        <div className="text-sm font-semibold">{t("Режим", "Mode")}</div>
        <select
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={draft.mode}
          onChange={(e) => setDraft({ ...draft, mode: e.target.value as Mode })}
        >
          <option value="shadow">{t("Кузатув (фақат лог)", "Shadow (log only)")}</option>
          <option value="suggest" disabled>
            {t("Таклиф (тез орада)", "Suggest (rollout — coming)")}
          </option>
          <option value="auto" disabled>
            {t("Авто (тез орада)", "Auto (rollout — coming)")}
          </option>
        </select>
        <div className="text-xs text-muted-foreground">
          {t(
            "Кузатув режимида агент жавоб таклифини серверда логга ёзади, мижозга ҳеч нарса юбормайди.",
            "In Shadow, the agent logs a proposed reply on the server and sends nothing to customers. Suggest/Auto arrive in a later rollout slice.",
          )}
        </div>
      </section>

      {/* Provider API keys */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            {t("Провайдер калитлари", "Provider API keys")}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={saveKeys.isPending || !(keyInput.anthropic || keyInput.google || keyInput.openai)}
            onClick={() => saveKeys.mutate()}
          >
            {saveKeys.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {t("Калитларни сақлаш", "Save keys")}
          </Button>
        </div>
        {(["anthropic", "google", "openai"] as const).map((p) => (
          <div key={p} className="flex items-center gap-3">
            <div className="w-28 text-sm capitalize">{p}</div>
            <Input
              type="password"
              autoComplete="off"
              placeholder={data.keyStatus[p] ? t("Сақланган — ўзгартириш учун ёзинг", "Set — type to replace") : t("Калит киритилмаган", "Not set — paste key")}
              value={keyInput[p]}
              onChange={(e) => setKeyInput({ ...keyInput, [p]: e.target.value })}
              className="flex-1"
            />
            <span className={`text-xs ${data.keyStatus[p] ? "text-green-600" : "text-muted-foreground"}`}>
              {data.keyStatus[p] ? t("✓ сақланган", "✓ set") : t("йўқ", "missing")}
            </span>
          </div>
        ))}
        <div className="text-xs text-muted-foreground">
          {t(
            "Калитлар базада сақланади ва ҳеч қачон қайтарилмайди. Танланган модель ўз провайдерининг калитидан фойдаланади.",
            "Keys are stored in the DB and never returned to the browser. The selected model uses its provider's key.",
          )}
        </div>
      </section>

      {/* Test the agent (multi-turn conversation) */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
            {t("Агент билан суҳбат синови", "Test the agent — conversation")}
            <span className="text-xs font-normal text-muted-foreground">
              {t("(жонли модель — мижозга юборилмайди)", "(real model — nothing sent to a customer)")}
            </span>
          </div>
          {(chat.length > 0 || testResult) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setChat([]);
                setTestResult(null);
                setTestMsg("");
              }}
            >
              {t("Янги суҳбат", "New chat")}
            </Button>
          )}
        </div>

        {/* Conversation thread (this is the memory the agent sees) */}
        {chat.length > 0 && (
          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2 max-h-[360px] overflow-y-auto">
            {chat.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                <span
                  className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-1.5 text-sm text-left ${
                    m.role === "user" ? "bg-primary/10" : "bg-card border border-border"
                  }`}
                >
                  {m.content}
                </span>
              </div>
            ))}
          </div>
        )}

        <textarea
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[72px]"
          placeholder={
            chat.length
              ? t("Кейинги хабарни ёзинг…", "Type the next message…")
              : t("Мижоз хабарини ёзинг, масалан: 4x5 xona narxi qancha?", "Type a customer message, e.g. 4x5 xona narxi qancha?")
          }
          value={testMsg}
          onChange={(e) => setTestMsg(e.target.value)}
        />
        <Button disabled={!testMsg.trim() || runTest.isPending} onClick={() => runTest.mutate()}>
          {runTest.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FlaskConical className="h-4 w-4 mr-2" />}
          {chat.length ? t("Юбориш", "Send") : t("Ишга тушириш", "Run")} · {draft.modelKey}
        </Button>

        {/* Meta for the latest turn (reply itself shows in the thread above) */}
        {testResult && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm space-y-1">
            <div>
              <span className="text-muted-foreground">{t("Қарор", "Decision")}:</span>{" "}
              <span className="font-mono">{testResult.decision.action}</span>
              {testResult.language && <span className="text-muted-foreground"> · {testResult.language}</span>}
            </div>
            {testResult.decision.action !== "reply" && testResult.decision.reason && (
              <div className="text-amber-600">
                {testResult.decision.reason}
                <span className="text-muted-foreground"> {t("(суҳбатга қўшилмади)", "(not added to the conversation)")}</span>
              </div>
            )}
            {testResult.toolCalls.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {t("Асбоблар", "Tools")}: {testResult.toolCalls.map((tc) => `${tc.name}${tc.ok ? "✓" : "✗"}`).join(", ")}
              </div>
            )}
            {testResult.usage && (
              <div className="text-xs text-muted-foreground tabular-nums">
                {t("Токенлар", "Tokens")}: in {testResult.usage.inputTokens} · out {testResult.usage.outputTokens} · cache {testResult.usage.cacheReadInputTokens}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
