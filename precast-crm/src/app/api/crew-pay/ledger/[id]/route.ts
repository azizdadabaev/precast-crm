export const dynamic = "force-dynamic";
import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { crewRoute } from "@/lib/crew-pay/http";
import { patchLedgerEntry } from "@/lib/crew-pay/service";
import { LedgerPatchBody } from "@/lib/crew-pay/schemas";

/** PATCH — reason / signed / method only. There is deliberately no DELETE. */
export const PATCH = withPermission<{ id: string }>("crewpay.manage", crewRoute(async (req: NextRequest, { user, params }) => {
  return ok(await patchLedgerEntry(user, params.id, LedgerPatchBody.parse(await req.json())));
}));
