"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/fetcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus } from "lucide-react";
import { formatMoney, formatDate } from "@/lib/utils";

interface ClientDetail {
  id: string;
  name: string;
  phone: string;
  location: string | null;
  language: string;
  source: string | null;
  notes: string | null;
  createdAt: string;
  deals: Array<{
    id: string;
    stage: string;
    status: string;
    value: string;
    createdAt: string;
    projects: Array<{ id: string }>;
  }>;
}

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: client, isLoading } = useQuery<ClientDetail>({
    queryKey: ["client", params.id],
    queryFn: () => api(`/api/clients/${params.id}`),
  });

  const createDeal = useMutation({
    mutationFn: () =>
      api("/api/deals", { method: "POST", json: { clientId: params.id, stage: "NEW_LEAD" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client", params.id] }),
  });

  if (isLoading || !client) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-5">
      <Link
        href="/clients"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to clients
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{client.name}</h1>
          <p className="text-sm text-muted-foreground">{client.phone}</p>
        </div>
        <Button onClick={() => createDeal.mutate()}>
          <Plus className="h-4 w-4 mr-2" /> New Deal
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Phone" value={client.phone} />
            <Row label="Location" value={client.location ?? "—"} />
            <Row label="Language" value={client.language} />
            <Row label="Source" value={client.source ?? "—"} />
            <Row label="Created" value={formatDate(client.createdAt)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">
              {client.notes || <span className="text-muted-foreground">No notes</span>}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Deals ({client.deals.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {client.deals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deals yet</p>
          ) : (
            <table className="excel-table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Status</th>
                  <th className="text-right">Value</th>
                  <th className="text-center">Projects</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {client.deals.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Badge variant="outline">{d.stage}</Badge>
                    </td>
                    <td>
                      <Badge
                        variant={
                          d.status === "WON"
                            ? "success"
                            : d.status === "LOST"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {d.status}
                      </Badge>
                    </td>
                    <td className="text-right">{formatMoney(d.value)}</td>
                    <td className="text-center">{d.projects.length}</td>
                    <td className="text-muted-foreground">{formatDate(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
