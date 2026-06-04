"use client";

import { usePathname } from "next/navigation";

/**
 * Applies the per-route layout-mode class to the main content area.
 *
 * This MUST be a client component using usePathname — NOT the server (app)
 * layout reading the x-pathname header. The (app) layout is preserved across
 * client-side navigation (App Router does not re-render shared layouts), so a
 * header-derived class goes stale: opening the inbox via "Open chat" from an
 * order/project page kept the non-full-bleed wrapper, so the inbox lost its
 * h-full height bound — the jump arrows vanished and the composer was pushed
 * off-screen — until a hard reload re-ran the server layout. usePathname
 * re-renders on navigation, so the class always matches the current route.
 *
 * Server-rendered pages are passed in as `children`, so they stay server
 * components (the standard client-wrapper-over-server-children pattern).
 */
export function MainContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  // Inbox is a full-bleed surface (Telegram-style): fills the main area (h-full).
  const isFullBleed = pathname === "/inbox" || pathname.startsWith("/inbox/");
  // Calculator runs full-WIDTH but with normal scroll flow — NOT h-full, which
  // would clip its tall content; it re-centers in a max-w column when no dock
  // is shown.
  const isWide = pathname === "/calculations";
  return (
    <div
      className={
        isFullBleed
          ? "h-full px-4 py-4 lg:px-6 lg:py-6"
          : isWide
            ? "px-4 py-4 lg:px-6 lg:py-6"
            : "px-4 py-4 lg:px-6 lg:py-6 max-w-[1400px] w-full mx-auto"
      }
    >
      {children}
    </div>
  );
}
