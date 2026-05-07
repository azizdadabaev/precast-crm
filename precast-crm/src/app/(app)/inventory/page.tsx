"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sliders, Package, Layers } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdjustStockDialog } from "@/components/inventory/AdjustStockDialog";
import {
  formatInventoryLabel,
  stockTier,
  type InventoryKind,
} from "@/lib/inventory";
import { formatDate } from "@/lib/utils";

interface Movement {
  id: string;
  change: number;
  resultingQuantity: number;
  reason: "PRODUCTION" | "DELIVERY" | "MANUAL_ADJUSTMENT" | "CANCELLATION_RESTOCK";
  note: string | null;
  createdAt: string;
  order: { id: string; orderNumber: string } | null;
  actor: { id: string; name: string } | null;
}

interface InventoryItem {
  id: string;
  kind: InventoryKind;
  beamLength: string | null;
  quantity: number;
  lowStockThreshold: number;
  updatedAt: string;
  movements: Movement[];
}

interface Me {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "SALES" | "ENGINEER";
}

export default function InventoryPage() {
  const qc = useQueryClient();

  const { data: me } = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => api("/api/auth/me"),
  });

  const { data: items = [], isLoading } = useQuery<InventoryItem[]>({
    queryKey: ["inventory"],
    queryFn: () => api("/api/inventory"),
  });

  const isAdmin = me?.role === "ADMIN";

  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);

  const updateThreshold = useMutation({
    mutationFn: ({ id, threshold }: { id: string; threshold: number }) =>
      api(`/api/inventory/${id}`, {
        method: "PATCH",
        json: { lowStockThreshold: threshold },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });

  const adjustStock = useMutation({
    mutationFn: ({ id, delta, note }: { id: string; delta: number; note: string }) =>
      api(`/api/inventory/${id}/adjust`, {
        method: "POST",
        json: { delta, note },
      }),
    onSuccess: () => {
      setAdjustItem(null);
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
  });

  const beams = items.filter((i) => i.kind === "BEAM");
  const blocks = items.filter((i) => i.kind === "BLOCK");

  const totalBeams = beams.reduce((s, i) => s + i.quantity, 0);
  const totalBlocks = blocks.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Омбор <span className="text-muted-foreground font-normal text-base">· Warehouse</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          On-hand stock, low-stock thresholds, and recent movements per SKU.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SummaryCard
          icon={<Package className="h-5 w-5 text-emerald-600" />}
          label="Балка · Beams in stock"
          value={totalBeams}
          rows={beams.length}
        />
        <SummaryCard
          icon={<Layers className="h-5 w-5 text-orange-600" />}
          label="Ғишт · Blocks in stock"
          value={totalBlocks}
          rows={blocks.length}
        />
      </div>

      {/* Beams */}
      <Section title="Балкалар · Beams" subtitle="One row per manufactured length">
        {isLoading ? (
          <div className="text-muted-foreground p-4">Loading…</div>
        ) : beams.length === 0 ? (
          <div className="text-muted-foreground p-4 text-center">
            No beam stock yet — log a production entry to populate.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Length</th>
                <th className="text-right px-3 py-2">Qty</th>
                <th className="text-right px-3 py-2">Low-stock at</th>
                <th className="text-left px-3 py-2">Recent movements</th>
                <th className="px-3 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {beams.map((it) => (
                <Row
                  key={it.id}
                  item={it}
                  isAdmin={!!isAdmin}
                  onAdjust={() => setAdjustItem(it)}
                  onSetThreshold={(t) => updateThreshold.mutate({ id: it.id, threshold: t })}
                />
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Blocks */}
      <Section title="Ғиштлар · Blocks" subtitle="Single SKU">
        {blocks.length === 0 ? (
          <div className="text-muted-foreground p-4 text-center">
            No block stock yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-right px-3 py-2">Qty</th>
                <th className="text-right px-3 py-2">Low-stock at</th>
                <th className="text-left px-3 py-2">Recent movements</th>
                <th className="px-3 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {blocks.map((it) => (
                <Row
                  key={it.id}
                  item={it}
                  isAdmin={!!isAdmin}
                  onAdjust={() => setAdjustItem(it)}
                  onSetThreshold={(t) => updateThreshold.mutate({ id: it.id, threshold: t })}
                />
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <AdjustStockDialog
        open={!!adjustItem}
        onClose={() => setAdjustItem(null)}
        currentQuantity={adjustItem?.quantity ?? 0}
        label={
          adjustItem
            ? formatInventoryLabel(
                adjustItem.kind,
                adjustItem.beamLength ? Number(adjustItem.beamLength) : null,
              )
            : ""
        }
        onSubmit={async (delta, note) => {
          if (!adjustItem) return;
          await adjustStock.mutateAsync({ id: adjustItem.id, delta, note });
        }}
      />
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  rows,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  rows: number;
}) {
  return (
    <div className="rounded-lg border bg-background p-4 shadow-sm">
      <div className="flex items-center gap-2">
        {icon}
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {label}
        </div>
      </div>
      <div className="text-3xl font-black tabular-nums mt-1">{value}</div>
      <div className="text-xs text-muted-foreground">
        {rows} SKU{rows === 1 ? "" : "s"}
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-background overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/20">
        <div className="text-sm font-bold">{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

const REASON_BADGE: Record<Movement["reason"], { label: string; cls: string }> = {
  PRODUCTION:           { label: "+production",  cls: "bg-emerald-100 text-emerald-800" },
  DELIVERY:             { label: "−delivery",    cls: "bg-rose-100 text-rose-800" },
  MANUAL_ADJUSTMENT:    { label: "manual",       cls: "bg-amber-100 text-amber-800" },
  CANCELLATION_RESTOCK: { label: "+restock",     cls: "bg-sky-100 text-sky-800" },
};

function Row({
  item,
  isAdmin,
  onAdjust,
  onSetThreshold,
}: {
  item: InventoryItem;
  isAdmin: boolean;
  onAdjust: () => void;
  onSetThreshold: (t: number) => void;
}) {
  const tier = stockTier(item.quantity, item.lowStockThreshold);
  const tierCls =
    tier === "critical"
      ? "bg-rose-50 text-rose-900"
      : tier === "low"
        ? "bg-amber-50 text-amber-900"
        : "";

  const length = item.beamLength ? Number(item.beamLength) : null;
  const label = formatInventoryLabel(item.kind, length);

  const [draftThreshold, setDraftThreshold] = useEditableThreshold(item.lowStockThreshold);

  return (
    <tr className={`hover:bg-muted/20 ${tierCls}`}>
      <td className="px-3 py-2 font-semibold">{label}</td>
      <td className="px-3 py-2 text-right tabular-nums font-bold">
        {item.quantity}
        {item.quantity < 0 && (
          <span className="ml-2 text-[10px] uppercase tracking-wider bg-rose-200 text-rose-900 px-1.5 py-0.5 rounded">
            Negative
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {isAdmin ? (
          <Input
            type="number"
            min="0"
            className="h-7 w-20 text-right tabular-nums ml-auto"
            value={draftThreshold}
            onChange={(e) => setDraftThreshold(Number(e.target.value) || 0)}
            onBlur={() => {
              if (draftThreshold !== item.lowStockThreshold) onSetThreshold(draftThreshold);
            }}
          />
        ) : (
          <span className="text-muted-foreground">{item.lowStockThreshold}</span>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {item.movements.length === 0 ? (
            <span className="text-xs text-muted-foreground">no movements yet</span>
          ) : (
            item.movements.slice(0, 5).map((m) => {
              const b = REASON_BADGE[m.reason];
              return (
                <span
                  key={m.id}
                  title={`${formatDate(m.createdAt)} · ${m.note ?? ""}${m.order ? ` · ${m.order.orderNumber}` : ""}`}
                  className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded px-1.5 py-0.5 tabular-nums ${b.cls}`}
                >
                  {b.label} {m.change > 0 ? "+" : ""}
                  {m.change}
                </span>
              );
            })
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={onAdjust}
            className="h-7 text-xs"
          >
            <Sliders className="h-3 w-3 mr-1" /> Adjust
          </Button>
        )}
      </td>
    </tr>
  );
}

// Local-mutable, but resyncs when the saved value changes (after a
// successful PATCH invalidates the inventory query).
function useEditableThreshold(initial: number): [number, (n: number) => void] {
  const [v, setV] = useState(initial);
  useEffect(() => {
    setV(initial);
  }, [initial]);
  return [v, setV];
}
