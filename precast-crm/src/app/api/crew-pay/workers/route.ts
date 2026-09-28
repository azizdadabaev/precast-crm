export const dynamic = "force-dynamic";
import type { NextRequest } from "next/server";
import { ok, created } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { crewRoute } from "@/lib/crew-pay/http";
import { createWorker, loadCrewState } from "@/lib/crew-pay/service";
import { workersView } from "@/lib/crew-pay/views";
import { WorkerBody } from "@/lib/crew-pay/schemas";
import { todayTashkent } from "@/lib/crew-pay/rules";

export const GET = withPermission("crewpay.manage", crewRoute(async () => ok(workersView(await loadCrewState(), todayTashkent()))));

export const POST = withPermission("crewpay.manage", crewRoute(async (req: NextRequest, { user }) => {
  return created(await createWorker(user, WorkerBody.parse(await req.json())));
}));
