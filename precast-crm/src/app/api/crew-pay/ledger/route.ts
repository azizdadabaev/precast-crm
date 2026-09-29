export const dynamic = "force-dynamic";
import type { NextRequest } from "next/server";
import { ok, created } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { crewRoute } from "@/lib/crew-pay/http";
import { addLedgerEntry, loadCrewState } from "@/lib/crew-pay/service";
import { ledgerView } from "@/lib/crew-pay/views";
import { LedgerBody, WeekStartSchema } from "@/lib/crew-pay/schemas";
import type { LedgerType } from "@/lib/crew-pay/engine";

const TYPES = new Set(["ADVANCE", "WEEKLY_PAY", "CORRECTION"]);

/** GET /api/crew-pay/ledger?worker=&type=&week= */
export const GET = withPermission("crewpay.manage", crewRoute(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const type = sp.get("type");
  const week = sp.get("week");
  return ok(ledgerView(await loadCrewState(), {
    workerId: sp.get("worker") || undefined,
    type: type && TYPES.has(type) ? (type as LedgerType) : undefined,
    weekStart: week ? WeekStartSchema.parse(week) : undefined,
  }));
}));

/** POST /api/crew-pay/ledger — append an entry (never edited in place). */
export const POST = withPermission("crewpay.manage", crewRoute(async (req: NextRequest, { user }) => {
  return created(await addLedgerEntry(user, LedgerBody.parse(await req.json())));
}));
