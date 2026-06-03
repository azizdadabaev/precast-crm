import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { clearInboxUnlockCookie } from "@/lib/inbox-auth";

// Locking only needs the permission (not an active unlock) — locking an
// already-locked inbox is a harmless no-op.
export const POST = withPermission("inbox.access", async () => {
  clearInboxUnlockCookie();
  return ok({ locked: true });
});
