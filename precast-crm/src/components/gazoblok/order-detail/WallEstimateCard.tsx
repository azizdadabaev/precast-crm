"use client";

import { useState } from "react";
import { Calculator, ChevronDown } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { NUM } from "@/components/gazoblok/order-form/ui";
import { ICON } from "./ui";

type Snapshot = {
  walls?: Array<{
    name?: string;
    lengthM: number;
    heightM: number;
    orientation?: "STANDARD" | "ROTATED";
    openings?: Array<{ kind: string; widthM: number; heightM: number; qty: number }>;
  }>;
  result?: { glue?: { kg: number; bags: number } };
};

/** Read-only, collapsed snapshot of the wall calculator that produced the order. */
export function WallEstimateCard({ estimate }: { estimate: Record<string, unknown> | null }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const snap = (estimate ?? {}) as Snapshot;
  const walls = snap.walls ?? [];
  const glue = snap.result?.glue;
  if (!estimate || (walls.length === 0 && !glue)) return null;
  const openings = walls.reduce((s, w) => s + (w.openings ?? []).reduce((a, o) => a + (Number(o.qty) || 0), 0), 0);

  return (
    <section className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[56px] w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left sm:px-5"
      >
        <span className="grid h-[30px] w-[30px] place-items-center rounded-md bg-muted text-muted-foreground">
          <Calculator className="h-4 w-4" {...ICON} />
        </span>
        <span className="text-[15px] font-bold">{t("Девор ҳисоби", "Wall estimate")}</span>
        <span className="text-[13px] text-muted-foreground">
          <span className={NUM}>{walls.length}</span> {t("девор", "walls")} · <span className={NUM}>{openings}</span> {t("очиқлик", "openings")}
          {glue && (
            <>
              {" "}· {t("елим", "glue")} ~<span className={NUM}>{formatNumber(Number(glue.kg), 0)}</span> кг (<span className={NUM}>{formatNumber(Number(glue.bags), 0)}</span>{" "}
              {t("қоп", "bags")})
            </>
          )}
        </span>
        <ChevronDown className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} {...ICON} />
      </button>
      {open && walls.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {walls.map((w, i) => (
            <li key={i} className="flex items-baseline justify-between gap-4 px-5 py-2.5 text-sm">
              <span className="font-medium">
                {w.name || `${t("Девор", "Wall")} ${i + 1}`}
                <span className={cn(NUM, "ml-2 text-muted-foreground")}>
                  {formatNumber(Number(w.lengthM), 2)}×{formatNumber(Number(w.heightM), 2)} м
                </span>
                {w.orientation === "ROTATED" && <span className="ml-1.5 text-xs text-muted-foreground">{t("(айланган)", "(rotated)")}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                <span className={NUM}>{(w.openings ?? []).reduce((s, o) => s + (Number(o.qty) || 0), 0)}</span> {t("очиқлик", "openings")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
