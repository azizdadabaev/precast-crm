import { describe, it, expect } from "vitest";
import {
  blockWeightKg,
  orderWeightKg,
  loadWeightKg,
  calculateGazoblokRemaining,
  distributeGazoblokLoad,
  type GazoblokLine,
} from "@/lib/gazoblok-weight";

const lines: GazoblokLine[] = [
  { lineId: "a", label: "600×300×200", quantity: 520, perBlockKg: blockWeightKg(0.6, 0.3, 0.2) },
  { lineId: "b", label: "600×300×100", quantity: 100, perBlockKg: blockWeightKg(0.6, 0.3, 0.1) },
];

describe("gazoblok weight", () => {
  it("a 0.6×0.3×0.2 block weighs ~22 kg", () => {
    expect(blockWeightKg(0.6, 0.3, 0.2)).toBeCloseTo(22, 0);
  });

  it("orderWeightKg + loadWeightKg sum per-line weights", () => {
    const total = orderWeightKg(lines);
    expect(total).toBeCloseTo(520 * blockWeightKg(0.6, 0.3, 0.2) + 100 * blockWeightKg(0.6, 0.3, 0.1), 3);
    expect(loadWeightKg(lines, { a: 10 })).toBeCloseTo(10 * blockWeightKg(0.6, 0.3, 0.2), 3);
  });

  it("remaining subtracts prior shipments and clamps at 0", () => {
    const rem = calculateGazoblokRemaining(lines, [{ a: 300 }, { a: 300 }]);
    expect(rem.a).toBe(0); // 520 - 600 → clamped 0
    expect(rem.b).toBe(100);
  });

  it("distributes blocks across two trucks; last truck takes the remainder", () => {
    const { shipments } = distributeGazoblokLoad(lines, [{ capacityKg: 5000 }, { capacityKg: 5000 }]);
    expect(shipments).toHaveLength(2);
    const totalA = (shipments[0].lines.a ?? 0) + (shipments[1].lines.a ?? 0);
    const totalB = (shipments[0].lines.b ?? 0) + (shipments[1].lines.b ?? 0);
    expect(totalA).toBe(520); // every block placed, none lost or duplicated
    expect(totalB).toBe(100);
  });

  it("warns when a truck exceeds its capacity", () => {
    const { warnings } = distributeGazoblokLoad(lines, [{ capacityKg: 1 }]);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
