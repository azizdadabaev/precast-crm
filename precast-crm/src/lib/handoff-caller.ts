// Who is allowed to create a call → Telegram follow-up.
//
// There are two answers, because there are two clients.
//
// The original one is the standalone overlay app from the spec (§4.2): a phone
// with no user session, carrying a single narrow secret whose blast radius is
// deliberately one capability. That path is unchanged.
//
// The second is the Etalon Android app, which folds the overlay in (Android
// architecture spec §4.7: "if the call-handoff overlay is folded in, it
// authenticates as the user and the server accepts either"). It already holds a
// real session, so making it carry a second shared secret would be strictly
// worse: one more credential on the same handset, and one that names nobody.
// Signed in, the follow-up records WHO created it — `createdById`, a column
// that has existed since the first migration and has never been filled.
//
// Both arrive as `Authorization: Bearer <...>`, so the device secret is tried
// first: it is a constant-time compare against a fixed string, which a JWT
// simply fails, and only then is the header re-read as a session.

import type { NextRequest } from "next/server";
import { getCurrentUser, type AuthUser } from "@/lib/auth";
import { can, type Action } from "@/lib/permissions";
import { verifyDeviceToken } from "@/lib/handoff-auth";

/**
 * The capability a signed-in caller needs. `inbox.access` and not something new:
 * a follow-up ends as a Telegram conversation with a linked client, which is
 * exactly what this permission already governs, and the GET list beside it is
 * gated the same way.
 */
export const HANDOFF_ACTION: Action = "inbox.access";

export type HandoffCaller =
  /** The standalone overlay app. Nobody is named; `createdById` stays null. */
  | { kind: "device"; userId: null }
  /** The Etalon app, signed in as a real operator. */
  | { kind: "user"; userId: string; user: AuthUser };

/**
 * Resolve the caller, or null when neither credential checks out.
 *
 * Deliberately returns null for every rejection rather than distinguishing
 * "no credential" from "wrong credential" from "insufficient permission": the
 * route answers one 401 for all three, so an attacker probing with a stolen
 * device token learns nothing about which half failed.
 */
export async function resolveHandoffCaller(
  req: NextRequest,
): Promise<HandoffCaller | null> {
  if (verifyDeviceToken(req)) return { kind: "device", userId: null };

  const user = await getCurrentUser();
  if (!user || !user.isActive) return null;
  if (!can(user, HANDOFF_ACTION)) return null;
  return { kind: "user", userId: user.id, user };
}
