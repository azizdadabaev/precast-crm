import { describe, it, expect } from "vitest";
import { aiRoomsToSlabRows } from "@/components/calculation/ai-rooms";

describe("aiRoomsToSlabRows", () => {
  it("maps widthM→innerWidth, lengthM→innerLength, label→name and prices each row", () => {
    const rows = aiRoomsToSlabRows(
      [
        { widthM: 4.9, lengthM: 8.1, label: "зал" },
        { widthM: 3.1, lengthM: 5.2 },
      ],
      0,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].innerWidth).toBe(4.9);
    expect(rows[0].innerLength).toBe(8.1);
    expect(rows[0].name).toBe("зал");
    expect(rows[0].result).not.toBeNull(); // priced by recomputeRow
    // Unlabeled room falls back to the default "Хона N" label.
    expect(rows[1].name).toMatch(/Хона/);
  });

  it("continues row numbering from startSeq", () => {
    const rows = aiRoomsToSlabRows([{ widthM: 3, lengthM: 4 }], 2);
    expect(rows[0].name).toBe("Хона 3"); // startSeq 2 → seq 3
  });
});
