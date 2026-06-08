"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, Save, KeyRound, FlaskConical } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import { findKbPrices } from "@/lib/agent/kb-lint";

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
  tookMs?: number;
  turns?: number;
}

// Owner-managed agent text doc (spec §9 KB / §3 few-shot). A Markdown editor over
// an AppConfig key the agent reads live; saves are stamped + audited. lintPrices
// flags price-shaped text (the KB must carry no prices — those come from tools).
function AgentDocEditor({
  title,
  endpoint,
  queryKey,
  hint,
  lintPrices,
}: {
  title: { uz: string; en: string };
  endpoint: string;
  queryKey: string;
  hint: { uz: string; en: string };
  lintPrices?: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  const { data } = useQuery<{ content: string; updatedAt: string | null; updatedBy: string | null }>({
    queryKey: [queryKey],
    queryFn: () => api(endpoint),
  });
  const [text, setText] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [savedBy, setSavedBy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (data) { setText(data.content); setSavedAt(data.updatedAt); setSavedBy(data.updatedBy); }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save");
      return (json.data ?? json) as { updatedAt: string; updatedBy: string | null };
    },
    onSuccess: (saved) => {
      setErr(null); setSavedAt(saved.updatedAt); setSavedBy(saved.updatedBy);
      qc.invalidateQueries({ queryKey: [queryKey] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const dirty = data != null && text !== data.content;
  const prices = lintPrices ? findKbPrices(text) : [];
  const tokens = Math.ceil(text.length / 4);

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{t(title.uz, title.en)}</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={!dirty || save.isPending} onClick={() => data && setText(data.content)}>
            {t("Бекор", "Revert")}
          </Button>
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("Сақлаш", "Save")}
          </Button>
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        className="h-[300px] w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed outline-none"
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{text.length.toLocaleString()} {t("белги", "chars")} · ~{tokens.toLocaleString()} tokens</span>
        {savedAt && <span>· {t("охирги сақлаш", "last saved")}: {new Date(savedAt).toLocaleString()}{savedBy ? ` · ${savedBy}` : ""}</span>}
        {dirty && <span className="text-amber-600 dark:text-amber-400">· {t("сақланмаган ўзгаришлар", "unsaved changes")}</span>}
      </div>
      {prices.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
          {t("Диққат: нархга ўхшаш сон бор — нарх фақат калькулятордан келади:", "Warning: price-shaped numbers — prices must come from the calculator, never this doc:")}{" "}
          <span className="font-mono">{prices.join(", ")}</span>
        </div>
      )}
      {err && <div className="text-xs text-destructive">{err}</div>}
      <div className="text-xs text-muted-foreground">{t(hint.uz, hint.en)}</div>
    </section>
  );
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
          <option value="suggest">{t("Таклиф (оператор юборади)", "Suggest (operator sends)")}</option>
          <option value="auto">{t("Авто (жавоблар автоматик)", "Auto (replies auto-send)")}</option>
        </select>
        <div className="text-xs text-muted-foreground">
          {t(
            "Кузатув: фақат логга ёзади. Таклиф: жавоб таклифи инбоксда чиқади, оператор юборади. Авто: оддий жавоблар автоматик юборилади — буюртмаларни доимо оператор тасдиқлайди.",
            "Shadow: logs a proposal, sends nothing. Suggest: the proposal appears in /inbox for the operator to Send/Edit. Auto: straightforward replies auto-send; escalations and orders always go to a human (orders are never auto-placed).",
          )}
        </div>
      </section>

      {/* Knowledge base */}
      <AgentDocEditor
        title={{ uz: "Билимлар базаси", en: "Knowledge base" }}
        endpoint="/api/agent/kb"
        queryKey="agent-kb"
        lintPrices
        hint={{
          uz: "Сақлангач, агент дарҳол шу базадан фойдаланади. Эслатма: кэш туфайли ўзгариш иссиқ суҳбатларга 1 соатгача етиб бориши мумкин. Ишга туширишдан олдин она тилида сўзлашувчи текширсин.",
          en: "Saved immediately for new turns. Note: prompt caching can delay a warm cache by ~1h. Have a native speaker review the Uzbek/Cyrillic before go-live.",
        }}
      />

      {/* Few-shot examples (tone guide) */}
      <AgentDocEditor
        title={{ uz: "Few-shot мисоллар (оҳанг)", en: "Few-shot examples (tone)" }}
        endpoint="/api/agent/fewshot"
        queryKey="agent-fewshot"
        hint={{
          uz: "Намунавий суҳбатлар — фақат ОҲАНГ учун, нарх/факт манбаи эмас. Қисқа тутинг; рақамлар ўрнига <…> ишлатинг. Она тилида текширилсин.",
          en: "Example exchanges — a TONE guide only, never a source of facts or prices. Keep it short; use <…> placeholders, not real numbers. Native-speaker reviewed.",
        }}
      />

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
            {testResult.tookMs != null && (
              <div className="text-xs text-muted-foreground tabular-nums">
                {t("Вақт", "Time")}: {(testResult.tookMs / 1000).toFixed(1)}s
                {testResult.turns ? ` · ${testResult.turns} ${t("қадам", "model turns")}` : ""}
                <span className="text-muted-foreground/70"> {t("(сервер; туннел+браузер қўшилади)", "(server only; tunnel+browser add more)")}</span>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
