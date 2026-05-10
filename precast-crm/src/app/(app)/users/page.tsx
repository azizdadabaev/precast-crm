import { requirePermission } from "@/lib/page-auth";
import { UsersPageClient } from "./UsersPageClient";

export default async function UsersPage() {
  // Belt + suspenders: layout already gates the path by user.view via
  // ROUTE_PERMISSIONS, but this page-level check makes the dependency
  // explicit (and protects against a future routing change that
  // bypasses the layout).
  const currentUser = await requirePermission("user.view");

  return <UsersPageClient currentUser={currentUser} />;
}
