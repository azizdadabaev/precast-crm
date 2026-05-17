import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me-please-32chars!";
const COOKIE_NAME = "precast_token";
const secret = new TextEncoder().encode(JWT_SECRET);

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/health",
  "/_next",
  "/favicon.ico",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Forward the request path on a header so server components can
  // read it without each layout/page receiving it as a prop. Used by
  // src/app/(app)/layout.tsx → page-auth.ts to look up the permission
  // rule for the current route.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  const next = () =>
    NextResponse.next({ request: { headers: requestHeaders } });

  if (isPublic(pathname)) return next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return redirectToLogin(req);

  try {
    await jwtVerify(token, secret);
    return next();
  } catch {
    return redirectToLogin(req);
  }
}

function redirectToLogin(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
