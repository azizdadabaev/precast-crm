"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Loader2, Save } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";

interface PriceTier {
  max_beam_length: number;
  price: number;
}

interface PricingResponse {
  m2PriceTiers: PriceTier[];
  extraBeamPriceTiers: PriceTier[];
  blockUnitPrice: number;
  updatedAt: string | null;
}

interface DraftConfig {
  m2: string[];          // input strings so the user can clear a field mid-edit
  extraBeam: string[];
  block: string;
}

function tiersToDraft(p: PricingResponse): DraftConfig {
  return {
    m2: p.m2PriceTiers.map((t) => String(t.price)),
    extraBeam: p.extraBeamPriceTiers.map((t) => String(t.price)),
    block: String(p.blockUnitPrice),
  };
}

function isValidNumber(s: string): boolean {
  if (s.trim() === "") return false;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0;
}

export default function PricingPage() {
  const t = useT();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<PricingResponse>({
    queryKey: ["pricing"],
    queryFn: () => api("/api/pricing"),
  });

  const [draft, setDraft] = useState<DraftConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seed the draft from the loaded config on first render and on every
  // successful save (so the "saved" snapshot becomes the new baseline
  // for `isDirty`).
  useEffect(() => {
    if (data) setDraft(tiersToDraft(data));
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("no draft");
      const res = await fetch("/api/pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          m2: draft.m2.map((s) => Number(s)),
          extraBeam: draft.extraBeam.map((s) => Number(s)),
          block: Number(draft.block),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save pricing");
      return json;
    },
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["pricing"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading || !data || !draft) {
    return (
      <div className="p-6 text-muted-foreground">
        {t("Юкланмоқда…", "Loading…")}
      </div>
    );
  }

  // Validation — every input must parse as a non-negative number, and at
  // least one value must differ from the current snapshot for Save to
  // light up.
  const allValid =
    draft.m2.every(isValidNumber) &&
    draft.extraBeam.every(isValidNumber) &&
    isValidNumber(draft.block);

  const baseline = tiersToDraft(data);
  const isDirty =
    draft.m2.some((v, i) => v !== baseline.m2[i]) ||
    draft.extraBeam.some((v, i) => v !== baseline.extraBeam[i]) ||
    draft.block !== baseline.block;

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Coins className="h-6 w-6 text-muted-foreground" />
            Нархлар
            <span className="lang-en text-muted-foreground font-normal text-base">
              {" "}· Pricing
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "Жорий нархлар. Янги ҳисоб-китоблар, лойиҳалар ва буюртмалар сақланиш пайтидаги тариф асосида ҳисобланади. Эски буюртмалар тегмайди.",
              "Live pricing. New calculations, projects, and orders bill against whatever is saved here at the moment they're placed. Already-placed orders keep their original snapshot.",
            )}
          </p>
        </div>
        <Button
          disabled={!allValid || !isDirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {t("Сақлаш", "Save")}
        </Button>
      </div>

      {data.updatedAt && (
        <div className="text-xs text-muted-foreground">
          {t("Охирги ўзгариш:", "Last updated:")}{" "}
          <span className="tabular-nums">{formatDate(data.updatedAt)}</span>
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* m² rate tiers */}
      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <header className="px-4 py-3 border-b flex items-baseline justify-between">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            м² нархи · M² tier
            <span className="lang-en font-normal"> (UZS per m²)</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {t("Балка узунлиги бўйича", "By beam length")}
          </div>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 w-40">
                {t("Энг катта балка узунлиги", "Max beam length")}
              </th>
              <th className="text-left px-3 py-2">
                {t("Нархи (UZS / м²)", "Price (UZS / m²)")}
              </th>
              <th className="text-right px-3 py-2 w-32 text-muted-foreground font-normal">
                {t("Олдинги", "Previous")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.m2PriceTiers.map((tier, i) => (
              <tr key={`m2-${tier.max_beam_length}`}>
                <td className="px-3 py-2 font-mono">
                  ≤ {tier.max_beam_length.toFixed(2)} m
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1000}
                    className="w-40 tabular-nums"
                    value={draft.m2[i]}
                    onChange={(e) => {
                      const next = [...draft.m2];
                      next[i] = e.target.value;
                      setDraft({ ...draft, m2: next });
                    }}
                  />
                </td>
                <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
                  {formatNumber(tier.price, 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Extra-beam tiers */}
      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <header className="px-4 py-3 border-b flex items-baseline justify-between">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Қўшимча балка · Extra-beam tier
            <span className="lang-en font-normal"> (UZS per m of beam)</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {t("Балка узунлиги бўйича", "By beam length")}
          </div>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 w-40">
                {t("Энг катта балка узунлиги", "Max beam length")}
              </th>
              <th className="text-left px-3 py-2">
                {t("Нархи (UZS / м)", "Price (UZS / m)")}
              </th>
              <th className="text-right px-3 py-2 w-32 text-muted-foreground font-normal">
                {t("Олдинги", "Previous")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.extraBeamPriceTiers.map((tier, i) => (
              <tr key={`eb-${tier.max_beam_length}`}>
                <td className="px-3 py-2 font-mono">
                  ≤ {tier.max_beam_length.toFixed(2)} m
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1000}
                    className="w-40 tabular-nums"
                    value={draft.extraBeam[i]}
                    onChange={(e) => {
                      const next = [...draft.extraBeam];
                      next[i] = e.target.value;
                      setDraft({ ...draft, extraBeam: next });
                    }}
                  />
                </td>
                <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
                  {formatNumber(tier.price, 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Legacy block unit price */}
      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <header className="px-4 py-3 border-b">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Ғишт бирлик нархи · Block unit price
            <span className="lang-en font-normal"> (UZS per block)</span>
          </div>
          <div className="text-[11px] text-muted-foreground italic mt-1">
            {t(
              "Эслатма: Г-Б-Г шаблонида ёпиш блок қатори м² тарифи билан ҳисобланади, бу қиймат ҳозирда фойдаланилмайди.",
              "Note: GBG's closing block row now bills via the m² tier; this value is currently unused. Kept editable in case a future pattern uses it.",
            )}
          </div>
        </header>
        <div className="p-3">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            step={500}
            className="w-40 tabular-nums"
            value={draft.block}
            onChange={(e) => setDraft({ ...draft, block: e.target.value })}
          />
          <div className="text-xs text-muted-foreground mt-1 tabular-nums">
            {t("Олдинги:", "Previous:")}{" "}
            {formatNumber(data.blockUnitPrice, 0)}
          </div>
        </div>
      </section>
    </div>
  );
}
