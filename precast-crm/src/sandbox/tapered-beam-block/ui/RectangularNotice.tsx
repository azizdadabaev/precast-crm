"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTING_MESSAGE_RECTANGULAR } from "../engine/compute-taper";

/**
 * Rendered when the user enters width1 === width2 with no irregular
 * sides. Per SPEC §0, we redirect to the main calculator instead of
 * running the taper logic. The message is rendered verbatim.
 */
export function RectangularNotice() {
  return (
    <Card className="border-sky-300 bg-sky-50">
      <CardHeader>
        <CardTitle className="text-sky-900 text-base">
          Тўғри тўртбурчак · Rectangular room
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-sky-900">
        <p>{ROUTING_MESSAGE_RECTANGULAR}</p>
        <Button asChild size="sm" className="bg-sky-700 hover:bg-sky-800 text-white">
          <Link href="/calculations">
            Асосий калькулятор · Open main calculator
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
