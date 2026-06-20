import { describe, it, expect } from "vitest";
import { calculateSlab } from "@/services/calculation-engine";
import {
  BEAM_KG_PER_M,
  FILLER_BLOCK_KG,
  estimateRoomWeight,
  estimateProjectWeight,
} from "@/lib/cad/sheet/weight";

describe("estimateRoomWeight", () => {
  const calc = calculateSlab({ inner_width: 3.2, inner_length: 5 });

  it("beamsKg = Math.round(beam_count * beam_length * BEAM_KG_PER_M)", () => {
    const { beamsKg } = estimateRoomWeight(calc);
    expect(beamsKg).toBe(Math.round(calc.beam_count * calc.beam_length * BEAM_KG_PER_M));
  });

  it("blocksKg = total_blocks * FILLER_BLOCK_KG", () => {
    const { blocksKg } = estimateRoomWeight(calc);
    expect(blocksKg).toBe(Math.round(calc.total_blocks * FILLER_BLOCK_KG));
  });

  it("totalKg = beamsKg + blocksKg", () => {
    const w = estimateRoomWeight(calc);
    expect(w.totalKg).toBe(w.beamsKg + w.blocksKg);
  });
});

describe("estimateProjectWeight", () => {
  const calc = calculateSlab({ inner_width: 3.2, inner_length: 5 });
  const single = estimateRoomWeight(calc);

  it("beamsKg over two identical rooms is 2× single room", () => {
    const project = estimateProjectWeight([calc, calc]);
    expect(project.beamsKg).toBe(single.beamsKg * 2);
  });

  it("blocksKg over two identical rooms is 2× single room", () => {
    const project = estimateProjectWeight([calc, calc]);
    expect(project.blocksKg).toBe(single.blocksKg * 2);
  });

  it("totalKg over two identical rooms is 2× single room", () => {
    const project = estimateProjectWeight([calc, calc]);
    expect(project.totalKg).toBe(single.totalKg * 2);
  });
});
