"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/fetcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer } from "lucide-react";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils";

interface QuoteDetail {
  id: string;
  roomsSubtotal: string;
  discountPercent: string;
  discountAmount: string;
  deliveryCost: string;
  otherCost: string;
  totalPrice: string;
  status: string;
  notes: string | null;
  createdAt: string;
  project: {
    id: string;
    name: string | null;
    shapeType: string;
    dimensions: { width?: number; length?: number; widths?: number[] };
    deal: { client: { id: string; name: string; phone: string; location: string | null } };
    calculations: Array<{
      id: string;
      name: string | null;
      pattern: "GB" | "BGB" | "GBG";
      beamCount: number;
      beamLength: string;
      totalBlocks: number;
      concreteVolume: string;
      subtotal: string;
    }>;
  };
}

const PATTERN_LABEL = { GB: "Г-Б", BGB: "Б-Г-Б", GBG: "Г-Б-Г" } as const;

export default function QuoteDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: quote, isLoading } = useQuery<QuoteDetail>({
    queryKey: ["quote", params.id],
    queryFn: () => api(`/api/quotes/${params.id}`),
  });

  if (isLoading || !quote) return <div className="text-muted-foreground">Loading…</div>;

  const dim = quote.project.dimensions;
  const dimStr = dim?.widths
    ? `${dim.widths.join(" / ")} × ${dim.length} m`
    : `${dim?.width} × ${dim?.length} m`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/quotes"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to quotes
        </Link>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" /> Print
        </Button>
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>Quote #{quote.id.slice(-8).toUpperCase()}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Issued {formatDate(quote.createdAt)}
            </p>
          </div>
          <Badge
            variant={
              quote.status === "ACCEPTED"
                ? "success"
                : quote.status === "REJECTED"
                  ? "destructive"
                  : quote.status === "SENT"
                    ? "warning"
                    : "secondary"
            }
          >
            {quote.status}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Client
              </div>
              <div className="font-semibold">{quote.project.deal.client.name}</div>
              <div className="text-sm text-muted-foreground">
                {quote.project.deal.client.phone}
              </div>
              {quote.project.deal.client.location && (
                <div className="text-sm text-muted-foreground">
                  {quote.project.deal.client.location}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Project
              </div>
              <div className="font-semibold">
                {quote.project.name || `Project ${quote.project.id.slice(-6)}`}
              </div>
              <div className="text-sm text-muted-foreground">
                {quote.project.shapeType} · {dimStr}
              </div>
            </div>
          </div>

          {quote.project.calculations.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Rooms
              </div>
              <table className="excel-table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th className="text-center">Pattern</th>
                    <th className="text-center">Beam length</th>
                    <th className="text-center">Beams</th>
                    <th className="text-center">Blocks</th>
                    <th className="text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.project.calculations.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name || "—"}</td>
                      <td className="text-center">{PATTERN_LABEL[c.pattern]}</td>
                      <td className="text-center">{formatNumber(c.beamLength, 2)} m</td>
                      <td className="text-center">{c.beamCount}</td>
                      <td className="text-center">{c.totalBlocks}</td>
                      <td className="text-right">{formatMoney(c.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Pricing
            </div>
            <table className="excel-table">
              <thead>
                <tr>
                  <th>Line</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Rooms subtotal</td>
                  <td className="text-right">{formatMoney(quote.roomsSubtotal)}</td>
                </tr>
                <tr>
                  <td>Discount ({formatNumber(quote.discountPercent, 1)}%)</td>
                  <td className="text-right text-rose-700">− {formatMoney(quote.discountAmount)}</td>
                </tr>
                <tr>
                  <td>Delivery</td>
                  <td className="text-right">{formatMoney(quote.deliveryCost)}</td>
                </tr>
                <tr>
                  <td>Other</td>
                  <td className="text-right">{formatMoney(quote.otherCost)}</td>
                </tr>
                <tr className="bg-muted/40">
                  <td className="font-bold text-base">TOTAL</td>
                  <td className="text-right font-bold text-base">
                    {formatMoney(quote.totalPrice)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {quote.notes && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Notes
              </div>
              <p className="text-sm whitespace-pre-wrap">{quote.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
