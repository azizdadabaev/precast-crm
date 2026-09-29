export const dynamic = "force-dynamic";
import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { crewRoute } from "@/lib/crew-pay/http";
import { loadCrewState, updateWorker } from "@/lib/crew-pay/service";
import { workerHistoryView } from "@/lib/crew-pay/views";
import { WorkerPatchBody } from "@/lib/crew-pay/schemas";

/** GET — the worker's week-by-week history. */
export const GET = withPermission<{ id: string }>("crewpay.manage", crewRoute(async (_req: NextRequest, { params }) => {
  const s = await loadCrewState();
  if (!s.input.workers.some((w) => w.id === params.id)) return fail("Ишчи топилмади", 404);
  return ok(workerHistoryView(s, params.id));
}));

/** PATCH — edit name/phone/notes/dates; setting leftOn marks the worker as left. No DELETE. */
export const PATCH = withPermission<{ id: string }>("crewpay.manage", crewRoute(async (req: NextRequest, { user, params }) => {
  return ok(await updateWorker(user, params.id, WorkerPatchBody.parse(await req.json())));
}));
