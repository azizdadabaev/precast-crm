import { headers } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/TopBar";
import { MobileTopbar } from "@/components/MobileTopbar";
import { UnauthorizedBanner } from "@/components/UnauthorizedBanner";
import { AudioUnlocker } from "@/components/AudioUnlocker";
import { NotificationListener } from "@/components/notifications/NotificationListener";
import { MainContainer } from "@/components/MainContainer";
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
 *
 * Visual shell (etalon redesign):
 *   - Sidebar: dark, collapsible, lg+ only.
 *   - TopBar: breadcrumb + search + bell, lg+ only.
 *   - MobileTopbar: hamburger that opens a drawer with SidebarBody.
 *   - Main: light page background (--background), the page content
 *           sits in a centered max-w-[1400px] column.
 */
export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = headers().get("x-pathname") ?? "/";
  const user = await requirePermissionForPath(pathname);

  return (
    <div className="flex h-screen bg-background">
      <AudioUnlocker />
      <NotificationListener />
      <Sidebar user={user} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar />
        <MobileTopbar user={user} />
        <main className="flex-1 overflow-auto">
          {/* Layout mode (full-bleed / wide / centered) is decided client-side
              in MainContainer via usePathname — the server layout is preserved
              across client navigation, so a header-derived class goes stale. */}
          <MainContainer>
            <UnauthorizedBanner />
            {children}
          </MainContainer>
        </main>
      </div>
    </div>
  );
}
