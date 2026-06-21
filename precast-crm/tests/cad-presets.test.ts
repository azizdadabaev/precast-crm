import { describe, it, expect } from "vitest";
import {
  lShape,
  tShape,
  uShape,
  notchShape,
  ROOM_PRESETS,
} from "@/lib/cad/presets";
import { bbox, polygonArea, isValidOutline } from "@/lib/cad/geometry";
import { isRectilinear } from "@/lib/cad/beam-scan";

const CASES = [
  { name: "L", make: lShape, verts: 6 },
  { name: "T", make: tShape, verts: 8 },
  { name: "U", make: uShape, verts: 8 },
  { name: "Notch", make: notchShape, verts: 8 },
] as const;

describe("room-shape presets", () => {
  for (const { name, make, verts } of CASES) {
    describe(name, () => {
      const pts = make();

      it("returns the expected vertex count", () => {
        expect(pts).toHaveLength(verts);
      });

      it("is a closed, valid, non-self-intersecting outline", () => {
        expect(isValidOutline(pts, true)).toBe(true);
      });

      it("is rectilinear — every edge (incl. the closing one) is axis-aligned", () => {
        expect(isRectilinear(pts)).toBe(true);
      });

      it("encloses positive area smaller than its bounding box (it has a cut-out)", () => {
        const area = Math.abs(polygonArea(pts));
        const bb = bbox(pts);
        expect(area).toBeGreaterThan(0);
        expect(area).toBeLessThan(bb.w * bb.h);
      });

      it("fills the requested overall extent exactly", () => {
        const bb = bbox(make({ w: 600, h: 480 }));
        expect(bb.w).toBe(600);
        expect(bb.h).toBe(480);
        expect(bb.x).toBe(0);
        expect(bb.y).toBe(0);
      });
    });
  }

  it("exposes one descriptor per shape in ROOM_PRESETS", () => {
    expect(ROOM_PRESETS.map((p) => p.key)).toEqual(["L", "T", "U", "Notch"]);
    for (const p of ROOM_PRESETS) {
      expect(isValidOutline(p.make(), true)).toBe(true);
    }
  });
});
