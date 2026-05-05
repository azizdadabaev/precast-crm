"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/fetcher";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/utils";

interface Project {
  id: string;
  name: string | null;
  shapeType: string;
  dimensions: { width?: number; length?: number; widths?: number[] };
  createdAt: string;
  calculations: Array<{
    id: string;
    beamCount: number;
    totalBlocks: number;
    concreteVolume: string;
  }>;
  deal: {
    id: string;
    stage: string;
    client: { id: string; name: string };
  };
}

export default function ProjectsPage() {
  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => api("/api/projects"),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects &amp; Calculation</h1>
          <p className="text-sm text-muted-foreground">
            Beam-and-block layout calculations for each slab
          </p>
        </div>
        <Button asChild>
          <Link href="/projects/new">
            <Plus className="h-4 w-4 mr-2" /> New Project
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : projects.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center">
              No projects yet. Create one to run a calculation.
            </div>
          ) : (
            <table className="excel-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Shape</th>
                  <th>Dimensions</th>
                  <th className="text-center">Beams</th>
                  <th className="text-center">Blocks</th>
                  <th className="text-right">Concrete (m³)</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const calc = p.calculations[0];
                  const dim = p.dimensions;
                  const dimStr = dim?.widths
                    ? `${dim.widths.join("/")} × ${dim.length} m`
                    : `${dim?.width ?? "?"} × ${dim?.length ?? "?"} m`;
                  return (
                    <tr key={p.id}>
                      <td className="font-medium">
                        <Link href={`/projects/${p.id}`} className="hover:underline">
                          {p.name || `Project ${p.id.slice(-6)}`}
                        </Link>
                      </td>
                      <td>
                        <Link
                          href={`/clients/${p.deal.client.id}`}
                          className="hover:underline text-muted-foreground"
                        >
                          {p.deal.client.name}
                        </Link>
                      </td>
                      <td>
                        <Badge variant="outline">{p.shapeType}</Badge>
                      </td>
                      <td>{dimStr}</td>
                      <td className="text-center">{calc?.beamCount ?? "—"}</td>
                      <td className="text-center">{calc?.totalBlocks ?? "—"}</td>
                      <td className="text-right">
                        {calc ? formatNumber(calc.concreteVolume, 3) : "—"}
                      </td>
                      <td className="text-muted-foreground">{formatDate(p.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
