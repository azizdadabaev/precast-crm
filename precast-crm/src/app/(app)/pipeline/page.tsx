"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/utils";
import Link from "next/link";

type Stage = "NEW_LEAD" | "CONTACTED" | "CALCULATION" | "QUOTE_SENT" | "WON" | "LOST";

interface DealCard {
  id: string;
  stage: Stage;
  status: string;
  value: string;
  client: { id: string; name: string; phone: string };
  projects: { id: string }[];
}

const STAGES: { id: Stage; label: string; tone: string }[] = [
  { id: "NEW_LEAD", label: "New Lead", tone: "bg-slate-500" },
  { id: "CONTACTED", label: "Contacted", tone: "bg-blue-500" },
  { id: "CALCULATION", label: "Calculation", tone: "bg-violet-500" },
  { id: "QUOTE_SENT", label: "Quote Sent", tone: "bg-amber-500" },
  { id: "WON", label: "Won", tone: "bg-emerald-600" },
  { id: "LOST", label: "Lost", tone: "bg-rose-500" },
];

export default function PipelinePage() {
  const qc = useQueryClient();
  const { data: deals = [], isLoading } = useQuery<DealCard[]>({
    queryKey: ["deals"],
    queryFn: () => api("/api/deals"),
  });

  const moveStage = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: Stage }) => {
      const status = stage === "WON" ? "WON" : stage === "LOST" ? "LOST" : "OPEN";
      return api(`/api/deals/${id}`, { method: "PATCH", json: { stage, status } });
    },
    // Optimistic update for instant feedback
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey: ["deals"] });
      const prev = qc.getQueryData<DealCard[]>(["deals"]);
      qc.setQueryData<DealCard[]>(["deals"], (old) =>
        old?.map((d) => (d.id === id ? { ...d, stage } : d)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(["deals"], ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ["deals"] }),
  });

  function onDragStart(e: React.DragEvent, dealId: string) {
    e.dataTransfer.setData("text/plain", dealId);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDrop(e: React.DragEvent, stage: Stage) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const deal = deals.find((d) => d.id === id);
    if (!deal || deal.stage === stage) return;
    moveStage.mutate({ id, stage });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales Pipeline</h1>
        <p className="text-sm text-muted-foreground">
          Drag deals between stages to update their status
        </p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 min-h-[60vh]">
          {STAGES.map((stage) => {
            const stageDeals = deals.filter((d) => d.stage === stage.id);
            const totalValue = stageDeals.reduce((s, d) => s + Number(d.value), 0);

            return (
              <div
                key={stage.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => onDrop(e, stage.id)}
                className="bg-muted/40 rounded-lg p-2 flex flex-col"
              >
                <div className="flex items-center justify-between px-2 py-2 border-b mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${stage.tone}`} />
                    <span className="text-sm font-semibold">{stage.label}</span>
                  </div>
                  <Badge variant="outline">{stageDeals.length}</Badge>
                </div>
                <div className="text-xs text-muted-foreground px-2 mb-2">
                  {formatMoney(totalValue)}
                </div>

                <div className="space-y-2 flex-1 overflow-y-auto">
                  {stageDeals.map((d) => (
                    <Card
                      key={d.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, d.id)}
                      className="cursor-move hover:shadow-md transition-shadow"
                    >
                      <CardContent className="p-3 space-y-1.5">
                        <Link
                          href={`/clients/${d.client.id}`}
                          className="font-medium text-sm hover:underline block truncate"
                        >
                          {d.client.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{d.client.phone}</div>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs">
                            {d.projects.length}{" "}
                            {d.projects.length === 1 ? "project" : "projects"}
                          </span>
                          <span className="text-xs font-semibold">
                            {formatMoney(d.value)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {stageDeals.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-6">
                      Drop deals here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
