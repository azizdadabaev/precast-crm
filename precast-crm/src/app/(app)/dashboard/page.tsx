"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatDate } from "@/lib/utils";
import {
  Users,
  Briefcase,
  TrendingUp,
  DollarSign,
  Target,
  Activity,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface DashboardData {
  totals: {
    totalLeads: number;
    totalDeals: number;
    wonDeals: number;
    totalRevenue: number;
    avgDealValue: number;
    conversionRate: number;
  };
  dealsByStage: { stage: string; count: number; value: number }[];
  leadsBySource: { source: string; count: number }[];
  recentDeals: Array<{
    id: string;
    stage: string;
    status: string;
    value: string;
    createdAt: string;
    client: { name: string; phone: string };
  }>;
}

const STAGE_LABELS: Record<string, string> = {
  NEW_LEAD: "New Lead",
  CONTACTED: "Contacted",
  CALCULATION: "Calculation",
  QUOTE_SENT: "Quote Sent",
  WON: "Won",
  LOST: "Lost",
};

const PIE_COLORS = ["#1e40af", "#0891b2", "#0d9488", "#65a30d", "#ca8a04", "#dc2626"];

export default function DashboardPage() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => api("/api/dashboard"),
  });

  if (isLoading || !data) {
    return <div className="text-muted-foreground">Loading dashboard…</div>;
  }

  const { totals, dealsByStage, leadsBySource, recentDeals } = data;

  const stageChartData = dealsByStage.map((d) => ({
    name: STAGE_LABELS[d.stage] ?? d.stage,
    deals: d.count,
    value: d.value,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your sales pipeline and revenue
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard label="Total Leads" value={totals.totalLeads.toString()} icon={Users} />
        <KpiCard label="Total Deals" value={totals.totalDeals.toString()} icon={Briefcase} />
        <KpiCard label="Won Deals" value={totals.wonDeals.toString()} icon={Target} accent="success" />
        <KpiCard
          label="Conversion Rate"
          value={`${totals.conversionRate}%`}
          icon={TrendingUp}
        />
        <KpiCard
          label="Avg Deal Value"
          value={formatMoney(totals.avgDealValue)}
          icon={Activity}
        />
        <KpiCard
          label="Revenue (paid)"
          value={formatMoney(totals.totalRevenue)}
          icon={DollarSign}
          accent="success"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Deals by Stage</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageChartData}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="deals" fill="#1e40af" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Leads by Source</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {leadsBySource.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={leadsBySource}
                    dataKey="count"
                    nameKey="source"
                    outerRadius={80}
                    label
                  >
                    {leadsBySource.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent deals */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Deals</CardTitle>
        </CardHeader>
        <CardContent>
          {recentDeals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deals yet</p>
          ) : (
            <table className="excel-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Phone</th>
                  <th>Stage</th>
                  <th>Status</th>
                  <th className="text-right">Value</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {recentDeals.map((d) => (
                  <tr key={d.id}>
                    <td className="font-medium">{d.client.name}</td>
                    <td className="text-muted-foreground">{d.client.phone}</td>
                    <td>
                      <Badge variant="outline">{STAGE_LABELS[d.stage] ?? d.stage}</Badge>
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

function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "success";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <Icon
            className={`h-4 w-4 ${accent === "success" ? "text-emerald-600" : "text-muted-foreground"}`}
          />
        </div>
        <div className="text-2xl font-bold mt-2 truncate">{value}</div>
      </CardContent>
    </Card>
  );
}
