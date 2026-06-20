// Pure, deterministic shelf-packing for the multi-room project sheet. All rooms
// share ONE arch scale: we pack their world boxes (cm) into rows, fit the packed
// extent into the drawing region, then map each room's packed (cm) origin to a
// paper-space (mm) top-left offset at that shared scale. No Date/random.
import type { SlabResult } from "@/services/calculation-engine";
import { pickArchScaleForBox, type SheetOptions } from "@/lib/cad/sheet/sheet-scale";
import type { SheetRegion } from "@/lib/cad/sheet/sheet-plan";

export interface Placement { name: string; calc: SlabResult; offXMm: number; offYMm: number; }
export interface PackResult { mmPerCm: number; ratio: number; placements: Placement[]; }

interface Box { name: string; calc: SlabResult; wCm: number; hCm: number; }

const DEFAULT_GAP_CM = 40;

/** Shelf-pack rooms (each room's world box = inner_width × inner_length in cm,
 *  plus a gapCm gutter) left-to-right wrapping into rows, then pick ONE arch
 *  scale that fits the whole packed extent into `region`, and return each room's
 *  paper-space (mm) top-left offset at that shared scale, centred in the region. */
export function packRooms(
  rooms: { name: string; calc: SlabResult }[],
  region: SheetRegion,
  opts: SheetOptions,
  gapCm: number = DEFAULT_GAP_CM,
): PackResult {
  // World box per room: inner box + a gutter (gap) on the right/bottom.
  const boxes: Box[] = rooms.map((r) => ({
    name: r.name,
    calc: r.calc,
    wCm: Math.round(r.calc.inner_width * 100) + gapCm,
    hCm: Math.round(r.calc.inner_length * 100) + gapCm,
  }));

  // Sort by box height descending (stable on equal heights via original order).
  const order = boxes.map((b, i) => ({ b, i }));
  order.sort((a, z) => (z.b.hCm - a.b.hCm) || (a.i - z.i));
  const sorted = order.map((o) => o.b);

  // Row-width budget: aim for a packed aspect roughly matching the region.
  // budget = sqrt(totalArea × regionAspect) gives a deterministic, reasonable
  // wrap width; clamp so it never sits below the widest single box.
  const totalArea = sorted.reduce((s, b) => s + b.wCm * b.hCm, 0);
  const regionAspect = region.wMm / region.hMm;
  const widest = sorted.reduce((m, b) => Math.max(m, b.wCm), 0);
  const budget = Math.max(widest, Math.sqrt(totalArea * regionAspect));

  // Lay out left-to-right, wrapping to a new shelf when the next box would
  // exceed the budget. Each shelf's height = the tallest box placed in it.
  type Packed = { box: Box; xCm: number; yCm: number };
  const packed: Packed[] = [];
  let cursorX = 0;
  let shelfY = 0;
  let shelfH = 0;
  let extentW = 0;

  for (const b of sorted) {
    if (cursorX > 0 && cursorX + b.wCm > budget) {
      // Wrap: advance to the next shelf.
      shelfY += shelfH;
      cursorX = 0;
      shelfH = 0;
    }
    packed.push({ box: b, xCm: cursorX, yCm: shelfY });
    cursorX += b.wCm;
    shelfH = Math.max(shelfH, b.hCm);
    extentW = Math.max(extentW, cursorX);
  }
  const extentH = shelfY + shelfH;

  // One shared scale for the whole packed extent.
  const scale = pickArchScaleForBox(extentW, extentH, region.wMm, region.hMm);
  const mmPerCm = scale.mmPerCm;

  // Centre the packed block within the region.
  const drawnWMm = extentW * mmPerCm;
  const drawnHMm = extentH * mmPerCm;
  const padXMm = (region.wMm - drawnWMm) / 2;
  const padYMm = (region.hMm - drawnHMm) / 2;

  const placements: Placement[] = packed.map((p) => ({
    name: p.box.name,
    calc: p.box.calc,
    offXMm: region.xMm + padXMm + p.xCm * mmPerCm,
    offYMm: region.yMm + padYMm + p.yCm * mmPerCm,
  }));

  return { mmPerCm, ratio: scale.ratio, placements };
}
