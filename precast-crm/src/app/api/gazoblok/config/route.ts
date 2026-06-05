export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { loadGazoblokGrade, saveGazoblokGrade } from "@/lib/gazoblok-config";
import { GazoblokGradeSchema } from "@/lib/gazoblok-validation";

/** GET /api/gazoblok/config — gazoblok.view. The single density-grade label. */
export const GET = withPermission("gazoblok.view", async () => {
  const grade = await loadGazoblokGrade();
  return ok({ grade });
});

/** PUT /api/gazoblok/config — gazoblok.manage. Set the grade label. */
export const PUT = withPermission("gazoblok.manage", async (req: NextRequest, { user }) => {
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
