"use client";

/**
 * «Жойлашув» panel under the calculator table: tray of unplaced rooms + the board.
 * Folded until the first room is placed. Positions never change any number.
 */
import * as React from "react";
import { ChevronDown, LayoutGrid, Maximize2, Minus, Plus, Redo2, RotateCw, Undo2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { useCalculatorStore } from "@/store/calculator";
import { roomRect } from "@/lib/layout-board/model";
import { autoArrange } from "@/lib/layout-board/arrange";
import { BoardCanvas, fitView, type BoardView } from "./BoardCanvas";
import { Tray } from "./Tray";

export function LayoutBoard({ exportSlot }: { exportSlot?: React.ReactNode }) {
  const t = useT();
  const rows = useCalculatorStore((s) => s.rows);
  const wallCm = useCalculatorStore((s) => s.layoutWallCm);
  const setWall = useCalculatorStore((s) => s.setLayoutWallCm);
  const applyLayouts = useCalculatorStore((s) => s.applyLayouts);
  const rotateRoom = useCalculatorStore((s) => s.rotateRoom);
  const undoLayout = useCalculatorStore((s) => s.undoLayout);
  const redoLayout = useCalculatorStore((s) => s.redoLayout);
  const canUndo = useCalculatorStore((s) => s.layoutPast.length > 0);
  const canRedo = useCalculatorStore((s) => s.layoutFuture.length > 0);

  const placedCount = rows.filter((r) => r.layout).length;
  const roomCount = rows.filter((r) => r.result && !r.result.is_extras_only).length;
  const [open, setOpen] = React.useState(placedCount > 0);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [view, setView] = React.useState<BoardView>({ scale: 0.12, ox: 40, oy: 40 });
  const boxRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (placedCount > 0) setOpen(true);
  }, [placedCount]);

  const fitAll = React.useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    const rects = rows.filter((r) => r.layout && r.result).map((r) => roomRect(r, r.layout!));
    setView(fitView(rects, wallCm, el.clientWidth, el.clientHeight));
  }, [rows, wallCm]);

  function arrange() {
    const placed = new Map(rows.filter((r) => r.layout).map((r) => [r.id, r.layout!]));
    const added = autoArrange(rows, placed, wallCm);
    if (added.size === 0) return;
    applyLayouts(added);
    requestAnimationFrame(fitAll);
  }

  const zoom = (k: number) => {
    const el = boxRef.current;
    const cx = (el?.clientWidth ?? 0) / 2;
    const cy = (el?.clientHeight ?? 0) / 2;
    setView((v) => {
      const scale = Math.max(0.02, Math.min(2, v.scale * k));
      const f = scale / v.scale;
      return { scale, ox: cx - (cx - v.ox) * f, oy: cy - (cy - v.oy) * f };
    });
  };

  return (
    <section className="mt-6 rounded-lg border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-[44px] items-center gap-2 text-lg font-semibold"
          aria-expanded={open}
        >
          <LayoutGrid className="h-5 w-5" />
          {t("Жойлашув", "Layout")}
          <span className="text-sm font-normal text-muted-foreground tabular-nums">
            {placedCount} / {roomCount} {t("хона жойлаштирилди", "rooms placed")}
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              {t("Девор", "Wall")}
              <input
                type="number"
                min={0}
                max={100}
                value={wallCm}
                onChange={(e) => setWall(Number(e.target.value) || 0)}
                className="h-9 w-16 rounded-md border bg-background px-2 text-right font-mono tabular-nums text-foreground"
              />
              {t("см", "cm")}
            </label>
            <Button variant="outline" size="sm" onClick={arrange} title={t("Жойлаштирилмаган хоналарни қаторга қўйиш", "Put unplaced rooms in a row")}>
              <Wand2 className="mr-1 h-4 w-4" /> {t("Автоматик жойлаш", "Auto-arrange")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => selectedId && rotateRoom(selectedId)} disabled={!selectedId} title={t("90° буриш (R)", "Turn 90° (R)")}>
              <RotateCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={undoLayout} disabled={!canUndo} title={t("Ортга (Ctrl+Z)", "Undo (Ctrl+Z)")}>
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={redoLayout} disabled={!canRedo} title={t("Олдинга (Ctrl+Y)", "Redo (Ctrl+Y)")}>
              <Redo2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => zoom(1 / 1.25)} title={t("Кичрайтириш", "Zoom out")}>
              <Minus className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => zoom(1.25)} title={t("Катталаштириш", "Zoom in")}>
              <Plus className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={fitAll} title={t("Ҳаммасини кўрсатиш", "Fit all")}>
              <Maximize2 className="h-4 w-4" />
            </Button>
            {exportSlot}
          </div>
        )}
      </header>
      {open && (
        <div className="flex h-[560px]">
          <aside className="w-56 shrink-0 border-r bg-muted/40">
            <Tray rows={rows} />
          </aside>
          <div ref={boxRef} className="relative flex-1 overflow-hidden bg-background">
            <BoardCanvas
              rows={rows}
              wallCm={wallCm}
              view={view}
              onViewChange={setView}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            {placedCount === 0 && (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-muted-foreground">
                {t(
                  "Хонани чапдан шу ерга судранг ёки «Автоматик жойлаш» тугмасини босинг",
                  "Drag a room here from the left, or press «Auto-arrange»",
                )}
              </p>
            )}
            <p className="pointer-events-none absolute bottom-2 left-3 text-xs text-muted-foreground">
              {t(
                "Судраб жойлаштиринг · Alt — ёпишмасдан · R — буриш · Delete — олиб ташлаш",
                "Drag to place · Alt — no snap · R — turn · Delete — remove",
              )}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
