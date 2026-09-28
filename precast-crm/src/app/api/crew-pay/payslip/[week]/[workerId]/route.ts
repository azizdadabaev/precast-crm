export const dynamic = "force-dynamic";
import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { crewRoute } from "@/lib/crew-pay/http";
import { loadCrewState } from "@/lib/crew-pay/service";
import { payslipView } from "@/lib/crew-pay/views";
import { WeekStartSchema } from "@/lib/crew-pay/schemas";

export const GET = withPermission<{ week: string; workerId: string }>("crewpay.manage", crewRoute(async (_req: NextRequest, { params }) => {
  const s = await loadCrewState();
  if (!s.input.workers.some((w) => w.id === params.workerId)) return fail("Ишчи топилмади", 404);
  return ok(payslipView(s, WeekStartSchema.parse(params.week), params.workerId));
}));
