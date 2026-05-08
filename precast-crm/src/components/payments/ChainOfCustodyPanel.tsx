"use client";

import { Truck, FileText, Building2, CheckCircle2, Clock } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Props {
  payment: {
    collectedByDriver: { id: string; name: string } | null;
    collectedAt: string | null;
    recordedBy: { id: string; name: string } | null;
    recordedAt: string;
    handedOverTo: { id: string; name: string } | null;
    handedOverToOfficeAt: string | null;
    confirmedBy: { id: string; name: string } | null;
    confirmedAt: string | null;
    status: "PENDING_CONFIRMATION" | "CONFIRMED" | "REJECTED";
  };
}

/**
 * Visual chain showing every hand-off the cash made on its way to the
 * confirmer. Each step is either filled (timestamp present) or
 * grayed-out / "—" (missing — common for non-cash methods that skip the
 * driver step).
 */
export function ChainOfCustodyPanel({ payment }: Props) {
  const steps = [
    {
      icon: Truck,
      label: "Collected from customer",
      who: payment.collectedByDriver?.name ?? null,
      whenIso: payment.collectedAt,
    },
    {
      icon: FileText,
      label: "Recorded in app",
      who: payment.recordedBy?.name ?? null,
      whenIso: payment.recordedAt,
    },
    {
      icon: Building2,
      label: "Handed over to office",
      who: payment.handedOverTo?.name ?? null,
      whenIso: payment.handedOverToOfficeAt,
    },
    {
      icon: payment.status === "CONFIRMED" ? CheckCircle2 : Clock,
      label:
        payment.status === "CONFIRMED"
          ? "Confirmed by owner"
          : payment.status === "REJECTED"
            ? "Rejected by owner"
            : "Awaiting your confirmation",
      who: payment.confirmedBy?.name ?? null,
      whenIso: payment.confirmedAt,
    },
  ];

  return (
    <div className="rounded-md border bg-muted/20 p-3 text-sm">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
        Chain of custody · Жараён
      </div>
      <ol className="space-y-1.5">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const filled = !!s.whenIso;
          return (
            <li
              key={i}
              className={`flex items-start gap-2 ${filled ? "" : "opacity-50"}`}
            >
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${filled ? "text-emerald-600" : "text-muted-foreground"}`} />
              <div className="flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{s.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {s.whenIso ? formatDate(s.whenIso) : "—"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {s.who ?? "—"}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
