"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/fetcher";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/lib/utils";

interface Quote {
  id: string;
  totalPrice: string;
  status: string;
  createdAt: string;
  project: {
    id: string;
    name: string | null;
    deal: { client: { id: string; name: string } };
  };
}

export default function QuotesPage() {
  const { data: quotes = [], isLoading } = useQuery<Quote[]>({
    queryKey: ["quotes"],
    queryFn: () => api("/api/quotes"),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quotes</h1>
        <p className="text-sm text-muted-foreground">
          Generate quotes from project calculations
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : quotes.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center">
              No quotes yet. Open a project to generate one.
            </div>
          ) : (
            <table className="excel-table">
              <thead>
                <tr>
                  <th>Quote #</th>
                  <th>Client</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th className="text-right">Total</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id}>
                    <td className="font-medium">
                      <Link href={`/quotes/${q.id}`} className="hover:underline">
                        {q.id.slice(-8).toUpperCase()}
                      </Link>
                    </td>
                    <td>
                      <Link
                        href={`/clients/${q.project.deal.client.id}`}
                        className="hover:underline text-muted-foreground"
                      >
                        {q.project.deal.client.name}
                      </Link>
                    </td>
                    <td>
                      <Link
                        href={`/projects/${q.project.id}`}
                        className="hover:underline text-muted-foreground"
                      >
                        {q.project.name || `Project ${q.project.id.slice(-6)}`}
                      </Link>
                    </td>
                    <td>
                      <Badge
                        variant={
                          q.status === "ACCEPTED"
                            ? "success"
                            : q.status === "REJECTED"
                              ? "destructive"
                              : q.status === "SENT"
                                ? "warning"
                                : "secondary"
                        }
                      >
                        {q.status}
                      </Badge>
                    </td>
                    <td className="text-right font-semibold">{formatMoney(q.totalPrice)}</td>
                    <td className="text-muted-foreground">{formatDate(q.createdAt)}</td>
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
