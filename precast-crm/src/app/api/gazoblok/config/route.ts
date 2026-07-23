export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { withAuth, withPermission } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { loadGazoblokGrade, saveGazoblokGrade } from "@/lib/gazoblok-config";
import { GazoblokGradeSchema } from "@/lib/gazoblok-validation";

/** GET /api/gazoblok/config — auth-only (open to all logged-in users —
 *  owner decision). The single density-grade label. */
export const GET = withAuth(async () => {
  const grade = await loadGazoblokGrade();
  return ok({ grade });
});

/** PUT /api/gazoblok/config — pricing.edit (config mutation, owner decision
 *  2026-07-23). Set the grade label. */
export const PUT = withPermission("pricing.edit", async (req: NextRequest, { user }) => {
  const { grade } = GazoblokGradeSchema.parse(await req.json());
  const saved = await saveGazoblokGrade(grade);
  recordAudit({
    userId: user.id,
    action: "gazoblok.grade.update",
    targetType: "app_config",
    targetId: "gazoblok.grade",
    message: `Set газоблок grade to ${saved}`,
  });
  return ok({ grade: saved });
});
