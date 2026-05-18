"use client";

import { useState } from "react";
import { Building2, Menu, Sun, Moon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { SidebarBody } from "@/components/sidebar";
import { NotificationBell } from "@/components/NotificationBell";
import type { AuthUser } from "@/lib/auth";
import { useLanguageStore } from "@/store/language";
import { useThemeStore } from "@/store/theme";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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
  const lang = useLang();
  const toggleLang = useLanguageStore((s) => s.toggle);
  const uzOnly = lang === "uz";
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const isDark = theme === "dark";

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
          <SheetTitle className="sr-only">EtalonSlabs CRM навигация</SheetTitle>
          <SheetDescription className="sr-only">
            Жорий фойдаланувчи учун рухсатли навигация.
          </SheetDescription>
          <SidebarBody user={user} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Inline brand */}
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-primary text-primary-foreground grid place-items-center">
          <Building2 className="h-4 w-4" />
        </div>
        <div className="font-semibold text-sm leading-tight">EtalonSlabs</div>
      </div>

      {/* Right — theme + language toggles + notifications */}
      <div className="ml-auto flex items-center gap-1.5">
        <NotificationBell />
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          title={isDark ? "Кундузги режим" : "Тунги режим"}
          className="inline-flex items-center justify-center min-h-10 min-w-10 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={toggleLang}
          aria-label={uzOnly ? "Switch to bilingual" : "Faqat o'zbekcha"}
          className={cn(
            "min-h-10 inline-flex items-center gap-1 rounded-md border px-2.5 text-[11px] font-mono font-bold uppercase tracking-wider transition-all",
            uzOnly
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent",
          )}
        >
          <span>UZ</span>
          {!uzOnly && <span className="text-muted-foreground normal-case font-medium">· EN</span>}
        </button>
      </div>
    </header>
  );
}
