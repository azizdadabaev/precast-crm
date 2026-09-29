export const dynamic = "force-dynamic";
import type { NextRequest } from "next/server";
import { created } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { crewRoute } from "@/lib/crew-pay/http";
import { reverseLedgerEntry } from "@/lib/crew-pay/service";
import { ReverseBody } from "@/lib/crew-pay/schemas";

/** POST — add a CORRECTION that reverses entry {id} (default: the opposite amount). */
export const POST = withPermission<{ id: string }>("crewpay.manage", crewRoute(async (req: NextRequest, { user, params }) => {
  return created(await reverseLedgerEntry(user, params.id, ReverseBody.parse(await req.json())));
}));
