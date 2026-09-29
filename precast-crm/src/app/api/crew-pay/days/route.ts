export const dynamic = "force-dynamic";
import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { crewRoute } from "@/lib/crew-pay/http";
import { loadCrewState, saveDay } from "@/lib/crew-pay/service";
import { daysView } from "@/lib/crew-pay/views";
import { DayBody, WeekStartSchema } from "@/lib/crew-pay/schemas";
import { todayTashkent } from "@/lib/crew-pay/rules";
import { weekStartOf } from "@/lib/crew-pay/engine";

/** GET /api/crew-pay/days?week= — one week of the daily log. */
export const GET = withPermission("crewpay.manage", crewRoute(async (req: NextRequest) => {
  const q = new URL(req.url).searchParams.get("week");
  const week = q ? WeekStartSchema.parse(q) : weekStartOf(todayTashkent());
  return ok(daysView(await loadCrewState(), week));
}));

/** PUT /api/crew-pay/days — upsert one day + its full attendance map. */
export const PUT = withPermission("crewpay.manage", crewRoute(async (req: NextRequest, { user }) => {
  return ok(await saveDay(user, DayBody.parse(await req.json())));
}));
