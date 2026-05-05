import { ok, handler } from "@/lib/api";
import { clearAuthCookie } from "@/lib/auth";

export const POST = handler(async () => {
  await clearAuthCookie();
  return ok({ message: "Logged out" });
});
