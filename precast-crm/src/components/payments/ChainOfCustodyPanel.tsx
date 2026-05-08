"use client";

import { Truck, FileText, Building2, Landmark, CheckCircle2, Clock, X } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Props {
  payment: {
    method: string;
    collectedByDriver: { id: string; name: string } | null;
    collectedAt: string | null;
    recordedBy: { id: string; name: string } | null;
    recordedAt: string;
    handedOverTo: { id: string; name: string } | null;
    handedOverToOfficeAt: string | null;
    confirmedBy: { id: string; name: string } | null;
    confirmedAt: string | null;
    rejectedBy?: { id: string; name: string } | null;
    rejectedAt?: string | null;
    status: "PENDING_CONFIRMATION" | "CONFIRMED" | "REJECTED";
  };
}

interface Step {
  icon: typeof Truck;
  label: string;
  who: string | null;
  whenIso: string | null;
}

/**
 * Visual chain showing every hand-off the cash made on its way to the
 * confirmer. The exact step list depends on how the payment was sourced:
 *
 *   - collectedByDriver set → driver flow (delivery cash). Three steps:
 *       Collected from customer → Recorded in app → Handed over to office
 *   - no driver + CASH method → in-office cash. Two steps:
 *       Recorded at office → Handed over to owner
 *   - no driver + non-CASH method → bank / online. One step:
 *       Recorded by operator (no physical handover)
 *
 * Confirmation / rejection is always the final step regardless of source.
 */
export function ChainOfCustodyPanel({ payment }: Props) {
  const steps: Step[] = [];

  if (payment.collectedByDriver) {
    // Driver flow
    steps.push({
      icon: Truck,
      label: "Collected from customer",
      who: payment.collectedByDriver.name,
      whenIso: payment.collectedAt,
    });
    steps.push({
      icon: FileText,
      label: "Recorded in app",
      who: payment.recordedBy?.name ?? null,
      whenIso: payment.recordedAt,
    });
    steps.push({
      icon: Building2,
      label: "Handed over to office",
      who: payment.handedOverTo?.name ?? null,
      whenIso: payment.handedOverToOfficeAt,
    });
  } else if (payment.method === "CASH") {
    // In-office cash
    steps.push({
      icon: FileText,
      label: "Recorded at office",
      who: payment.recordedBy?.name ?? null,
      whenIso: payment.recordedAt,
    });
    steps.push({
      icon: Building2,
      label: "Handed over to owner",
      who: payment.handedOverTo?.name ?? null,
      whenIso: payment.handedOverToOfficeAt,
    });
  } else {
    // Bank / online
    steps.push({
      icon: Landmark,
      label: `${payment.method} payment recorded`,
      who: payment.recordedBy?.name ?? null,
      whenIso: payment.recordedAt,
    });
  }

  // Final state — confirmed / rejected / pending
  if (payment.status === "REJECTED") {
    steps.push({
      icon: X,
      label: "Rejected by owner",
      who: payment.rejectedBy?.name ?? null,
      whenIso: payment.rejectedAt ?? null,
    });
  } else {
    steps.push({
      icon: payment.status === "CONFIRMED" ? CheckCircle2 : Clock,
      label:
        payment.status === "CONFIRMED"
          ? "Confirmed by owner"
          : "Awaiting your confirmation",
      who: payment.confirmedBy?.name ?? null,
      whenIso: payment.confirmedAt,
    });
  }

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
