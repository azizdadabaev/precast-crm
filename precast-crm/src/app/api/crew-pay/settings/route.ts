export const dynamic = "force-dynamic";
import type { NextRequest } from "next/server";
import { ok, created, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { crewRoute } from "@/lib/crew-pay/http";
import { addRate, addSetting, loadCrewState } from "@/lib/crew-pay/service";
import { settingsView } from "@/lib/crew-pay/views";
import { RateBody, SettingBody } from "@/lib/crew-pay/schemas";

export const GET = withPermission("crewpay.manage", crewRoute(async () => ok(settingsView(await loadCrewState()))));

/** POST { kind: "rate", ... } | { kind: "setting", ... } — add-only, effective-dated. */
export const POST = withPermission("crewpay.manage", crewRoute(async (req: NextRequest, { user }) => {
  const body = (await req.json()) as { kind?: string };
  if (body.kind === "rate") return created(await addRate(user, RateBody.parse(body)));
  if (body.kind === "setting") return created(await addSetting(user, SettingBody.parse(body)));
  return fail("kind rate ёки setting бўлиши керак", 400);
}));
