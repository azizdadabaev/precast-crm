import { headers } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { UnauthorizedBanner } from "@/components/UnauthorizedBanner";
import { requirePermissionForPath } from "@/lib/page-auth";

/**
 * Server-side gate for everything under (app)/.
 *
 * Runs on every navigation (server components are re-evaluated per
 * request in App Router, even when the underlying client component
 * doesn't unmount). The gate:
 *   1. Verifies the user is logged in and active (else → /login).
 *   2. Looks up the permission rule for the current path in
 *      ROUTE_PERMISSIONS (src/lib/page-auth.ts) — single source of
 *      truth for which page needs which permission.
 *   3. Redirects unauthorized users to their homeForUser() with a
 *      `?error=unauthorized` flag so the banner can render below.
 *
 * The pathname comes from a header set by middleware
 * (src/middleware.ts → x-pathname). We don't trust the request URL
 * directly because Next.js doesn't expose it to layouts otherwise.
 */
export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = headers().get("x-pathname") ?? "/";
  await requirePermissionForPath(pathname);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="px-6 py-6 max-w-[1400px]">
          <UnauthorizedBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
