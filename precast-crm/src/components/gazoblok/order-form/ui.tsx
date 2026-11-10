"use client";

import type { ReactNode } from "react";
import { Check, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

// Figures in IBM Plex Mono (--font-num): the app's default mono has no Cyrillic.
export const NUM = "font-[family-name:var(--font-num)] tabular-nums [word-spacing:-0.38em]";

/** Text inputs of the form: 40 px on desktop, 44 px on touch. */
export const FIELD = "h-11 md:h-10 bg-background";

/** Error ring for an input whose value blocks placing. */
export const FIELD_ERR = "border-destructive focus-visible:ring-destructive/40";

export function SectionCard({
  id,
  icon,
  title,
  done,
  action,
  children,
  className,
}: {
  id?: string;
  icon: ReactNode;
  title: string;
  done?: boolean;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("rounded-lg border border-border bg-card p-4 sm:p-5 scroll-mt-20", className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight">
          <span
            className={cn(
              "grid h-[30px] w-[30px] place-items-center rounded-md",
              done ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
            )}
          >
            {done ? <Check className="h-4 w-4" strokeWidth={1.75} /> : icon}
          </span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function FieldLabel({
  htmlFor,
  icon,
  children,
  note,
  required,
}: {
  htmlFor?: string;
  icon?: ReactNode;
  children: ReactNode;
  note?: string;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
      {icon && <span className="text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>}
      {children}
      {required && <span className="text-destructive">*</span>}
      {note && <span className="font-medium text-muted-foreground">{note}</span>}
    </label>
  );
}

export function Help({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("mt-1.5 text-xs text-muted-foreground", className)}>{children}</p>;
}

export function ErrorText({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-xs text-destructive">
      <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
      <span>{children}</span>
    </p>
  );
}

export function BadNumber({ show }: { show: boolean }) {
  const t = useT();
  if (!show) return null;
  return <ErrorText>{t("Сонни текширинг: масалан 1 000 000 ёки 7,5", "Check the number: e.g. 1 000 000 or 7,5")}</ErrorText>;
}

/** Payment-state pill colours: paid = success, partial = accent, awaiting = muted, over = destructive. */
export const STATE_PILL: Record<"AWAITING_PAYMENT" | "PARTIALLY_PAID" | "FULLY_PAID" | "OVERPAID", { cls: string; uz: string; en: string }> = {
  AWAITING_PAYMENT: { cls: "bg-muted text-muted-foreground", uz: "Кутилмоқда", en: "Awaiting" },
  PARTIALLY_PAID: { cls: "bg-primary/15 text-primary", uz: "Қисман", en: "Partial" },
  FULLY_PAID: { cls: "bg-success/15 text-success", uz: "Тўланган", en: "Paid" },
  OVERPAID: { cls: "bg-destructive/15 text-destructive", uz: "Ортиқча тўлов", en: "Over-payment" },
};
