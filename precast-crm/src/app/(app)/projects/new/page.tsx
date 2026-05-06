"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save } from "lucide-react";

interface Deal {
  id: string;
  client: { name: string; phone: string };
  stage: string;
}

import { MultiRoomCalculator, type SlabRow } from "@/components/calculation/MultiRoomCalculator";

export default function NewProjectPage() {
  const router = useRouter();

  const { data: deals = [] } = useQuery<Deal[]>({
    queryKey: ["deals"],
    queryFn: () => api("/api/deals"),
  });

  const [dealId, setDealId] = useState("");
  const [name, setName] = useState("");
  const [rows, setRows] = useState<SlabRow[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const saveProject = useMutation({
    mutationFn: async () => {
      if (rows.length === 0) throw new Error("Add at least one room");

      const project = await api<{ id: string }>("/api/projects", {
        method: "POST",
        json: {
          dealId,
          name: name || undefined,
          shapeType: "RECTANGULAR",
          dimensions: {
            width: rows[0].innerWidth,
            length: rows[0].innerLength,
            notes: `${rows.length} rooms`,
          },
          rooms: rows.map((r) => ({
            name: r.name,
            innerWidth: r.innerWidth,
            innerLength: r.innerLength,
            bearing: r.bearing,
            correction: r.correction,
            extraBeams: r.extraBeams,
            forceStartBeam: r.forceStartBeam,
            patternOverride: r.patternOverride === "AUTO" ? null : r.patternOverride,
          })),
        },
      });

      return project;
    },
    onSuccess: (project) => router.push(`/projects/${project.id}`),
    onError: (e: Error) => setError(e.message),
  });

  const canSave =
    dealId &&
    rows.length > 0 &&
    rows.every((r) => r.innerWidth > 0 && r.innerLength > 0 && r.bearing >= 0);

  return (
    <div className="space-y-5">
      <Link
        href="/projects"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to projects
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Project Builder</h1>
        <Button
          onClick={() => saveProject.mutate()}
          disabled={!canSave || saveProject.isPending}
          className="px-8 shadow-lg shadow-primary/20"
        >
          <Save className="h-4 w-4 mr-2" />
          {saveProject.isPending ? "Saving..." : "Save Project"}
        </Button>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader className="py-3 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium">Project Info (Лойиҳа маълумотлари)</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-6 items-end">
              <div className="space-y-1.5 min-w-[240px]">
                <Label className="text-xs">Deal (Мижоз / Келишув) *</Label>
                <select 
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:ring-2 focus:ring-primary"
                  value={dealId} 
                  onChange={(e) => setDealId(e.target.value)}
                >
                  <option value="">— Select deal —</option>
                  {deals.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.client.name} ({d.client.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5 flex-1 min-w-[240px]">
                <Label className="text-xs">Project Name (Лойиҳа номи - optional)</Label>
                <Input
                  className="h-9"
                  placeholder="e.g. House #1 ground floor"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {error && (
                <div className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md border border-destructive/20 h-9 flex items-center">
                  {error}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3 border-b bg-muted/20 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-primary">Calculation Table (Хоналар ҳисоб-китоби)</CardTitle>
            <div className="text-[11px] text-muted-foreground italic">
              Standard 580mm spacing · 15cm bearings
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <MultiRoomCalculator
              rows={rows}
              onChange={setRows}
              discountPercent={discountPercent}
              onDiscountChange={setDiscountPercent}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
