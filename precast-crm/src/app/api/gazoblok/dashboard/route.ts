export const dynamic = "force-dynamic";

import { ok } from "@/lib/api";
import { withPermissionAny } from "@/lib/api-auth";
import { fetchGazoblokDashboard, forViewer } from "@/lib/gazoblok-dashboard-data";

/** GET /api/gazoblok/dashboard — same gate as /dashboard; money stripped server-side without dashboard.view. */
export const GET = withPermissionAny(["dashboard.view", "dashboard.viewBasic"], async (_req, { user }) =>
  ok(forViewer(await fetchGazoblokDashboard(new Date()), user)),
);
