export const dynamic = "force-dynamic";
import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { crewRoute } from "@/lib/crew-pay/http";
import { closeWeek } from "@/lib/crew-pay/service";
import { WeekStartSchema } from "@/lib/crew-pay/schemas";

export const POST = withPermission<{ week: string }>("crewpay.manage", crewRoute(async (_req: NextRequest, { user, params }) => {
  return ok(await closeWeek(user, WeekStartSchema.parse(params.week)));
}));
