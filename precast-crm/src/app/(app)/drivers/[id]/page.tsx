"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPhone } from "@/lib/phone";
import { formatDate, formatNumber } from "@/lib/utils";

interface DriverDetail {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
  active: boolean;
  createdAt: string;
  dispatches: Array<{
    id: string;
    truckIdentifier: string | null;
    expectedCollection: string;
    dispatchedAt: string;
    returnedAt: string | null;
    order: { id: string; orderNumber: string; totalPrice: string; status: string };
  }>;
  discrepancies: Array<{
    id: string;
    expectedAmount: string;
    receivedAmount: string;
    shortfall: string;
    status: string;
    reportedAt: string;
    order: { id: string; orderNumber: string };
  }>;
}

export default function DriverDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: driver, isLoading } = useQuery<DriverDetail>({
    queryKey: ["driver", params.id],
    queryFn: () => api(`/api/drivers/${params.id}`),
  });

  if (isLoading || !driver) return <div className="text-muted-foreground p-4">Loading…</div>;

  return (
    <div className="space-y-5">
      <Link
        href="/drivers"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to drivers
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{driver.name}</h1>
        <p className="text-sm text-muted-foreground tabular-nums">{formatPhone(driver.phone)}</p>
        {driver.notes && <p className="text-xs text-muted-foreground italic mt-1">{driver.notes}</p>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent dispatches ({driver.dispatches.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {driver.dispatches.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No dispatches yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Order #</th>
                  <th className="text-left px-3 py-2">Truck</th>
                  <th className="text-right px-3 py-2">Expected</th>
                  <th className="text-left px-3 py-2">Dispatched</th>
                  <th className="text-left px-3 py-2">Returned</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {driver.dispatches.map((d) => (
                  <tr key={d.id}>
                    <td className="px-3 py-2 tabular-nums font-bold">
                      <Link href={`/orders/${d.order.id}`} className="hover:underline">
                        {d.order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs">{d.truckIdentifier ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(d.expectedCollection, 0)}</td>
                    <td className="px-3 py-2 text-xs">{formatDate(d.dispatchedAt)}</td>
                    <td className="px-3 py-2 text-xs">
                      {d.returnedAt ? formatDate(d.returnedAt) : <span className="text-amber-700">en route</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Discrepancies ({driver.discrepancies.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {driver.discrepancies.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No discrepancies on file.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Order #</th>
                  <th className="text-right px-3 py-2">Expected</th>
                  <th className="text-right px-3 py-2">Received</th>
                  <th className="text-right px-3 py-2">Short</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Reported</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {driver.discrepancies.map((d) => (
                  <tr key={d.id}>
                    <td className="px-3 py-2 tabular-nums font-bold">
                      <Link href={`/orders/${d.order.id}`} className="hover:underline">
                        {d.order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(d.expectedAmount, 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(d.receivedAmount, 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-700 font-semibold">{formatNumber(d.shortfall, 0)}</td>
                    <td className="px-3 py-2 text-xs">{d.status.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2 text-xs">{formatDate(d.reportedAt)}</td>
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
