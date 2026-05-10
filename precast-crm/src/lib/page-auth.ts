import { redirect } from "next/navigation";
import {
  getCurrentUser,
  type AuthUser,
} from "@/lib/auth";
import {
  can,
  canAny,
  homeForUser,
  type Action,
} from "@/lib/permissions";

/**
 * Single source of truth for which page paths require which permissions.
 *
 *   - One Action: gate by a single permission (e.g. "/orders" → order.view)
 *   - Action[]:   gate by ANY of the listed permissions (e.g. "/dashboard"
 *                 admits dashboard.view OR dashboard.viewBasic — see Phase 2
 *                 dashboard route for context)
 *   - "any-auth": just require the user be logged in + active
 *
 * Lookup uses LONGEST-PREFIX match — `/orders/abc123/print` matches
 * `/orders` if no more specific entry exists. Be careful when adding
 * a deeper override: it must be added BEFORE its parent in any code
 * that iterates this map (we sort by key length descending below).
 *
 * Adding a new page:
 *   1. Pick the right action (or "any-auth").
 *   2. Add an entry below for the page's URL prefix.
 *   3. If a permission needs to be created first, add it in
 *      src/lib/permissions.ts ACTIONS, ACTION_LABELS, the relevant
 *      ROLE_TEMPLATES, and PERMISSION_GROUPS.
 */
export const ROUTE_PERMISSIONS: Record<
  string,
  Action | Action[] | "any-auth"
> = {
  "/dashboard": ["dashboard.view", "dashboard.viewBasic"],
  "/calculations": "calculator.use",
  "/projects": "order.view",
  "/pipeline": "order.view",
  "/orders": "order.view",
  "/payments": "payment.view",
  "/discrepancies": "discrepancy.view",
  "/clients": "client.view",
  "/drivers": "driver.view",
  "/inventory": "inventory.view",
  "/production": "inventory.view",
  "/sandbox": "sandbox.access",
  "/users": "user.view",
  // Self-service: every authenticated user can change their own password
  // and see their own profile, regardless of permission set.
  "/profile": "any-auth",
  "/change-password": "any-auth",
};

/**
 * Look up the permission rule for a given pathname using longest-prefix
 * match. Returns the matching rule, or `null` if no rule matches (the
 * caller decides what to do — typically log + fall through to any-auth
 * to avoid accidental lockouts on unmapped pages).
 */
export function ruleForPath(
  pathname: string,
): Action | Action[] | "any-auth" | null {
  // Sort keys longest-first so /orders/abc beats /orders.
  const keys = Object.keys(ROUTE_PERMISSIONS).sort(
    (a, b) => b.length - a.length,
  );
  for (const key of keys) {
    if (pathname === key || pathname.startsWith(key + "/")) {
      return ROUTE_PERMISSIONS[key];
    }
  }
  return null;
}

/**
 * Server-component guard: ensures the request has a valid session and
 * an active user. Returns the AuthUser. Redirects to /login on no
 * session or disabled account.
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive) redirect("/login?error=disabled");
  return user;
}

/**
 * Server-component guard: ensures the user has a specific permission.
 * If the rule for the path is `null` (unmapped), passes through with
 * just an auth check — better than locking out a new page during dev.
 *
 * On unauthorized: redirects to the user's `homeForUser()` with
 * `?error=unauthorized&from=<original-path>` so the destination can
 * show a banner and so we can debug paths that are over-restricted.
 */
export async function requirePermissionForPath(
  pathname: string,
): Promise<AuthUser> {
  const user = await requireAuth();
  const rule = ruleForPath(pathname);

  // Unmapped path — fall through to auth-only. Log so we notice.
  if (rule === null) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn(
        `[page-auth] No ROUTE_PERMISSIONS rule for "${pathname}" — passing as auth-only`,
      );
    }
    return user;
  }

  if (rule === "any-auth") return user;

  const ok = Array.isArray(rule) ? canAny(user, rule) : can(user, rule);
  if (ok) return user;

  // Send them home with a banner-trigger flag.
  const dest = homeForUser(user);
  const url = `${dest}?error=unauthorized&from=${encodeURIComponent(pathname)}`;
  redirect(url);
}

/**
 * Manual single-permission guard, for cases where a page wants to
 * call this directly instead of relying on the layout's path-based
 * lookup. Rare — most pages should leave gating to the layout.
 */
export async function requirePermission(action: Action): Promise<AuthUser> {
  const user = await requireAuth();
  if (!can(user, action)) {
    const dest = homeForUser(user);
    redirect(`${dest}?error=unauthorized`);
  }
  return user;
}
