"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export type DiscrepancyAction = "TRACK" | "DISCOUNT" | "WRITEOFF" | null;

interface Props {
  expected: number;
  recorded: number;
  action: DiscrepancyAction;
  onAction: (a: DiscrepancyAction) => void;
  note: string;
  onNote: (n: string) => void;
}

export function DiscrepancyChoice({
  expected,
  recorded,
  action,
  onAction,
  note,
  onNote,
}: Props) {
  const t = useT();
  const shortfall = expected - recorded;

  const options: Array<{
    value: Exclude<DiscrepancyAction, null>;
    label: string;
    hint: string;
    ringCls: string;
  }> = [
    {
      value: "TRACK",
      label: t("Тасдиқлаш + очиқ тафовут (қайтаришни кузатиш)", "Confirm + open discrepancy (track recovery)"),
      hint: t("Ҳолат: ОЧИҚ — кейинроқ йиғилади", "Status: OPEN — to be collected later"),
      ringCls: "border-warning/30 bg-warning/10 text-warning ring-warning/30",
    },
    {
      value: "DISCOUNT",
      label: t("Тасдиқлаш + чегирма сифатида тасдиқлаш", "Confirm + approve as discount"),
      hint: t("Ҳолат: ЧЕГИРМА — буюртмани созлайди, кейин ҳаракат йўқ", "Status: RESOLVED_DISCOUNT — adjusts order, no further action"),
      ringCls: "border-primary/30 bg-primary/10 text-primary ring-primary/30",
    },
    {
      value: "WRITEOFF",
      label: t("Тасдиқлаш + ҳисобдан чиқариш", "Confirm + write off"),
      hint: t("Ҳолат: ҲИСОБДАН ЧИҚАРИЛДИ — зарарни қабул қилиш", "Status: RESOLVED_WRITEOFF — accept loss"),
      ringCls: "border-destructive/30 bg-destructive/10 text-destructive ring-destructive/30",
    },
  ];

  // If expected/recorded change such that there's no longer a shortfall,
  // clear the action so the form re-validates correctly.
  useEffect(() => {
    if (shortfall <= 0 && action != null) onAction(null);
  }, [shortfall, action, onAction]);

  if (shortfall <= 0) return null;

  return (
    <div className="rounded-md border-2 border-warning/30 bg-warning/10 p-3 space-y-3">
      <div className="flex items-start gap-2 text-sm font-semibold text-warning">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          {t("Кутилган:", "Expected:")}{" "}
          <span className="tabular-nums">{formatNumber(expected, 0)}</span> ·{" "}
          {t("Қайд этилган:", "Recorded:")}{" "}
          <span className="tabular-nums">{formatNumber(recorded, 0)}</span>
          {" — "}
          {t("Камомад:", "Shortfall:")}{" "}
          <span className="tabular-nums font-bold text-destructive">
            {formatNumber(shortfall, 0)}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {options.map((opt) => {
          const checked = action === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onAction(opt.value)}
              className={[
                "w-full text-left rounded-md border p-2 transition-colors",
                checked ? `${opt.ringCls} ring-2` : "border-border bg-card hover:bg-muted/30",
              ].join(" ")}
            >
              <div className="flex items-start gap-2">
                <div
                  className={`h-4 w-4 mt-0.5 shrink-0 rounded-full border-2 ${checked ? "bg-current" : ""} ${checked ? "" : "border-muted-foreground"}`}
                />
                <div>
                  <div className="font-semibold text-sm">{opt.label}</div>
                  <div className="text-xs opacity-80">{opt.hint}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {action != null && (
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider font-bold">
            Эслатма<span className="lang-en"> · Note</span> ({t("мажбурий, мин. 5 белги", "required, min 5 chars")})
          </Label>
          <Input
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder={t(
              "масалан: Мижоз жумагача қолганини тўлашга рози бўлди",
              "e.g. Customer agreed to pay the rest by Friday",
            )}
          />
        </div>
      )}
    </div>
  );
}
