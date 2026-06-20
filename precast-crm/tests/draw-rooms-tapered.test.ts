import { describe, it, expect } from "vitest";
import {
  scanScheduleToSlabRows,
  baysToSlabRows,
} from "@/components/calculation/draw-rooms";
import { scanBeams, beamSchedule, isRectilinear } from "@/lib/cad/beam-scan";
import {
  decomposeToBays,
  defaultBeamDir,
  BEARING_CM,
  PITCH_CM,
  type Pt,
} from "@/lib/cad/geometry";

// Chamfered pentagon: 3.20 m wide at the top tapering to 1.60 m at the bottom,
// 5.00 m tall. An ANGLED outline → scanline path.
const chamfer: Pt[] = [
  { x: 0, y: 0 },
  { x: 320, y: 0 },
  { x: 240, y: 500 },
  { x: 80, y: 500 },
];

const bearingM = BEARING_CM / 100; // 0.15
const pitchM = PITCH_CM / 100; // 0.58

describe("scanScheduleToSlabRows — tapered shape → estimate rows", () => {
  it("emits one row per beam-length bucket, labelled (tapered)", () => {
    const { beams } = scanBeams(chamfer, "H");
    const schedule = beamSchedule(beams);
    expect(schedule.length).toBeGreaterThan(1); // a taper → several lengths

    const rows = scanScheduleToSlabRows(schedule, 0);
    expect(rows).toHaveLength(schedule.length);
    for (const r of rows) {
      expect(r.name).toMatch(/\(tapered\)/);
      expect(r.result).not.toBeNull(); // priced by recomputeRow
    }
    // Labels continue from startSeq.
    expect(rows[0].name).toBe("Хона 1 (tapered)");
  });

  it("innerWidth = bucket length − 2×bearing (round-trips to the stock length)", () => {
    const schedule = beamSchedule(scanBeams(chamfer, "H").beams);
    const rows = scanScheduleToSlabRows(schedule, 0);
    rows.forEach((r, i) => {
      const expectedWidth = schedule[i].lengthCm / 100 - 2 * bearingM;
      expect(r.innerWidth).toBeCloseTo(expectedWidth, 6);
      // The engine re-adds 2×bearing → beam_length recovers the stock length.
      expect((r.result!.beam_length * 100)).toBeCloseTo(schedule[i].lengthCm, 6);
    });
  });

  it("each row's engine beam_count equals the bucket qty", () => {
    const schedule = beamSchedule(scanBeams(chamfer, "H").beams);
    const rows = scanScheduleToSlabRows(schedule, 0);
    rows.forEach((r, i) => {
      // innerLength = qty × PITCH → pitches = qty, remainder 0 → GB, no extras.
      expect(r.result!.beam_count).toBe(schedule[i].qty);
      expect(r.innerLength).toBeCloseTo(schedule[i].qty * pitchM, 6);
    });
  });

  it("preserves the TOTAL beam count across all rows", () => {
    const { beams } = scanBeams(chamfer, "H");
    const schedule = beamSchedule(beams);
    const rows = scanScheduleToSlabRows(schedule, 0);
    const totalBeams = rows.reduce((s, r) => s + (r.result!.beam_count), 0);
    expect(totalBeams).toBe(beams.length);
  });

  it("continues row numbering from startSeq", () => {
    const schedule = beamSchedule(scanBeams(chamfer, "H").beams);
    const rows = scanScheduleToSlabRows(schedule, 3);
    expect(rows[0].name).toBe("Хона 4 (tapered)");
  });

  it("skips degenerate buckets (non-positive clear span or qty)", () => {
    // A bucket whose length ≤ 2×bearing has a non-positive clear span → skipped.
    const rows = scanScheduleToSlabRows(
      [
        { lengthCm: 2 * BEARING_CM, qty: 4 }, // span 0 → skip
        { lengthCm: 350, qty: 5 }, // valid
        { lengthCm: 400, qty: 0 }, // qty 0 → skip
      ],
      0,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].innerWidth).toBeCloseTo(350 / 100 - 2 * bearingM, 6);
    expect(rows[0].result!.beam_count).toBe(5);
  });

  it("empty schedule → no rows", () => {
    expect(scanScheduleToSlabRows([], 0)).toEqual([]);
  });
});

describe("draw-rooms — rectilinear path stays exact (unchanged)", () => {
  it("a rectangle is rectilinear and maps via baysToSlabRows to one priced row", () => {
    const rect: Pt[] = [
      { x: 0, y: 0 },
      { x: 320, y: 0 },
      { x: 320, y: 500 },
      { x: 0, y: 500 },
    ];
    expect(isRectilinear(rect)).toBe(true);
    const bays = decomposeToBays(rect);
    expect(bays).toHaveLength(1);
    const rows = baysToSlabRows(
      bays.map((b) => ({ rect: b, beamDir: defaultBeamDir(b) })),
      0,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Хона 1"); // NOT tapered
    expect(rows[0].result).not.toBeNull();
  });
});
