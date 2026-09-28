export const dynamic = "force-dynamic";
import type { NextRequest } from "next/server";
import { created } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { crewRoute } from "@/lib/crew-pay/http";
import { payWorkers } from "@/lib/crew-pay/service";
import { PayBody, WeekStartSchema } from "@/lib/crew-pay/schemas";

export const POST = withPermission<{ week: string }>("crewpay.manage", crewRoute(async (req: NextRequest, { user, params }) => {
  return created(await payWorkers(user, WeekStartSchema.parse(params.week), PayBody.parse(await req.json())));
}));
