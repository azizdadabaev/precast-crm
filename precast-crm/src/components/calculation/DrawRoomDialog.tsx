"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RoomCanvas } from "@/components/cad/RoomCanvas";
import {
  type Pt,
  type BeamDir,
  type Bay,
  decomposeToBays,
  defaultBeamDir,
  bayToSlabInput,
  beamLayout,
} from "@/lib/cad/geometry";
import { calculateSlab } from "@/services/calculation-engine";
import { Bi, useT } from "@/lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Finalized bays (with their chosen beam direction) → become calculator rows. */
  onAddRooms: (bays: Bay[]) => void;
}

/**
 * Draw-a-room modal. The operator sketches a rectilinear outline; we decompose
 * it into rectangular bays, show a live beam/block overlay (driven by the same
 * `calculateSlab` engine so the picture matches the numbers), and on confirm
 * hand the bays back to the calculator as real rooms.
 */
export function DrawRoomDialog({ open, onClose, onAddRooms }: Props) {
  const t = useT();
  const [points, setPoints] = useState<Pt[]>([]);
  // Per-bay beam-direction overrides, keyed by bay index (absent → default).
  const [dirOverrides, setDirOverrides] = useState<Record<number, BeamDir>>({});

  const bays = useMemo(
    () => (points.length >= 4 ? decomposeToBays(points) : []),
    [points],
  );

  // Per-bay: resolved direction + engine result + the visual overlay.
  const rows = useMemo(
    () =>
      bays.map((rect, i) => {
        const beamDir = dirOverrides[i] ?? defaultBeamDir(rect);
        let result = null;
        try {
          result = calculateSlab(bayToSlabInput({ rect, beamDir }));
        } catch {
          result = null;
        }
        return { rect, beamDir, result };
      }),
    [bays, dirOverrides],
  );

  const beamLayers = useMemo(
    () =>
      rows.map((r) =>
        r.result
          ? beamLayout({ rect: r.rect, beamDir: r.beamDir }, r.result.beam_count, r.result.block_rows)
          : { beams: [], blockCells: [] },
      ),
    [rows],
  );

  const reset = () => {
    setPoints([]);
    setDirOverrides({});
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const setDir = (i: number, dir: BeamDir) =>
    setDirOverrides((prev) => ({ ...prev, [i]: dir }));

  const handleAdd = () => {
    if (!rows.length) return;
    onAddRooms(rows.map((r) => ({ rect: r.rect, beamDir: r.beamDir })));
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-[860px]">
        <DialogHeader>
          <DialogTitle>
            <Bi uz="Хона чизиш" en="Draw room" />
          </DialogTitle>
          <DialogDescription>
            {t(
              "Хона контурини чизинг — у тўғри тўртбурчак хоналарга бўлинади ва ҳисоб-китобга қўшилади.",
              "Sketch the room outline — it splits into rectangular bays and becomes calculator rooms.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <RoomCanvas points={points} onChange={setPoints} bays={bays} beamLayers={beamLayers} />

          <div className="space-y-2 lg:w-56">
            <div className="text-sm text-muted-foreground">
              {bays.length
                ? t(`${bays.length} та хона`, `${bays.length} bay${bays.length > 1 ? "s" : ""}`)
                : t("Ёпиқ хона чизинг (≥4 нуқта)", "Draw a closed room (≥4 points)")}
            </div>
            {rows.map((r, i) => (
              <div key={i} className="rounded border p-2 text-xs">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {t(`Хона ${i + 1}`, `Bay ${i + 1}`)} —{" "}
                    {(r.rect.w / 100).toFixed(2)}×{(r.rect.h / 100).toFixed(2)} m
                  </span>
                  <span className="inline-flex overflow-hidden rounded border">
                    {(["H", "V"] as BeamDir[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDir(i, d)}
                        className={
                          "px-2 py-0.5 " +
                          (r.beamDir === d ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground")
                        }
                      >
                        {d}
                      </button>
                    ))}
                  </span>
                </div>
                {r.result && (
                  <div className="tabular-nums text-muted-foreground">
                    {t("Балка", "Beams")}: {r.result.beam_count} · {t("Ғишт", "Blocks")}: {r.result.total_blocks}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            <Bi uz="Бекор қилиш" en="Cancel" />
          </Button>
          <Button size="sm" disabled={!rows.length} onClick={handleAdd}>
            <Bi uz="Хоналарни қўшиш" en="Add rooms" enClassName="font-normal opacity-90" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
