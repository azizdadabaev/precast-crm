"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ArrowLeft, FileText } from "lucide-react";
import { formatMoney, formatNumber } from "@/lib/utils";

interface Project {
  id: string;
  name: string | null;
  deal: { client: { name: string } };
  calculations: Array<{
    id: string;
    name: string | null;
    pattern: "GB" | "BGB" | "GBG";
    beamCount: number;
    totalBlocks: number;
    beamLength: string;
    billedArea: string;
    monolithLength: string;
    subtotal: string;
  }>;
}

const PATTERN_LABEL = { GB: "Г-Б", BGB: "Б-Г-Б", GBG: "Г-Б-Г" } as const;

function QuoteNewInner() {
  const router = useRouter();
  const search = useSearchParams();
  const projectId = search.get("projectId") ?? "";

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects-all"],
    queryFn: () => api("/api/projects"),
  });

  const project = projects.find((p) => p.id === projectId);

  const [discountPercent, setDiscountPercent] = useState(0);
  const [deliveryCost, setDeliveryCost] = useState(500_000);
  const [otherCost, setOtherCost] = useState(0);
  const [status, setStatus] = useState<"DRAFT" | "SENT">("DRAFT");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const roomsSubtotal =
    project?.calculations.reduce((s, c) => s + Number(c.subtotal), 0) ?? 0;
  const discountAmount = (roomsSubtotal * discountPercent) / 100;
  const total = roomsSubtotal - discountAmount + deliveryCost + otherCost;

  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/api/quotes", {
        method: "POST",
        json: {
          projectId,
          calculationId: project?.calculations[0]?.id,
          discountPercent,
          deliveryCost,
          otherCost,
          status,
          notes: notes || undefined,
        },
      }),
    onSuccess: (q) => router.push(`/quotes/${q.id}`),
    onError: (e: Error) => setError(e.message),
  });

  if (!projectId) {
    return (
      <div>
        <p className="text-muted-foreground">
          Open a project and click <strong>New Quote</strong> to start.
        </p>
        <Button asChild variant="outline" className="mt-3">
          <Link href="/projects">Go to Projects</Link>
        </Button>
      </div>
    );
  }

  if (!project) return <div className="text-muted-foreground">Loading project…</div>;

  return (
    <div className="space-y-5">
      <Link
        href={`/projects/${projectId}`}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to project
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Quote</h1>
        <p className="text-sm text-muted-foreground">
          {project.deal.client.name} ·{" "}
          {project.name || `Project ${project.id.slice(-6)}`}
        </p>
      </div>

      {project.calculations.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            This project has no calculations yet — please run one first.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Rooms (auto-calculated subtotals)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="text-left p-2">Name</th>
                    <th className="text-center p-2">Pattern</th>
                    <th className="text-center p-2">Beam L</th>
                    <th className="text-center p-2">Beams</th>
                    <th className="text-center p-2">Blocks</th>
                    <th className="text-center p-2">Billed m²</th>
                    <th className="text-right p-2">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {project.calculations.map((c) => (
                    <tr key={c.id}>
                      <td className="p-2 font-medium">{c.name || "—"}</td>
                      <td className="p-2 text-center">{PATTERN_LABEL[c.pattern]}</td>
                      <td className="p-2 text-center">{formatNumber(c.beamLength, 2)}</td>
                      <td className="p-2 text-center">{c.beamCount}</td>
                      <td className="p-2 text-center">{c.totalBlocks}</td>
                      <td className="p-2 text-center">{formatNumber(c.billedArea, 2)}</td>
                      <td className="p-2 text-right font-bold">{formatMoney(c.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/20 border-t-2 font-bold">
                  <tr>
                    <td colSpan={6} className="p-2 text-right">Rooms subtotal</td>
                    <td className="p-2 text-right">{formatMoney(roomsSubtotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>

            <CardContent className="space-y-3 border-t">
              <PriceRow label="Discount %" value={discountPercent} onChange={setDiscountPercent} step="1" max={100} />
              <PriceRow label="Delivery" value={deliveryCost} onChange={setDeliveryCost} step="10000" />
              <PriceRow label="Other / extras" value={otherCost} onChange={setOtherCost} step="10000" />

              <div className="space-y-1.5 pt-3">
                <Label>Status</Label>
                <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                  <option value="DRAFT">Draft</option>
                  <option value="SENT">Send to client</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                  {error}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="h-fit sticky top-6">
            <CardHeader>
              <CardTitle>Total</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SummaryRow label="Rooms subtotal" value={roomsSubtotal} />
              <SummaryRow label={`Discount (${discountPercent}%)`} value={-discountAmount} />
              <SummaryRow label="Delivery" value={deliveryCost} />
              <SummaryRow label="Other" value={otherCost} />
              <div className="border-t pt-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold">Grand Total</span>
                  <span className="text-2xl font-bold">{formatMoney(total)}</span>
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => create.mutate()}
                disabled={create.isPending}
              >
                <FileText className="h-4 w-4 mr-2" />
                {create.isPending ? "Saving…" : "Save Quote"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function NewQuotePage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground">Loading…</div>}>
      <QuoteNewInner />
    </Suspense>
  );
}

function PriceRow({
  label,
  value,
  onChange,
  step = "1000",
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: string;
  max?: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 items-center">
      <Label className="col-span-1">{label}</Label>
      <Input
        className="col-span-2 text-right font-mono"
        type="number"
        min="0"
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${value < 0 ? "text-rose-700" : ""}`}>{formatMoney(value)}</span>
    </div>
  );
}

