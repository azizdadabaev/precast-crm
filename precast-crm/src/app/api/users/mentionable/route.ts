export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/**
 * GET /api/users/mentionable
 *
 * Returns the minimal user list needed for the @mention picker in
 * CommentThread. Gated on comment.create (any authenticated user who
 * can write comments) rather than user.view (admin-only) so all
 * operators see the full mention list.
 *
 * Only active users are returned; omits sensitive fields like
 * permissions, passwordHash, and mustChangePassword.
 */
export const GET = withPermission("comment.create", async () => {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true },
  });
  return ok(users);
});
