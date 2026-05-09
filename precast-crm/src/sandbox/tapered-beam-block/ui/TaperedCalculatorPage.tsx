"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { computeTaper, type TaperInput, type TaperResult } from "../engine";
import { TaperedInputs } from "./TaperedInputs";
import { TaperedResults } from "./TaperedResults";
import { EdgeCompensationHelp } from "./EdgeCompensationHelp";

/**
 * Top-level page component for the tapered-slab sandbox. Lives under
 * src/sandbox/ to keep the feature severable. The route file at
 * src/app/(app)/sandbox/tapered/page.tsx is a thin wrapper that
 * re-exports this component.
 */
export function TaperedCalculatorPage() {
  const [result, setResult] = useState<TaperResult | null>(null);

  function handleCalculate(input: TaperInput) {
    setResult(computeTaper(input));
  }

  return (
    <div className="space-y-5">
      {/* Sandbox warning banner */}
      <div className="rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
        <div className="flex items-start gap-3">
          <FlaskConical className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold">
              🧪 Тажриба зонаси · Sandbox — экспериментал, ишлаб чиқаришда ишлатиб бўлмайди.
            </div>
            <div className="text-sm">
              This is an experimental tapered-slab calculator. Results MUST NOT
              be used for real orders or production planning until merged into
              the main engine.
            </div>
          </div>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Қиялашган плита · Tapered Beam-and-Block
        </h1>
        <p className="text-sm text-muted-foreground">
          Trapezoidal and irregular-quadrilateral slab calculator. See SPEC.md
          (in the sandbox folder) for the canonical math; results follow the
          §9 report layout.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-5">
          <TaperedInputs onCalculate={handleCalculate} />
          <EdgeCompensationHelp />
        </div>
        <div>
          <TaperedResults result={result} />
        </div>
      </div>
    </div>
  );
}
