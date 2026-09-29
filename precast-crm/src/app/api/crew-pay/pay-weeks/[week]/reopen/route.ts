export const dynamic = "force-dynamic";
import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { crewRoute } from "@/lib/crew-pay/http";
import { reopenWeek } from "@/lib/crew-pay/service";
import { ReopenBody, WeekStartSchema } from "@/lib/crew-pay/schemas";

export const POST = withPermission<{ week: string }>("crewpay.manage", crewRoute(async (req: NextRequest, { user, params }) => {
  const { reason } = ReopenBody.parse(await req.json());
  return ok(await reopenWeek(user, WeekStartSchema.parse(params.week), reason));
}));
