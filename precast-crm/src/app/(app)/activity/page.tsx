import { headers } from "next/headers";
import { requirePermissionForPath } from "@/lib/page-auth";
import ActivityClient from "./ActivityClient";

export default async function ActivityPage() {
  const h = headers();
  await requirePermissionForPath(h.get("x-pathname") || "/activity");
  return <ActivityClient />;
}
