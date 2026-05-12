"use client";

import { useState } from "react";
import { Building2, Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { SidebarBody } from "@/components/sidebar";
import type { AuthUser } from "@/lib/auth";

/**
 * Topbar shown only on screens < lg (1024px). Contains a hamburger
 * trigger that opens the sidebar nav as a left-side drawer (Sheet).
 *
 * The drawer body re-uses `SidebarBody` so the desktop and mobile
 * surfaces share a single source of truth: same NAV array, same
 * permission filtering, same active-link highlighting, same footer.
 *
 * Closes on: outside tap, Escape key, or any nav-item tap (via
 * `onNavigate` propagated into SidebarBody → Link onClick).
 */
export function MobileTopbar({ user }: { user: AuthUser }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="lg:hidden sticky top-0 z-40 flex items-center gap-2 h-14 px-3 border-b bg-card">
      <Sheet open={open} onOpenChange={setOpen}>
        <button
          type="button"
          aria-label="Меню · Menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-md hover:bg-accent transition-colors"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>

        <SheetContent
          side="left"
          className="p-0 flex flex-col w-4/5 sm:max-w-sm"
        >
          {/* Visually hidden title/description satisfies Radix's a11y
              requirements without showing duplicate branding. */}
          <SheetTitle className="sr-only">EtalonSlabs CRM навигация</SheetTitle>
          <SheetDescription className="sr-only">
            Жорий фойдаланувчи учун рухсатли навигация.
          </SheetDescription>
          <SidebarBody user={user} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Inline brand on the topbar so the user knows where they are. */}
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-primary text-primary-foreground grid place-items-center">
          <Building2 className="h-4 w-4" />
        </div>
        <div className="font-semibold text-sm leading-tight">EtalonSlabs</div>
      </div>
    </header>
  );
}
