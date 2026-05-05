"use client";

import { useEffect, useState, Suspense } from "react";
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
    beamCount: number;
    totalBlocks: number;
    concreteVolume: string;
    beamLength: string;
  }>;
}

// ── Default unit prices (UZS). Admin can override later. ───────
const DEFAULT_PRICES = {
  beamPerMeter: 35000, // UZS per running meter of beam
  blockEach: 12000, // UZS per block
  concretePerM3: 850000, // UZS per m³
  delivery: 500000, // flat default
};

function QuoteNewInner() {
  const router = useRouter();
  const search = useSearchParams();
  const projectId = search.get("projectId") ?? "";
  const calcId = search.get("calcId") ?? "";

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects-all"],
    queryFn: () => api("/api/projects"),
  });

  const project = projects.find((p) => p.id === projectId);
  const calc = project?.calculations.find((c) => c.id === calcId) ?? project?.calculations[0];

  const [beamCost, setBeamCost] = useState(0);
  const [blockCost, setBlockCost] = useState(0);
  const [concreteCost, setConcreteCost] = useState(0);
  const [deliveryCost, setDeliveryCost] = useState(DEFAULT_PRICES.delivery);
  const [otherCost, setOtherCost] = useState(0);
  const [status, setStatus] = useState<"DRAFT" | "SENT">("DRAFT");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Auto-fill from calculation once data arrives
  useEffect(() => {
    if (!calc) return;
    const totalBeamMeters = calc.beamCount * Number(calc.beamLength);
    setBeamCost(Math.round(totalBeamMeters * DEFAULT_PRICES.beamPerMeter));
    setBlockCost(Math.round(calc.totalBlocks * DEFAULT_PRICES.blockEach));
    setConcreteCost(Math.round(Number(calc.concreteVolume) * DEFAULT_PRICES.concretePerM3));
  }, [calc]);

  const total = beamCost + blockCost + concreteCost + deliveryCost + otherCost;

  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/api/quotes", {
        method: "POST",
        json: {
          projectId,
          calculationId: calc?.id,
          beamCost,
          blockCost,
          concreteCost,
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
          Open a project and click <strong>Generate Quote</strong> to start.
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

      {!calc && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            This project has no calculation yet — please run one first.
          </CardContent>
        </Card>
      )}

      {calc && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Pricing (editable)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <PriceRow
                label="Beams"
                hint={`${calc.beamCount} × ${formatNumber(calc.beamLength, 3)} m`}
                value={beamCost}
                onChange={setBeamCost}
              />
              <PriceRow
                label="Blocks"
                hint={`${calc.totalBlocks} blocks`}
                value={blockCost}
                onChange={setBlockCost}
              />
              <PriceRow
                label="Concrete topping"
                hint={`${formatNumber(calc.concreteVolume, 3)} m³`}
                value={concreteCost}
                onChange={setConcreteCost}
              />
              <PriceRow label="Delivery" value={deliveryCost} onChange={setDeliveryCost} />
              <PriceRow label="Other / extras" value={otherCost} onChange={setOtherCost} />

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
              <SummaryRow label="Beams" value={beamCost} />
              <SummaryRow label="Blocks" value={blockCost} />
              <SummaryRow label="Concrete" value={concreteCost} />
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
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 items-center">
      <div className="col-span-1">
        <Label>{label}</Label>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <Input
        className="col-span-2 text-right font-mono"
        type="number"
        min="0"
        step="1000"
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
      <span className="font-mono">{formatMoney(value)}</span>
    </div>
  );
}
