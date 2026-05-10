import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const JWT_SECRET =
  process.env.JWT_SECRET ?? "dev-secret-change-me-please-32chars!";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "7d";
const COOKIE_NAME = "precast_token";

const secretKey = new TextEncoder().encode(JWT_SECRET);

// AuthRole tracks the role TEMPLATE the user was created from. The
// real access-control comes from `permissions` (see src/lib/permissions.ts);
// `role` here is metadata for display + UI templating only.
export type AuthRole =
  | "OWNER"
  | "ADMIN"
  | "SALES"
  | "INVENTORY"
  | "DRIVER"
  | "ACCOUNTANT"
  | "CUSTOM";

// Shape returned by getCurrentUser / getUserFromRequest. DB-backed:
// every call hits the users table so permission edits, disables, and
// password resets take effect on the very next request without
// re-issuing the JWT (see permissions plan, Q2 = Option A).
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: AuthRole;
  permissions: string[];
  isActive: boolean;
  mustChangePassword: boolean;
}

// JWT payload shape — only the user id (`sub`) is load-bearing; the
// rest is non-authoritative metadata. Permissions and isActive are
// always re-read from the DB, never trusted from the token.
export interface AuthPayload extends JWTPayload {
  sub: string;
  email: string;
  name: string;
  role: AuthRole;
}

/** Helper for the maker-checker payment / discrepancy gate.
 *  Kept as a thin alias for `can(user, "payment.confirm")` — see
 *  src/lib/permissions.ts. Existing callers still work. */
export function canConfirmCash(
  user: { role: AuthRole } | { permissions: string[] } | null,
): boolean {
  if (!user) return false;
  if ("permissions" in user) return user.permissions.includes("payment.confirm");
  return user.role === "ADMIN" || user.role === "OWNER";
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signToken(
  payload: Omit<AuthPayload, "iat" | "exp">,
): Promise<string> {
  return new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES_IN)
    .sign(secretKey);
}

export async function verifyToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return payload as AuthPayload;
  } catch {
    return null;
  }
}

export async function setAuthCookie(token: string) {
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure:
      process.env.COOKIE_SECURE !== "false" &&
      process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAuthCookie() {
  cookies().delete(COOKIE_NAME);
}

// Internal: given a verified JWT payload, look up the live user.
// Returns null if the user no longer exists (was deleted) — this is
// what makes permission/disable changes effective immediately, with
// no JWT re-issue.
async function loadUserFromPayload(
  payload: AuthPayload | null,
): Promise<AuthUser | null> {
  if (!payload?.sub) return null;
  const u = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      permissions: true,
      isActive: true,
      mustChangePassword: true,
    },
  });
  return u as AuthUser | null;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return loadUserFromPayload(await verifyToken(token));
}

export async function getUserFromRequest(
  req: NextRequest,
): Promise<AuthUser | null> {
  const cookieToken = req.cookies.get(COOKIE_NAME)?.value;
  if (cookieToken) {
    const u = await loadUserFromPayload(await verifyToken(cookieToken));
    if (u) return u;
  }
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return loadUserFromPayload(await verifyToken(auth.slice(7)));
  }
  return null;
}

/** Legacy role-based gate. Prefer `can(user, action)` from
 *  src/lib/permissions.ts in new code. Kept for callers like
 *  hasRole(user, "OWNER") in routes that haven't been migrated yet. */
export function hasRole(
  user: { role: AuthRole } | null,
  ...roles: AuthRole[]
): boolean {
  return !!user && roles.includes(user.role);
}

export const AUTH_COOKIE_NAME = COOKIE_NAME;
