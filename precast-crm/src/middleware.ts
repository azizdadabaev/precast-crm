import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me-please-32chars!";
const COOKIE_NAME = "precast_token";
const secret = new TextEncoder().encode(JWT_SECRET);

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/health",
  "/api/telegram/webhook",
  "/api/instagram/webhook", // Meta webhook — GET verify handshake + signed POST (HMAC), not the session
  "/privacy", // public policy pages — required by Meta for Live mode / App Review
  "/terms",
  "/data-deletion",
  "/internal/quote-card", // agent's headless quote-card render target — gated by an in-process token, not the session
  "/api/mcp", // MCP endpoint — gated by Bearer token in route handler, not the session cookie
  "/api/handoff", // POST is gated by the device Bearer token in the route
                   // handler; GET re-checks the session via withPermission.
  "/_next",
  "/favicon.ico",
  "/opus", // static opus-recorder encoder worker (voice recording)
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
  const isApi = pathname.startsWith("/api/");
  const next = () => {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    // Mobile clients cache aggressively by default; every API response is
    // per-user and time-sensitive. The web is unaffected (fetcher already
    // bypasses the HTTP cache via React Query).
    if (isApi) res.headers.set("Cache-Control", "no-store");
    return res;
  };

  if (isPublic(pathname)) return next();

  // Web sends the cookie; Android sends `Authorization: Bearer`. Only API
  // paths accept the header — page routes stay cookie-only so a leaked
  // bearer can never render the HTML shell.
  const cookieToken = req.cookies.get(COOKIE_NAME)?.value;
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerMatch = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
  const token = cookieToken ?? (isApi && bearerMatch ? bearerMatch[1] : undefined);
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
