"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Sun, Moon } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/store/language";
import { useThemeStore } from "@/store/theme";
import { useLang } from "@/lib/i18n";

/**
 * Top breadcrumb / search / quick-actions bar.
 *
 * Layout (per docs/design/etalon-layout.jsx → TopBar):
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ EtalonSlabs / Бошқарув [Dashboard]      [🔎 Search ⌘K] 🔔  │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Hidden on small viewports — the mobile topbar (MobileTopbar.tsx)
 * shows a hamburger that opens a drawer with SidebarBody. Renders
 * only at `lg:` and above where there's space alongside the dark
 * sidebar.
 *
 * The pathname → breadcrumb map mirrors the keys in
 * src/lib/page-auth.ts → ROUTE_PERMISSIONS so adding a new
 * permission-gated page automatically gets a sensible breadcrumb.
 */

// Bilingual breadcrumb labels per top-level pathname segment.
const BREADCRUMB: Record<string, { uz: string; en: string }> = {
  dashboard: { uz: "Бошқарув", en: "Dashboard" },
  calculations: { uz: "Калькулятор", en: "Calculator" },
  orders: { uz: "Буюртмалар", en: "Orders" },
  gallery: { uz: "Галерея", en: "Gallery" },
  projects: { uz: "Лойиҳалар", en: "Projects" },
  activity: { uz: "Фаоллик", en: "Activity" },
  clients: { uz: "Мижозлар", en: "Clients" },
  payments: { uz: "Тўловлар", en: "Payments" },
  discrepancies: { uz: "Тафовутлар", en: "Discrepancies" },
  drivers: { uz: "Ҳайдовчилар", en: "Drivers" },
  production: { uz: "Ишлаб чиқариш", en: "Production" },
  inventory: { uz: "Омбор", en: "Warehouse" },
  sandbox: { uz: "Тажриба", en: "Sandbox" },
  users: { uz: "Фойдаланувчилар", en: "Users" },
  profile: { uz: "Профил", en: "Profile" },
  "change-password": { uz: "Парол", en: "Change Password" },
};

function getCrumb(pathname: string): { uz: string; en: string } {
  // First path segment after "/" identifies the page.
  const seg = pathname.replace(/^\/+/, "").split("/")[0];
  return BREADCRUMB[seg] ?? { uz: "—", en: "—" };
}

export function TopBar() {
  const pathname = usePathname();
  const { uz, en } = getCrumb(pathname);
  const [mac, setMac] = useState(false);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/i.test(navigator.platform));
  }, []);
  const lang = useLang();
  const toggleLang = useLanguageStore((s) => s.toggle);
  const uzOnly = lang === "uz";
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const isDark = theme === "dark";

  return (
    <header className="hidden lg:flex h-[52px] items-center justify-between gap-4 px-6 border-b border-border bg-card shrink-0">
      {/* Breadcrumb — workspace / page (Cyrillic) / [English chip] */}
      <div className="flex items-center gap-2 min-w-0">
        <Link
          href="/orders"
          className="text-xs text-text-tertiary hover:text-foreground transition-colors shrink-0"
        >
          EtalonSlabs
        </Link>
        <span className="text-base text-border shrink-0 leading-none">/</span>
        <span className="text-[13px] font-semibold text-foreground truncate">
          {uz}
        </span>
        {!uzOnly && (
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary bg-muted border border-border rounded-full px-2 py-0.5 leading-none shrink-0">
            {en}
          </span>
        )}
      </div>

      {/* Right cluster — search, language toggle, notifications */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-text-tertiary pointer-events-none" />
          <input
            type="text"
            placeholder={uzOnly ? "Қидириш…" : "Search…"}
            aria-label="Search"
            className={cn(
              "h-8 w-56 rounded-md border border-border bg-background pl-8 pr-12 text-xs",
              "placeholder:text-text-tertiary",
              "focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-border-strong",
            )}
          />
          <kbd className="absolute right-2 font-mono text-[10px] text-text-tertiary bg-muted border border-border rounded px-1 py-0.5 leading-none pointer-events-none">
            {mac ? "⌘K" : "Ctrl+K"}
          </kbd>
        </div>

        {/* Theme toggle — flips dark mode. Sun shows in dark mode
            (click to go light); moon shows in light mode. */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          title={isDark ? "Кундузги режим · Light mode" : "Тунги режим · Dark mode"}
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border bg-background text-text-tertiary hover:text-foreground hover:bg-accent transition-colors"
        >
          {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        {/* UZ toggle — single click switches the whole UI between
            bilingual mode (default) and Cyrillic-only mode. Hidden when
            uzOnly the button itself stays UZ-labeled so the operator
            can switch back. */}
        <button
          type="button"
          onClick={toggleLang}
          aria-label={uzOnly ? "Switch to bilingual" : "Faqat o'zbekcha"}
          title={uzOnly ? "Switch to bilingual" : "Faqat o'zbekcha · Switch to Uzbek-only"}
          className={cn(
            "h-8 inline-flex items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-mono font-bold uppercase tracking-wider transition-all duration-150",
            uzOnly
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-background text-text-tertiary hover:text-foreground hover:bg-accent hover:border-border-strong",
          )}
        >
          <span>UZ</span>
          {!uzOnly && <span className="text-text-tertiary normal-case font-medium">· EN</span>}
        </button>

        <NotificationBell />
      </div>
    </header>
  );
}
