import { NextRequest } from "next/server";
import { fail, handler } from "@/lib/api";
import { getCurrentUser, type AuthUser } from "@/lib/auth";
import { can, canAny, type Action } from "@/lib/permissions";

export type RouteContext<P = Record<string, string>> = {
  user: AuthUser;
  params: P;
};

type RouteHandler<P> = (
  req: NextRequest,
  ctx: RouteContext<P>,
) => Promise<Response>;

type NextRouteCtx<P> = { params: P };

/**
 * Wrap an API route handler with a permission check.
 *
 *   401 — no session / token invalid
 *   403 — disabled account, or session valid but lacks the action
 *
 * On success, calls the inner handler with `{ user, params }`. The
 * inner is also wrapped with `handler()` from src/lib/api.ts so Zod
 * and Prisma errors get mapped to clean JSON responses — same
 * behavior we had before, plus the permission gate.
 *
 * Permission strings come from src/lib/permissions.ts ACTIONS.
 */
export function withPermission<P = Record<string, string>>(
  action: Action,
  fn: RouteHandler<P>,
): (req: NextRequest, routeCtx: NextRouteCtx<P>) => Promise<Response> {
  return handler(async (req: NextRequest, routeCtx: NextRouteCtx<P>) => {
    const user = await getCurrentUser();
    if (!user) {
      return fail(
        "Авторизация талаб қилинади · Authentication required",
        401,
      );
    }
    if (!user.isActive) {
      return fail("Аккаунт ўчирилган · Account is disabled", 403);
    }
    if (!can(user, action)) {
      return fail(
        `Рухсат йўқ · Permission denied (${action})`,
        403,
      );
    }
    return fn(req, { user, params: routeCtx?.params ?? ({} as P) });
  });
}

/**
 * Wrap an API route handler that requires AT LEAST ONE of the given
 * actions. Useful for endpoints that several role templates can hit
 * with different permissions — e.g. /api/dashboard accepts either
 * dashboard.viewBasic (ops) OR dashboard.view (financial).
 *
 *   401 — no session / token invalid
 *   403 — disabled account, or session valid but lacks every listed action
 */
export function withPermissionAny<P = Record<string, string>>(
  actions: Action[],
  fn: RouteHandler<P>,
): (req: NextRequest, routeCtx: NextRouteCtx<P>) => Promise<Response> {
  return handler(async (req: NextRequest, routeCtx: NextRouteCtx<P>) => {
    const user = await getCurrentUser();
    if (!user) {
      return fail(
        "Авторизация талаб қилинади · Authentication required",
        401,
      );
    }
    if (!user.isActive) {
      return fail("Аккаунт ўчирилган · Account is disabled", 403);
    }
    if (!canAny(user, actions)) {
      return fail(
        `Рухсат йўқ · Permission denied (need any of: ${actions.join(", ")})`,
        403,
      );
    }
    return fn(req, { user, params: routeCtx?.params ?? ({} as P) });
  });
}

/**
 * Wrap an API route handler with auth-only (any active user).
 * Use sparingly — prefer withPermission(action, ...). This is for
 * routes like /api/auth/me where every authenticated user can read
 * their own session, regardless of permissions.
 */
export function withAuth<P = Record<string, string>>(
  fn: RouteHandler<P>,
): (req: NextRequest, routeCtx: NextRouteCtx<P>) => Promise<Response> {
  return handler(async (req: NextRequest, routeCtx: NextRouteCtx<P>) => {
    const user = await getCurrentUser();
    if (!user) {
      return fail(
        "Авторизация талаб қилинади · Authentication required",
        401,
      );
    }
    if (!user.isActive) {
      return fail("Аккаунт ўчирилган · Account is disabled", 403);
    }
    return fn(req, { user, params: routeCtx?.params ?? ({} as P) });
  });
}
