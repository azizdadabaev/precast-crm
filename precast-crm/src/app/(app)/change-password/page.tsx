import { requireAuth } from "@/lib/page-auth";
import { ChangePasswordClient } from "./ChangePasswordClient";

export default async function ChangePasswordPage() {
  // Self-service — every authenticated user reaches this. Forced flow
  // (mustChangePassword = true) is the same page, distinguished by
  // the `?force=1` query param read by the client.
  const user = await requireAuth();
  return (
    <ChangePasswordClient
      mustChange={user.mustChangePassword}
      userName={user.name}
    />
  );
}
