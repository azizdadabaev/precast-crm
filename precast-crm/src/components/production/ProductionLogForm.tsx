"use client";

import { useState } from "react";
import { Plus, Trash2, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Kind = "BEAM" | "BLOCK";

interface FormLine {
  id: string;
  kind: Kind;
  beamLength: number | "";
  quantity: number | "";
}

interface Props {
  onSubmit: (payload: {
    producedAt: string; // ISO
    notes: string | null;
    lines: Array<{ kind: Kind; beamLength: number | null; quantity: number }>;
  }) => Promise<void>;
}

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function newLine(kind: Kind = "BEAM"): FormLine {
  return {
    id: Math.random().toString(36).slice(2, 9),
    kind,
    beamLength: kind === "BEAM" ? 4.30 : "",
    quantity: "",
  };
}

export function ProductionLogForm({ onSubmit }: Props) {
  const [producedAt, setProducedAt] = useState<string>(isoDateLocal(new Date()));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<FormLine[]>([newLine("BEAM")]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(id: string, patch: Partial<FormLine>) {
    setLines((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function remove(id: string) {
    setLines((rs) => (rs.length === 1 ? rs : rs.filter((r) => r.id !== id)));
  }

  const validLines = lines.filter(
    (l) =>
      l.quantity !== "" &&
      Number(l.quantity) > 0 &&
      (l.kind === "BLOCK" || (l.beamLength !== "" && Number(l.beamLength) > 0)),
  );
  const canSave = validLines.length > 0 && !submitting;

  async function submit() {
    if (!canSave) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        producedAt: new Date(producedAt + "T12:00:00").toISOString(),
        notes: notes.trim() || null,
        lines: validLines.map((l) => ({
          kind: l.kind,
          beamLength: l.kind === "BEAM" ? Number(l.beamLength) : null,
          quantity: Number(l.quantity),
        })),
      });
      // Reset on success
      setLines([newLine("BEAM")]);
      setNotes("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border bg-background p-4 shadow-sm space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider">
          Янги маҳсулот · Log production
        </h2>
        <div className="text-xs text-muted-foreground">
          Each line increments stock.
        </div>
      </div>

      {/* Header inputs */}
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
            Сана · Date
          </label>
          <Input
            type="date"
            className="h-9 w-44 mt-1"
            value={producedAt}
            onChange={(e) => setProducedAt(e.target.value)}
            max={isoDateLocal(new Date())}
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
            Изоҳ · Notes (optional)
          </label>
          <Input
            className="h-9 mt-1"
            placeholder="e.g. Shift A, lot #42"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {/* Lines */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-2 py-2 w-32">Kind</th>
              <th className="text-left px-2 py-2 w-32">Beam length</th>
              <th className="text-left px-2 py-2 w-32">Qty</th>
              <th className="px-2 py-2 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="px-2 py-2">
                  <select
                    className="h-9 w-full rounded border border-input bg-background px-2 text-sm"
                    value={l.kind}
                    onChange={(e) => {
                      const k = e.target.value as Kind;
                      update(l.id, {
                        kind: k,
                        beamLength: k === "BEAM" ? l.beamLength || 4.30 : "",
                      });
                    }}
                  >
                    <option value="BEAM">Балка · Beam</option>
                    <option value="BLOCK">Ғишт · Block</option>
                  </select>
                </td>
                <td className="px-2 py-2">
                  {l.kind === "BEAM" ? (
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="h-9 text-center tabular-nums"
                      value={l.beamLength}
                      onChange={(e) =>
                        update(l.id, {
                          beamLength: e.target.value === "" ? "" : Number(e.target.value),
                        })
                      }
                      placeholder="4.30"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">— (single SKU)</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    className="h-9 text-center tabular-nums"
                    value={l.quantity}
                    onChange={(e) =>
                      update(l.id, {
                        quantity: e.target.value === "" ? "" : Number(e.target.value),
                      })
                    }
                    placeholder="0"
                  />
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    onClick={() => remove(l.id)}
                    disabled={lines.length === 1}
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLines((rs) => [...rs, newLine("BEAM")])}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add line
        </Button>

        <div className="flex items-center gap-3">
          {error && (
            <span className="text-sm text-destructive">{error}</span>
          )}
          <Button onClick={submit} disabled={!canSave}>
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Production Log
          </Button>
        </div>
      </div>
    </div>
  );
}
