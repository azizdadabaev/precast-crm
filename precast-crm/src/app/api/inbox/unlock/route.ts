import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { verifyInboxPassword, setInboxUnlockCookie, isInboxUnlocked } from "@/lib/inbox-auth";

// GET — report whether this session is already unlocked (owner-only).
export const GET = withPermission("inbox.access", async () => {
  return ok({ unlocked: await isInboxUnlocked() });
});

const Body = z.object({ password: z.string().min(1) });

// POST — verify the password and set the unlock cookie.
export const POST = withPermission("inbox.access", async (req: NextRequest) => {
  const { password } = Body.parse(await req.json());
  if (!verifyInboxPassword(password)) {
    return fail("Нотўғри парол · Wrong password", 401);
  }
  await setInboxUnlockCookie();
  return ok({ unlocked: true });
});
