import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me-please-32chars!";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "7d";
const COOKIE_NAME = "precast_token";

const secretKey = new TextEncoder().encode(JWT_SECRET);

export type AuthRole = "ADMIN" | "SALES" | "ENGINEER" | "OPERATOR" | "OWNER";

/** Helper for the maker-checker payment / discrepancy gate.
 *  Returns true for roles that can confirm payments, reject payments,
 *  or resolve discrepancies. Adds ADMIN as a superuser by convention. */
export function canConfirmCash(user: AuthPayload | null): boolean {
  return !!user && (user.role === "ADMIN" || user.role === "OWNER");
}

export interface AuthPayload extends JWTPayload {
  sub: string; // user id
  email: string;
  name: string;
  role: AuthRole;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signToken(payload: Omit<AuthPayload, "iat" | "exp">): Promise<string> {
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

export async function getCurrentUser(): Promise<AuthPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function getUserFromRequest(req: NextRequest): Promise<AuthPayload | null> {
  // Cookie first
  const cookieToken = req.cookies.get(COOKIE_NAME)?.value;
  if (cookieToken) {
    const u = await verifyToken(cookieToken);
    if (u) return u;
  }
  // Bearer fallback (useful for API clients)
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return verifyToken(auth.slice(7));
  }
  return null;
}

export function hasRole(user: AuthPayload | null, ...roles: AuthRole[]): boolean {
  return !!user && roles.includes(user.role);
}

export const AUTH_COOKIE_NAME = COOKIE_NAME;
