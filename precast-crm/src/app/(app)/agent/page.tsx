"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, Save } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

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
    </div>
  );
}
