export const dynamic = "force-dynamic";
import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { crewRoute } from "@/lib/crew-pay/http";
import { loadCrewState } from "@/lib/crew-pay/service";
import { overviewView } from "@/lib/crew-pay/views";
import { WeekStartSchema } from "@/lib/crew-pay/schemas";
import { todayTashkent } from "@/lib/crew-pay/rules";
import { weekStartOf } from "@/lib/crew-pay/engine";

/** GET /api/crew-pay/overview?week=YYYY-MM-DD — crewpay.manage */
export const GET = withPermission("crewpay.manage", crewRoute(async (req: NextRequest) => {
  const today = todayTashkent();
  const q = new URL(req.url).searchParams.get("week");
  const week = q ? WeekStartSchema.parse(q) : weekStartOf(today);
  return ok(overviewView(await loadCrewState(), week, today));
}));
