"use client";

/** Unplaced rooms, kanban-style: drag a card onto the board to place it. */
import * as React from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { SlabRow } from "@/components/calculation/MultiRoomCalculator";
import { isPlaceable } from "@/lib/layout-board/model";
import { fmtFixed } from "@/lib/layout-board/format";
import { TRAY_DRAG_TYPE } from "./BoardCanvas";

export function Tray({ rows }: { rows: SlabRow[] }) {
  const t = useT();
  const waiting = rows
    .map((r, i) => ({ r, n: i + 1 }))
    .filter(({ r }) => !r.layout);

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-2">
      {waiting.length === 0 ? (
        <p className="p-2 text-sm text-muted-foreground">{t("Ҳамма хоналар жойлаштирилди", "All rooms are placed")}</p>
      ) : (
        waiting.map(({ r, n }) => {
          const extras = r.result?.is_extras_only === true;
          const ready = isPlaceable(r);
          return (
            <div
              key={r.id}
              draggable={ready}
              onDragStart={(e) => {
                e.dataTransfer.setData(TRAY_DRAG_TYPE, r.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              className={cn(
                "min-h-[44px] rounded-md border bg-card px-3 py-2 text-sm",
                ready ? "cursor-grab hover:border-primary active:cursor-grabbing" : "cursor-not-allowed opacity-60",
              )}
              title={ready ? t("Тахтага судраб ўтказинг", "Drag onto the board") : undefined}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-primary tabular-nums">{n}</span>
                <span className="truncate text-muted-foreground">{r.name}</span>
              </div>
              <div className="font-mono tabular-nums">
                {extras
                  ? t("қўшимча балка", "extra beams")
                  : r.result
                    ? `${fmtFixed(r.innerWidth)} × ${fmtFixed(r.innerLength)}`
                    : t("ҳисобланмаган", "not calculated")}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
