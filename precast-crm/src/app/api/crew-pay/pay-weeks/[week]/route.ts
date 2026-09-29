export const dynamic = "force-dynamic";
import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { crewRoute } from "@/lib/crew-pay/http";
import { loadCrewState, paymentDateFor } from "@/lib/crew-pay/service";
import { defaultPayWeek, payView } from "@/lib/crew-pay/views";
import { WeekStartSchema } from "@/lib/crew-pay/schemas";
import { todayTashkent } from "@/lib/crew-pay/rules";

/** GET /api/crew-pay/pay-weeks/{week|"default"} — the payday table. */
export const GET = withPermission<{ week: string }>("crewpay.manage", crewRoute(async (_req: NextRequest, { params }) => {
  const s = await loadCrewState();
  const today = todayTashkent();
  const week = params.week === "default" ? defaultPayWeek(s, today) : WeekStartSchema.parse(params.week);
  return ok({ ...payView(s, week, today), paymentDate: paymentDateFor(week) });
}));
