"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/fetcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/utils";

interface Project {
  id: string;
  name: string | null;
  shapeType: string;
  dimensions: { width?: number; length?: number; widths?: number[] };
  createdAt: string;
  deal: {
    id: string;
    stage: string;
    client: { id: string; name: string; phone: string };
  };
  calculations: Array<{
    id: string;
    name: string | null;
    inputWidth: string;
    inputLength: string;
    beamLength: string;
    rowsInitial: number;
    rowsFinal: number;
    beamCount: number;
    beamGroups: { length: number; qty: number }[];
    blocksPerRow: number;
    totalBlocks: number;
    actualLength: string;
    correctedLength: string;
    pricePerM2: string | null;
    totalSum: string | null;
    createdAt: string;
  }>;
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["projects-all"],
    queryFn: () => api("/api/projects"),
  });

  const project = projects.find((p) => p.id === params.id);

  if (isLoading) return <div className="text-muted-foreground p-8">Loading project...</div>;
  if (!project) return <div className="p-8">Project not found</div>;

  const totals = project.calculations.reduce(
    (acc, c) => ({
      blocks: acc.blocks + c.totalBlocks,
      beams: acc.beams + c.beamCount,
      area: acc.area + Number(c.inputWidth) * Number(c.inputLength),
      sum: acc.sum + Number(c.totalSum || 0),
    }),
    { blocks: 0, beams: 0, area: 0, sum: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/projects"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" asChild size="sm">
            <Link href={`/quotes/new?projectId=${project.id}`}>
              <FileText className="h-4 w-4 mr-2" /> New Quote
            </Link>
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-lg border p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-primary">
              {project.name || `Project ${project.id.slice(-6)}`}
            </h1>
            <p className="text-muted-foreground mt-1">
              Client: <span className="text-foreground font-medium">{project.deal.client.name}</span> · {project.deal.client.phone}
            </p>
          </div>
          <div className="flex gap-6 text-sm">
            <div className="text-right">
              <div className="text-muted-foreground uppercase text-[10px] font-bold">Total Sum</div>
              <div className="text-2xl font-black text-green-600">{formatNumber(totals.sum, 0)}</div>
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-lg">Calculation Summary (Rooms)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
                <tr>
                  <th className="px-3 py-2 border-b bg-yellow-50">Name (Хона номи)</th>
                  <th className="px-3 py-2 border-b text-center bg-yellow-50">W (Эни)</th>
                  <th className="px-3 py-2 border-b text-center bg-yellow-50">L (Бўйи)</th>
                  <th className="px-3 py-2 border-b text-center bg-green-50">Beam Len (Б.Уз.)</th>
                  <th className="px-3 py-2 border-b text-center">Blks/Row (1 қат)</th>
                  <th className="px-3 py-2 border-b text-center bg-orange-50">Total Blks (Жами)</th>
                  <th className="px-3 py-2 border-b text-center bg-gray-100">Beams (Балка)</th>
                  <th className="px-3 py-2 border-b text-center">Area (Майдон)</th>
                  <th className="px-3 py-2 border-b text-center bg-green-50">Price (Нарх)</th>
                  <th className="px-3 py-2 border-b text-right">Sum (Сумма)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {project.calculations.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-3 py-2 font-medium bg-yellow-50/20">{c.name || "Unnamed Room"}</td>
                    <td className="px-3 py-2 text-center bg-yellow-50/20">{formatNumber(c.inputWidth, 1)}</td>
                    <td className="px-3 py-2 text-center bg-yellow-50/20">{formatNumber(c.inputLength, 1)}</td>
                    <td className="px-3 py-2 text-center font-bold bg-green-50/20 text-green-800">{formatNumber(c.beamLength, 2)}</td>
                    <td className="px-3 py-2 text-center">{c.blocksPerRow}</td>
                    <td className="px-3 py-2 text-center font-black bg-orange-50/20 text-orange-800">{c.totalBlocks}</td>
                    <td className="px-3 py-2 text-center font-black bg-gray-100/50">{c.beamCount}</td>
                    <td className="px-3 py-2 text-center font-bold">{c.coveredArea ? formatNumber(c.coveredArea, 2) : "—"}</td>
                    <td className="px-3 py-2 text-center font-bold bg-green-50/20 text-green-800">{c.pricePerM2 ? formatNumber(c.pricePerM2, 0) : "—"}</td>
                    <td className="px-3 py-2 text-right font-black text-green-700">
                      {c.totalSum ? formatNumber(c.totalSum, 0) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/20 font-black border-t-2 border-primary/10">
                <tr>
                  <td className="px-3 py-3 text-right" colSpan={5}>TOTALS (ЖАМИ):</td>
                  <td className="px-3 py-3 text-center text-orange-800 bg-orange-50/50">{totals.blocks}</td>
                  <td className="px-3 py-3 text-center bg-gray-100">{totals.beams}</td>
                  <td className="px-3 py-3 text-center text-xs">{formatNumber(totals.area, 2)} m²</td>
                  <td className="px-3 py-3 text-right text-green-800 bg-green-50/50 text-lg" colSpan={2}>{formatNumber(totals.sum, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Logistics Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
             <div className="flex justify-between border-b pb-2">
               <span className="text-muted-foreground">Total Beam Pieces</span>
               <span className="font-bold">{totals.beams}</span>
             </div>
             <div className="flex justify-between border-b pb-2">
               <span className="text-muted-foreground">Total Block Pieces</span>
               <span className="font-bold">{totals.blocks}</span>
             </div>
             <div className="flex justify-between">
               <span className="text-muted-foreground">Total Covered Area</span>
               <span className="font-bold">{formatNumber(totals.area, 2)} m²</span>
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
