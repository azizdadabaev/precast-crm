"use client";

import { TaperedCalculatorPage } from "@/sandbox/tapered-beam-block/ui/TaperedCalculatorPage";

/**
 * Thin route wrapper. All logic lives under src/sandbox/tapered-beam-block/
 * so the feature can be removed by deleting that folder + this file +
 * the matching sidebar entry. See sandbox README for the three-step
 * deletion checklist.
 */
export default function SandboxTaperedRoute() {
  return <TaperedCalculatorPage />;
}
