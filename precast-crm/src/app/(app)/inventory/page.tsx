"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sliders, Package, Layers } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import { AdjustStockDialog } from "@/components/inventory/AdjustStockDialog";
import {
  formatInventoryLabel,
  stockTier,
  type InventoryKind,
} from "@/lib/inventory";
import { formatDate, cn } from "@/lib/utils";

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
          icon={<Package className="h-5 w-5 text-success" />}
          label="Балка · Beams in stock"
          value={totalBeams}
          rows={beams.length}
        />
        <SummaryCard
          icon={<Layers className="h-5 w-5 text-gold" />}
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
            <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Length</th>
                <th className="text-right px-3 py-2">Qty</th>
                <th className="text-right px-3 py-2">Low-stock at</th>
                <th className="text-left px-3 py-2">Recent movements</th>
                <th className="px-3 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
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
            <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-right px-3 py-2">Qty</th>
                <th className="text-right px-3 py-2">Low-stock at</th>
                <th className="text-left px-3 py-2">Recent movements</th>
                <th className="px-3 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
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
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        {icon}
      </div>
      <div className="text-2xl font-bold tabular-nums tracking-tight text-foreground leading-tight font-mono">
        {value}
      </div>
      <div className="mt-2 text-xs text-text-tertiary">
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
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted">
        <div className="text-sm font-bold">{title}</div>
        {subtitle && <div className="text-xs text-text-tertiary">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

const REASON_META: Record<
  Movement["reason"],
  { label: string; variant: React.ComponentProps<typeof Chip>["variant"] }
> = {
  PRODUCTION:           { label: "+production", variant: "success" },
  DELIVERY:             { label: "−delivery",   variant: "danger" },
  MANUAL_ADJUSTMENT:    { label: "manual",      variant: "warning" },
  CANCELLATION_RESTOCK: { label: "+restock",    variant: "default" },
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
  const rowBorder =
    tier === "critical"
      ? "border-l-destructive"
      : tier === "low"
        ? "border-l-warning"
        : "border-l-success";

  const length = item.beamLength ? Number(item.beamLength) : null;
  const label = formatInventoryLabel(item.kind, length);

  const [draftThreshold, setDraftThreshold] = useEditableThreshold(item.lowStockThreshold);

  return (
    <tr
      className={cn(
        "border-b last:border-b-0 border-border/60 hover:bg-surface-hover transition-colors",
        "border-l-[3px]",
        rowBorder,
      )}
    >
      <td className="px-3 py-2.5 font-semibold">{label}</td>
      <td className="px-3 py-2.5 text-right font-mono font-bold">
        {item.quantity}
        {item.quantity < 0 && (
          <span className="ml-2">
            <Chip variant="danger">Negative</Chip>
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right font-mono">
        {isAdmin ? (
          <Input
            type="number"
            min="0"
            className="h-7 w-20 text-right ml-auto font-mono"
            value={draftThreshold}
            onChange={(e) => setDraftThreshold(Number(e.target.value) || 0)}
            onBlur={() => {
              if (draftThreshold !== item.lowStockThreshold) onSetThreshold(draftThreshold);
            }}
          />
        ) : (
          <span className="text-text-tertiary">{item.lowStockThreshold}</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          {item.movements.length === 0 ? (
            <span className="text-xs text-text-tertiary">no movements yet</span>
          ) : (
            item.movements.slice(0, 5).map((m) => {
              const meta = REASON_META[m.reason];
              return (
                <Chip
                  key={m.id}
                  variant={meta.variant}
                  title={`${formatDate(m.createdAt)} · ${m.note ?? ""}${m.order ? ` · ${m.order.orderNumber}` : ""}`}
                >
                  {meta.label} {m.change > 0 ? "+" : ""}
                  {m.change}
                </Chip>
              );
            })
          )}
        </div>
      </td>
      <td className="px-3 py-2.5">
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
