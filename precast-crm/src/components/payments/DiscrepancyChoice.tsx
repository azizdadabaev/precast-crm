"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNumber } from "@/lib/utils";

export type DiscrepancyAction = "TRACK" | "DISCOUNT" | "WRITEOFF" | null;

interface Props {
  expected: number;
  recorded: number;
  action: DiscrepancyAction;
  onAction: (a: DiscrepancyAction) => void;
  note: string;
  onNote: (n: string) => void;
}

const OPTIONS: Array<{ value: Exclude<DiscrepancyAction, null>; label: string; hint: string; ringCls: string }> = [
  {
    value: "TRACK",
    label: "Confirm + open discrepancy (track recovery)",
    hint: "Status: OPEN — to be collected later",
    ringCls: "border-amber-300 bg-amber-50 text-amber-900 ring-amber-300",
  },
  {
    value: "DISCOUNT",
    label: "Confirm + approve as discount",
    hint: "Status: RESOLVED_DISCOUNT — adjusts order, no further action",
    ringCls: "border-sky-300 bg-sky-50 text-sky-900 ring-sky-300",
  },
  {
    value: "WRITEOFF",
    label: "Confirm + write off",
    hint: "Status: RESOLVED_WRITEOFF — accept loss",
    ringCls: "border-rose-300 bg-rose-50 text-rose-900 ring-rose-300",
  },
];

export function DiscrepancyChoice({
  expected,
  recorded,
  action,
  onAction,
  note,
  onNote,
}: Props) {
  const shortfall = expected - recorded;

  // If expected/recorded change such that there's no longer a shortfall,
  // clear the action so the form re-validates correctly.
  useEffect(() => {
    if (shortfall <= 0 && action != null) onAction(null);
  }, [shortfall, action, onAction]);

  if (shortfall <= 0) return null;

  return (
    <div className="rounded-md border-2 border-amber-300 bg-amber-50/60 p-3 space-y-3">
      <div className="flex items-start gap-2 text-sm font-semibold text-amber-900">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          Expected:{" "}
          <span className="tabular-nums">{formatNumber(expected, 0)}</span> ·
          Recorded: <span className="tabular-nums">{formatNumber(recorded, 0)}</span>
          {" — "}
          Shortfall:{" "}
          <span className="tabular-nums font-bold text-rose-800">
            {formatNumber(shortfall, 0)}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {OPTIONS.map((opt) => {
          const checked = action === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onAction(opt.value)}
              className={[
                "w-full text-left rounded-md border p-2 transition-colors",
                checked ? `${opt.ringCls} ring-2` : "border-border bg-background hover:bg-muted/30",
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
            Eslatma · Note (required, min 5 chars)
          </Label>
          <Input
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="e.g. Customer agreed to pay the rest by Friday"
          />
        </div>
      )}
    </div>
  );
}
