export const dynamic = "force-dynamic";

import { ok } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";

// Every authenticated user can read their own session — no specific
// permission required. The client uses this to bootstrap the UI
// (sidebar filtering, role badge, mustChangePassword redirect).
export const GET = withAuth(async (_req, { user }) => {
  return ok({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: user.permissions,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
  });
});
