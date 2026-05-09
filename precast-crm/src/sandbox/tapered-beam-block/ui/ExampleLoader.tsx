"use client";

import { Select } from "@/components/ui/select";
import type { TaperInput } from "../engine";

/**
 * Pre-fill from one of the SPEC §10 worked examples. Selecting an
 * option calls `onLoad` with the example inputs; the parent form
 * pushes those into its input state and runs Calculate.
 */
export interface Example {
  key: "ex1" | "ex2" | "ex3";
  label: string;
  inputs: TaperInput;
}

export const EXAMPLES: Example[] = [
  {
    key: "ex1",
    label: "Example 1 — Mild trapezoid (single beam)",
    inputs: { width1: 3.7, width2: 3.9, length: 5.7 },
  },
  {
    key: "ex2",
    label: "Example 2 — Medium taper (3 groups)",
    inputs: { width1: 3.75, width2: 4.45, length: 8.7 },
  },
  {
    key: "ex3",
    label: "Example 3 — Extreme wedge (hybrid)",
    inputs: { width1: 5.0, width2: 2.0, length: 1.6 },
  },
];

export function ExampleLoader({
  onLoad,
}: {
  onLoad: (e: Example) => void;
}) {
  return (
    <Select
      defaultValue=""
      onChange={(e) => {
        const key = e.target.value;
        const ex = EXAMPLES.find((x) => x.key === key);
        if (ex) {
          onLoad(ex);
          // Reset the dropdown so re-selecting the same example fires again.
          e.target.value = "";
        }
      }}
      className="w-full md:w-auto"
    >
      <option value="">Show worked example ▾</option>
      {EXAMPLES.map((ex) => (
        <option key={ex.key} value={ex.key}>
          {ex.label}
        </option>
      ))}
    </Select>
  );
}
