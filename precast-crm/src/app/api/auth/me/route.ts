import { ok, fail, handler } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

export const GET = handler(async () => {
  const u = await getCurrentUser();
  if (!u) return fail("Unauthorized", 401);
  return ok({ id: u.sub, email: u.email, name: u.name, role: u.role });
});
