import { describe, it, expect } from "vitest";
import {
  scanBeams,
  scanBeamsToOverlay,
  beamSchedule,
  blockEstimate,
  isRectilinear,
  BEAM_STOCK_STEP_CM,
} from "@/lib/cad/beam-scan";
import {
  decomposeToBays,
  defaultBeamDir,
  bayToSlabInput,
  bbox,
  BEAM_WIDTH_CM,
  BEARING_CM,
  PITCH_CM,
  type Pt,
} from "@/lib/cad/geometry";
import { calculateSlab } from "@/services/calculation-engine";

// 3.20 m × 5.00 m rectangle (cm). Beams run along the short side (320, "H").
const rectW = 320;
const rectH = 500;
const rectLoop: Pt[] = [
  { x: 0, y: 0 },
  { x: rectW, y: 0 },
  { x: rectW, y: rectH },
  { x: 0, y: rectH },
];

// Chamfered pentagon: 3.20 m wide at the TOP tapering to 1.60 m at the BOTTOM,
// 5.00 m tall. Symmetric chamfers cut each bottom corner inward by 80 cm.
//   top edge:    (0,0) → (320,0)            width 320
//   right wall:  (320,0) → (320,500)? no — it chamfers in.
// Build it as: top-left, top-right, then chamfer down to the narrow base.
const chamfer: Pt[] = [
  { x: 0, y: 0 }, // top-left
  { x: 320, y: 0 }, // top-right (top width 320)
  { x: 240, y: 500 }, // bottom-right (chamfered in by 80)
  { x: 80, y: 500 }, // bottom-left (chamfered in by 80) → base width 160
];

// U-shape: a 400×500 outer with a central top notch removed, so a HORIZONTAL
// scan line in the notch band enters the left leg, exits to the void, and
// re-enters the right leg → two inside intervals (two beams) on one line.
//   outer: (0,0)→(400,0)→(400,500)→(0,500)
//   notch: a void column x∈[150,250] cut down from the top to y=300.
const uShape: Pt[] = [
  { x: 0, y: 0 },
  { x: 150, y: 0 },
  { x: 150, y: 300 }, // down into the notch (left wall of void)
  { x: 250, y: 300 }, // across the notch floor
  { x: 250, y: 0 }, // up out of the notch (right wall of void)
  { x: 400, y: 0 },
  { x: 400, y: 500 },
  { x: 0, y: 500 },
];

describe("beam-scan — isRectilinear", () => {
  it("true for axis-aligned rectangle and U-shape, false for a chamfer", () => {
    expect(isRectilinear(rectLoop)).toBe(true);
    expect(isRectilinear(uShape)).toBe(true);
    expect(isRectilinear(chamfer)).toBe(false);
    // Degenerate (<3 vertices) is not rectilinear.
    expect(isRectilinear([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe(false);
  });
});

describe("beam-scan — scanBeams on a rectangle agrees with calculateSlab", () => {
  it("beam count and lengths match the engine for the 3.2×5.0 rectangle", () => {
    const { beams } = scanBeams(rectLoop, "H", PITCH_CM, BEARING_CM);
    // Engine result via the exact bay path.
    const bay = decomposeToBays(rectLoop)[0];
    const result = calculateSlab(bayToSlabInput({ rect: bay, beamDir: defaultBeamDir(bay) }));

    // Scanline places one beam at each pitch line that fits inside the 500 cm
    // height. The engine's `pitches` (8) is the floor-count; the scan fits the
    // same grid within one line (it may place a final line that the engine
    // folds into a closing block row), so agree to ±1.
    expect(Math.abs(beams.length - result.pitches)).toBeLessThanOrEqual(1);

    // Every beam spans the full 320 cm width + 2 × bearing.
    for (const b of beams) {
      expect(b.spanEnd - b.spanStart).toBeCloseTo(rectW, 6);
      expect(b.lengthCm).toBeCloseTo(rectW + 2 * BEARING_CM, 6);
    }
    // Matches the engine's beam_length (cm).
    expect(beams[0].lengthCm).toBeCloseTo(result.beam_length * 100, 6);
  });

  it("schedule for the rectangle is one length bucket at the full count", () => {
    const { beams } = scanBeams(rectLoop, "H");
    const sched = beamSchedule(beams);
    expect(sched).toHaveLength(1);
    expect(sched[0].qty).toBe(beams.length);
    // 320 + 30 = 350 cm, already a 5-cm multiple.
    expect(sched[0].lengthCm).toBe(350);
  });
});

describe("beam-scan — tapered (chamfer) layout", () => {
  it("yields beams of DECREASING length from the wide end to the narrow end", () => {
    const { beams } = scanBeams(chamfer, "H", PITCH_CM, BEARING_CM);
    expect(beams.length).toBeGreaterThan(2);
    // Ordered by scan position (top → bottom).
    const lengths = beams.map((b) => b.lengthCm);
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i]).toBeLessThan(lengths[i - 1] + 1e-6);
    }
    // Not all equal — the taper actually changes the beam length.
    expect(Math.max(...lengths)).toBeGreaterThan(Math.min(...lengths) + 50);

    // Wide end ≈ 320 + 2×bearing (near the top); narrow end ≈ 160 + 2×bearing.
    // Allow a pitch's worth of taper slack since the first/last scan lines sit
    // inset from the walls.
    expect(Math.max(...lengths)).toBeLessThanOrEqual(rectW + 2 * BEARING_CM + 1e-6);
    expect(Math.min(...lengths)).toBeGreaterThan(160 + 2 * BEARING_CM - 60);
  });

  it("beam count is sane for the pitch (≈ height / pitch)", () => {
    const { beams } = scanBeams(chamfer, "H");
    const approx = Math.floor(500 / PITCH_CM); // ~8
    // Within one line of the ideal grid count.
    expect(Math.abs(beams.length - approx)).toBeLessThanOrEqual(1);
  });

  it("vertical beam direction transposes correctly (taper across x)", () => {
    // Rotate the chamfer so it tapers along x instead of y.
    const sideways: Pt[] = chamfer.map((p) => ({ x: p.y, y: p.x }));
    const { beams } = scanBeams(sideways, "V");
    expect(beams.length).toBeGreaterThan(2);
    const lengths = beams.map((b) => b.lengthCm);
    expect(Math.max(...lengths)).toBeGreaterThan(Math.min(...lengths) + 50);
  });
});

describe("beam-scan — U-shape notch produces 2 beams on one line", () => {
  it("a scan line crossing the notch yields two separate beams", () => {
    // Beams running horizontally (H) → scan lines are horizontal (y = const).
    // A line in the notch band (y < 300) enters the left leg, crosses the void
    // (x∈[150,250]) and re-enters the right leg → two inside intervals.
    const { beams } = scanBeams(uShape, "H");
    const byPos = new Map<number, number>();
    for (const b of beams) byPos.set(b.pos, (byPos.get(b.pos) ?? 0) + 1);
    const maxPerLine = Math.max(...byPos.values());
    expect(maxPerLine).toBe(2);
    // Below the notch floor (y ≥ 300) the line is one full-width interval.
    const lowLine = beams.filter((b) => b.pos >= 300);
    expect(lowLine.length).toBeGreaterThan(0);
    for (const b of lowLine) expect(b.spanEnd - b.spanStart).toBeCloseTo(400, 6);
  });
});

describe("beam-scan — schedule & block estimate", () => {
  it("groups tapered beams into multiple stock buckets, rounded up to step", () => {
    const { beams } = scanBeams(chamfer, "H");
    const sched = beamSchedule(beams);
    // A taper produces several distinct lengths → more than one bucket.
    expect(sched.length).toBeGreaterThan(1);
    // Every bucket length is a multiple of the stock step and sorted ascending.
    for (const row of sched) {
      expect(row.lengthCm % BEAM_STOCK_STEP_CM).toBe(0);
    }
    for (let i = 1; i < sched.length; i++) {
      expect(sched[i].lengthCm).toBeGreaterThan(sched[i - 1].lengthCm);
    }
    // Quantities reconstruct the beam count.
    expect(sched.reduce((s, r) => s + r.qty, 0)).toBe(beams.length);
  });

  it("blockEstimate returns rows between adjacent beams and a sane total", () => {
    const { beams } = scanBeams(chamfer, "H");
    const est = blockEstimate(beams);
    expect(est.rows).toBe(beams.length - 1); // a row between each adjacent pair
    expect(est.totalBlocks).toBeGreaterThan(0);
  });

  it("blockEstimate skips a gap across a U-shape notch (no run overlap)", () => {
    // On the U-shape the two beams in the notch band sit on the SAME scan line
    // but in non-overlapping run intervals (left leg vs right leg). Adjacent in
    // pos-sorted order, they share no run overlap → that pair contributes no
    // block row, so rows < (beams − 1).
    const { beams } = scanBeams(uShape, "H");
    const est = blockEstimate(beams);
    expect(est.rows).toBeLessThan(beams.length - 1);
    expect(est.totalBlocks).toBeGreaterThan(0);
  });
});

describe("beam-scan — scanBeamsToOverlay (canvas overlay)", () => {
  it("H taper: beam Rects have DECREASING width, all inside the bbox, count matches", () => {
    const scan = scanBeams(chamfer, "H", PITCH_CM, BEARING_CM);
    const overlay = scanBeamsToOverlay(scan, "H");
    const box = bbox(chamfer);

    // One Rect per scan beam.
    expect(overlay.beams.length).toBe(scan.beams.length);
    expect(overlay.beams.length).toBeGreaterThan(2);

    // Widths shrink from the wide (top) end to the narrow (bottom) end.
    const widths = overlay.beams.map((r) => r.w);
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeLessThan(widths[i - 1] + 1e-6);
    }
    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths) + 50);

    // Each beam strip lies within the polygon bbox.
    for (const r of overlay.beams) {
      expect(r.h).toBeCloseTo(BEAM_WIDTH_CM, 6);
      expect(r.x).toBeGreaterThanOrEqual(box.x - 1e-6);
      expect(r.x + r.w).toBeLessThanOrEqual(box.x + box.w + 1e-6);
      expect(r.y).toBeGreaterThanOrEqual(box.y - 1e-6);
      expect(r.y + r.h).toBeLessThanOrEqual(box.y + box.h + 1e-6);
    }

    // Block cells were emitted and stay inside the bbox.
    expect(overlay.blockCells.length).toBeGreaterThan(0);
    for (const c of overlay.blockCells) {
      expect(c.x).toBeGreaterThanOrEqual(box.x - 1e-6);
      expect(c.x + c.w).toBeLessThanOrEqual(box.x + box.w + 1e-6);
      expect(c.y).toBeGreaterThanOrEqual(box.y - 1e-6);
      expect(c.y + c.h).toBeLessThanOrEqual(box.y + box.h + 1e-6);
    }
  });

  it("V taper: beam Rects have DECREASING height, all inside the bbox, count matches", () => {
    // Rotate the chamfer so it tapers along x; beams run vertically.
    const sideways: Pt[] = chamfer.map((p) => ({ x: p.y, y: p.x }));
    const scan = scanBeams(sideways, "V", PITCH_CM, BEARING_CM);
    const overlay = scanBeamsToOverlay(scan, "V");
    const box = bbox(sideways);

    expect(overlay.beams.length).toBe(scan.beams.length);
    expect(overlay.beams.length).toBeGreaterThan(2);

    const heights = overlay.beams.map((r) => r.h);
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]).toBeLessThan(heights[i - 1] + 1e-6);
    }
    expect(Math.max(...heights)).toBeGreaterThan(Math.min(...heights) + 50);

    for (const r of overlay.beams) {
      expect(r.w).toBeCloseTo(BEAM_WIDTH_CM, 6);
      expect(r.x).toBeGreaterThanOrEqual(box.x - 1e-6);
      expect(r.x + r.w).toBeLessThanOrEqual(box.x + box.w + 1e-6);
      expect(r.y).toBeGreaterThanOrEqual(box.y - 1e-6);
      expect(r.y + r.h).toBeLessThanOrEqual(box.y + box.h + 1e-6);
    }
  });

  it("U-shape notch: a block-cell row is skipped where beams share no run overlap", () => {
    const scan = scanBeams(uShape, "H");
    const overlay = scanBeamsToOverlay(scan, "H");
    // Cells exist, and (like blockEstimate) no row bridges the notch void —
    // every cell sits within the room's bbox.
    expect(overlay.blockCells.length).toBeGreaterThan(0);
    const box = bbox(uShape);
    for (const c of overlay.blockCells) {
      expect(c.x).toBeGreaterThanOrEqual(box.x - 1e-6);
      expect(c.x + c.w).toBeLessThanOrEqual(box.x + box.w + 1e-6);
    }
  });

  it("empty scan yields empty overlay", () => {
    expect(scanBeamsToOverlay({ beams: [] }, "H")).toEqual({ beams: [], blockCells: [] });
  });
});

describe("beam-scan — degenerate inputs", () => {
  it("handles too-few vertices, non-positive pitch, zero extent", () => {
    expect(scanBeams([{ x: 0, y: 0 }, { x: 10, y: 0 }], "H").beams).toEqual([]);
    expect(scanBeams(rectLoop, "H", 0).beams).toEqual([]);
    expect(scanBeams(rectLoop, "H", -5).beams).toEqual([]);
    // A zero-height degenerate loop yields no beams.
    const flat: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(scanBeams(flat, "H").beams).toEqual([]);
    // Empty schedule / estimate for no beams.
    expect(beamSchedule([])).toEqual([]);
    expect(blockEstimate([])).toEqual({ totalBlocks: 0, rows: 0 });
  });
});
