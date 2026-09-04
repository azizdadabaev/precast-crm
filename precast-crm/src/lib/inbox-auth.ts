import { cookies, headers } from "next/headers";
import { NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import type { RouteContext } from "@/lib/api-auth";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-secret-change-me-please-32chars!",
);
const UNLOCK_COOKIE = "inbox_unlock";
const UNLOCK_TTL_SECONDS = 60 * 60 * 12; // 12h, clears on tab close earlier via session use

/** Pure password check. Fails closed when INBOX_PASSWORD is unset/empty. */
export function verifyInboxPassword(input: string): boolean {
  const expected = process.env.INBOX_PASSWORD ?? "";
  return expected.length > 0 && input === expected;
}

export const INBOX_UNLOCK_HEADER = "x-inbox-unlock";

/** Mint the 12 h unlock JWT. Shared by the cookie (web) and the header (Android). */
export async function mintInboxUnlockToken(): Promise<string> {
  return new SignJWT({ inbox: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(SECRET);
}

/** Issue the short-lived unlock cookie after a correct password. Returns the
 *  token so the unlock route can also hand it to a cookie-less client. */
export async function setInboxUnlockCookie(): Promise<string> {
  const token = await mintInboxUnlockToken();
  cookies().set(UNLOCK_COOKIE, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: UNLOCK_TTL_SECONDS,
  });
  return token;
}

/** Delete the unlock cookie, effectively locking the inbox immediately. */
export function clearInboxUnlockCookie(): void {
  cookies().delete(UNLOCK_COOKIE);
}

async function verifyUnlock(t: string | undefined | null): Promise<boolean> {
  if (!t) return false;
  try {
    await jwtVerify(t, SECRET);
    return true;
  } catch {
    return false;
  }
}

/** True if a valid, unexpired unlock token is present — cookie (web) or
 *  `X-Inbox-Unlock` header (Android, which keeps it in memory only). */
export async function isInboxUnlocked(): Promise<boolean> {
  if (await verifyUnlock(cookies().get(UNLOCK_COOKIE)?.value)) return true;
  return verifyUnlock(headers().get(INBOX_UNLOCK_HEADER));
}

/**
 * Compose the OWNER `inbox.access` permission gate with the per-session
 * password unlock. Returns 403 { code: "INBOX_LOCKED" } when the
 * permission is held but the session isn't unlocked, so the client can
 * show the password prompt.
 */
export function withInboxAccess<P = Record<string, string>>(
  fn: (req: NextRequest, ctx: RouteContext<P>) => Promise<Response>,
) {
  return withPermission<P>("inbox.access", async (req, ctx) => {
    if (!(await isInboxUnlocked())) {
      return fail("Хабарлар қулфланган · Inbox locked — enter password", 403, {
        code: "INBOX_LOCKED",
      });
    }
    return fn(req, ctx);
  });
}
