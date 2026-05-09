"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Small reference card listing the four edge-compensation strategies
 * from SPEC §3.7. Sits in the inputs column so engineers see the
 * options while they fill the form.
 */
export function EdgeCompensationHelp() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Қирра компенсацияси · Edge compensation (§3.7)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-muted-foreground">
        <p>
          When a stock beam exceeds the row&apos;s actual width, compensate
          by whichever option minimises site cutting:
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>Edge concrete pour</li>
          <li>Ring beam absorbs the difference</li>
          <li>Cut blocks at the wall edge</li>
          <li>Triangular infill strip</li>
        </ul>
      </CardContent>
    </Card>
  );
}
