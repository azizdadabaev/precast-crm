import { describe, it, expect } from "vitest";
import { estimateProject, GazoblokError, type WallInput, type BlockProduct } from "./gazoblok-engine";

// Helper: build the products map the engine expects.
function products(list: Array<{ id: string; label: string; l: number; h: number; t: number; price: number }>) {
  return new Map(list.map((p) => [p.id, { lengthM: p.l, heightM: p.h, thicknessM: p.t, pricePerBlock: p.price, label: p.label }]));
}
const wall = (w: Partial<WallInput> & { id: string; productId: string; lengthM: number; heightM: number }): WallInput => ({
  openings: [], ...w,
});

describe("estimateProject", () => {
  it("counts a single wall joint-aware, no openings, waste 0", () => {
    // block 0.6x0.2, joint 3mm -> blocksPerM2 = 1/(0.603*0.203)=8.1692
    // wall 5x2=10 m2 -> raw=81.69 -> ceil=82; vol=82*0.024=1.968; price=82*20000
    const r = estimateProject(
      [wall({ id: "w1", productId: "A", lengthM: 5, heightM: 2 })],
      products([{ id: "A", label: "600x200x200", l: 0.6, h: 0.2, t: 0.2, price: 20000 }]),
      { jointMm: 3, wastePct: 0 },
    );
    expect(r.perSize).toHaveLength(1);
    expect(r.perSize[0].blocksNeeded).toBe(82);
    expect(r.perSize[0].volumeM3).toBe(1.968);
    expect(r.perSize[0].price).toBe(1_640_000);
    expect(r.totalBlocks).toBe(82);
  });

  it("subtracts each opening (w*h*qty) from the wall", () => {
    // same wall, minus a door 0.9x2.1x1 = 1.89 -> net 8.11 -> raw=66.25 -> ceil 67
    const r = estimateProject(
      [wall({ id: "w1", productId: "A", lengthM: 5, heightM: 2, openings: [{ kind: "DOOR", widthM: 0.9, heightM: 2.1, qty: 1 }] })],
      products([{ id: "A", label: "A", l: 0.6, h: 0.2, t: 0.2, price: 20000 }]),
      { jointMm: 3, wastePct: 0 },
    );
    expect(r.perSize[0].blocksNeeded).toBe(67);
  });

  it("groups blocks by size — one perSize entry per distinct product", () => {
    const r = estimateProject(
      [
        wall({ id: "w1", productId: "A", lengthM: 5, heightM: 2 }),
        wall({ id: "w2", productId: "B", lengthM: 4, heightM: 2 }),
      ],
      products([
        { id: "A", label: "300mm", l: 0.6, h: 0.25, t: 0.3, price: 30000 },
        { id: "B", label: "100mm", l: 0.6, h: 0.25, t: 0.1, price: 12000 },
      ]),
      { jointMm: 2, wastePct: 5 },
    );
    expect(r.perSize).toHaveLength(2);
    expect(r.perSize.map((p) => p.productId).sort()).toEqual(["A", "B"]);
  });

  it("applies waste ONCE per size after aggregating walls (not per wall)", () => {
    // Two walls same product. Waste-once can differ from per-wall ceil.
    const p = products([{ id: "A", label: "A", l: 0.6, h: 0.2, t: 0.2, price: 1000 }]);
    const twoWalls = estimateProject(
      [wall({ id: "w1", productId: "A", lengthM: 3, heightM: 2 }), wall({ id: "w2", productId: "A", lengthM: 3, heightM: 2 })],
      p, { jointMm: 3, wastePct: 5 },
    );
    // raw per wall = 6*8.1692=49.015; sum=98.03; *1.05=102.93 -> ceil 103
    expect(twoWalls.perSize[0].blocksNeeded).toBe(103);
  });

  it("computes glue kg and 25kg bags from total net area", () => {
    // net 10 m2 -> kg = 10*1.7=17 -> bags ceil(17/25)=1
    const r = estimateProject(
      [wall({ id: "w1", productId: "A", lengthM: 5, heightM: 2 })],
      products([{ id: "A", label: "A", l: 0.6, h: 0.2, t: 0.2, price: 1000 }]),
      { jointMm: 3, wastePct: 0 },
    );
    expect(r.glue.kg).toBe(17);
    expect(r.glue.bags).toBe(1);
  });

  it("clamps net to 0 and warns when openings exceed the wall", () => {
    const r = estimateProject(
      [wall({ id: "w1", productId: "A", lengthM: 2, heightM: 2, openings: [{ kind: "WINDOW", widthM: 3, heightM: 3, qty: 1 }] })],
      products([{ id: "A", label: "A", l: 0.6, h: 0.2, t: 0.2, price: 1000 }]),
      { jointMm: 3, wastePct: 0 },
    );
    expect(r.warnings.some((w) => w.code === "OPENINGS_EXCEED_WALL")).toBe(true);
    expect(r.totalBlocks).toBe(0);
  });

  it("warns and skips a wall whose product is missing/unknown", () => {
    const r = estimateProject(
      [wall({ id: "w1", productId: "GHOST", lengthM: 5, heightM: 2 })],
      products([{ id: "A", label: "A", l: 0.6, h: 0.2, t: 0.2, price: 1000 }]),
    );
    expect(r.warnings.some((w) => w.code === "NO_BLOCK_SIZE")).toBe(true);
    expect(r.perSize).toHaveLength(0);
  });

  it("throws GazoblokError on non-positive wall dimensions", () => {
    expect(() =>
      estimateProject(
        [wall({ id: "w1", productId: "A", lengthM: 0, heightM: 2 })],
        products([{ id: "A", label: "A", l: 0.6, h: 0.2, t: 0.2, price: 1000 }]),
      ),
    ).toThrow(GazoblokError);
  });
});

describe("estimateProject — block orientation", () => {
  // 20sm block: 0.6 x 0.3 x 0.2. STANDARD face 600x300 (5.50/m2); ROTATED face 600x200 (8.22/m2).
  const p20 = () => new Map([["A", { lengthM: 0.6, heightM: 0.3, thicknessM: 0.2, pricePerBlock: 1000, label: "20sm" }]]);
  const w = (orientation?: "STANDARD" | "ROTATED") => [{
    id: "w1", productId: "A", lengthM: 10, heightM: 1, openings: [], ...(orientation ? { orientation } : {}),
  }];

  it("defaults to STANDARD when orientation is absent (face length×height)", () => {
    const r = estimateProject(w(), p20(), { jointMm: 2, wastePct: 0 });
    // 10 m2 * 5.5005 = 55.005 -> ceil 56
    expect(r.perSize[0].blocksNeeded).toBe(56);
  });

  it("STANDARD and ROTATED give different block counts for the same wall & block", () => {
    const std = estimateProject(w("STANDARD"), p20(), { jointMm: 2, wastePct: 0 });
    const rot = estimateProject(w("ROTATED"), p20(), { jointMm: 2, wastePct: 0 });
    expect(std.perSize[0].blocksNeeded).toBe(56);   // face 600x300
    expect(rot.perSize[0].blocksNeeded).toBe(83);   // face 600x200: 10*8.2234=82.234 -> 83
    expect(rot.perSize[0].blocksNeeded).toBeGreaterThan(std.perSize[0].blocksNeeded);
  });

  it("volume per block is identical across orientations (same physical block)", () => {
    const std = estimateProject(w("STANDARD"), p20(), { jointMm: 2, wastePct: 0 });
    const rot = estimateProject(w("ROTATED"), p20(), { jointMm: 2, wastePct: 0 });
    const volPerBlockStd = std.perSize[0].volumeM3 / std.perSize[0].blocksNeeded;
    const volPerBlockRot = rot.perSize[0].volumeM3 / rot.perSize[0].blocksNeeded;
    expect(volPerBlockStd).toBeCloseTo(0.036, 3);
    expect(volPerBlockRot).toBeCloseTo(0.036, 3);
  });
});
