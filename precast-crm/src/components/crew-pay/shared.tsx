"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { addDays, weekStartOf, type IsoDate, type PayStatus } from "@/lib/crew-pay/engine";
import { fmtDay, fmtSom } from "@/lib/crew-pay/format";
import { todayTashkent } from "@/lib/crew-pay/rules";
import type { CrewIssue } from "@/lib/crew-pay/checks";
import { issueHref } from "@/lib/crew-pay/links";

export function Som({ value, className, unit = true }: { value: number; className?: string; unit?: boolean }) {
  return (
    <span className={cn("font-mono tabular-nums whitespace-nowrap", value < 0 && "text-destructive", className)}>
      {value === 0 ? "–" : fmtSom(value)}
      {unit && value !== 0 && <span className="text-muted-foreground text-xs"> сўм</span>}
    </span>
  );
}

export function useCrewWeek(initial?: IsoDate) {
  return useState<IsoDate>(initial ?? weekStartOf(todayTashkent()));
}

export function WeekPicker({ week, onChange }: { week: IsoDate; onChange: (w: IsoDate) => void }) {
  const current = weekStartOf(todayTashkent());
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" aria-label="Олдинги ҳафта" onClick={() => onChange(addDays(week, -7))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="min-w-[150px] text-center font-mono tabular-nums text-sm">
        {fmtDay(week)} – {fmtDay(addDays(week, 6))}.{week.slice(0, 4)}
      </div>
      <Button variant="outline" size="icon" aria-label="Кейинги ҳафта" onClick={() => onChange(addDays(week, 7))}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      {week !== current && (
        <Button variant="ghost" size="sm" onClick={() => onChange(current)}>Шу ҳафта</Button>
      )}
    </div>
  );
}

export function IssuesBanner({ issues }: { issues: CrewIssue[] }) {
  const [open, setOpen] = useState(false);
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Ҳаммаси жойида
      </div>
    );
  }
  return (
    <div className={cn("rounded-md border px-3 py-2 text-sm", errors.length ? "border-destructive/50" : "border-amber-500/50")}>
      <button className="flex w-full items-center gap-2 text-left min-h-[44px]" onClick={() => setOpen(!open)}>
        <AlertTriangle className={cn("h-4 w-4", errors.length ? "text-destructive" : "text-amber-600")} />
        {errors.length > 0 && <span>{errors.length} та хато</span>}
        {warnings.length > 0 && <span className="text-muted-foreground">{warnings.length} та огоҳлантириш</span>}
        <span className="ml-auto text-muted-foreground">{open ? "Яшириш" : "Кўрсатиш"}</span>
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {[...errors, ...warnings].map((i, k) => (
            <li key={k}>
              <Link href={issueHref(i)} className={cn("hover:underline", i.level === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-400")}>
                {i.message}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CrewError({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : "Хатолик юз берди";
  return <div className="rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive">{msg}</div>;
}

export const newKey = () => crypto.randomUUID();

/** Payment status → Uzbek label + badge colour (paid = green, pending = muted/amber, debt = red). */
export const STATUS_UZ: Record<PayStatus, { label: string; variant: "success" | "warning" | "secondary" | "destructive" }> = {
  SETTLED: { label: "Ҳисоб-китоб тўлиқ", variant: "success" },
  NOT_YET_PAID: { label: "Ҳали тўланмаган", variant: "warning" },
  YOU_OWE: { label: "Сиз қарздорсиз", variant: "secondary" },
  OWES_YOU: { label: "Ишчи қарздор", variant: "destructive" },
};

/** In-app replacement for window.prompt: one labelled field, Cancel / Save. */
export function PromptDialog({
  open, title, label, initial = "", type = "text", minLength = 0, confirmText = "Сақлаш", onClose, onSubmit,
}: {
  open: boolean; title: string; label: string; initial?: string; type?: "text" | "date";
  minLength?: number; confirmText?: string; onClose: () => void; onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => { if (open) setValue(initial); }, [open, initial]);
  const ok = value.trim().length >= minLength;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (ok) onSubmit(value.trim()); }}>
          <label className="block text-sm text-muted-foreground">{label}
            <Input autoFocus type={type} value={value} onChange={(e) => setValue(e.target.value)} className="mt-1" />
          </label>
          {minLength > 0 && !ok && <p className="text-xs text-muted-foreground">Камида {minLength} та белги</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Бекор қилиш</Button>
            <Button type="submit" disabled={!ok}>{confirmText}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The ?week=YYYY-MM-DD query value if it is a valid Monday (links from the checks banner). */
export function weekFromQuery(v: string | null): IsoDate | undefined {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) && weekStartOf(v) === v ? v : undefined;
}
