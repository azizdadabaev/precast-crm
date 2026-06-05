"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Calculator,
  FolderKanban,
  PackageCheck,
  Hammer,
  Warehouse,
  Truck,
  Wallet,
  AlertTriangle,
  LogOut,
  Shapes,
  UserCog,
  Pencil,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ScrollText,
  Coins,
  Settings2,
  Factory,
  Images,
  Activity as ActivityIcon,
  TableProperties,
  MessageCircle,
  Boxes,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/fetcher";
import {
  canAny,
  isUserCustomized,
  roleDisplayLabel,
  type Action,
} from "@/lib/permissions";
import { useLang } from "@/lib/i18n";
import { BlenderStatusIndicator } from "@/components/blender-bridge/BlenderStatusIndicator";
import type { AuthUser } from "@/lib/auth";

interface NavItem {
  href: string;
  /** Cyrillic primary label (Uzbek). */
  label: string;
  /** Latin secondary label (English / hint). */
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Permission(s) required to see this item. Array = any-of.
   *  "any-auth" = visible to every logged-in user (no permission needed). */
  permission: Action | Action[] | "any-auth";
}

/** Single source of truth for sidebar entries — desktop and the mobile drawer both consume this. */
export const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Бошқарув",
    sub: "Dashboard",
    icon: LayoutDashboard,
    permission: ["dashboard.view", "dashboard.viewBasic"],
  },
  {
    href: "/calculations",
    label: "Калькулятор",
    sub: "Calculator",
    icon: Calculator,
    permission: "calculator.use",
  },
  {
    href: "/orders",
    label: "Буюртмалар",
    sub: "Orders",
    icon: PackageCheck,
    permission: "order.view",
  },
  {
    href: "/gazoblok/orders",
    label: "Газоблок",
    sub: "Gazoblok",
    icon: Boxes,
    permission: "any-auth",
  },
  {
    href: "/gallery",
    label: "Галерея",
    sub: "Gallery",
    icon: Images,
    permission: "order.view",
  },
  {
    href: "/projects",
    label: "Лойиҳалар",
    sub: "Projects",
    icon: FolderKanban,
    permission: "order.view",
  },
  {
    href: "/activity",
    label: "Фаоллик",
    sub: "Activity",
    icon: ActivityIcon,
    permission: "order.view",
  },
  {
    href: "/inbox",
    label: "Хабарлар",
    sub: "Inbox",
    icon: MessageCircle,
    permission: "inbox.access",
  },
  {
    href: "/clients",
    label: "Мижозлар",
    sub: "Clients",
    icon: Users,
    permission: "client.view",
  },
  {
    href: "/payments",
    label: "Тўловлар",
    sub: "Payments",
    icon: Wallet,
    permission: "payment.view",
  },
  {
    href: "/discrepancies",
    label: "Тафовутлар",
    sub: "Discrepancies",
    icon: AlertTriangle,
    permission: "discrepancy.view",
  },
  {
    href: "/sandbox/tapered",
    label: "Мураккаб шакллар",
    sub: "Complex shapes",
    icon: Shapes,
    permission: "sandbox.access",
  },
];

/** Items grouped under the "Операциялар · Operations" collapsible section. */
export const OPERATIONS_NAV: NavItem[] = [
  {
    href: "/production",
    label: "Ишлаб чиқариш",
    sub: "Production",
    icon: Hammer,
    permission: "inventory.view",
  },
  {
    href: "/inventory",
    label: "Омбор",
    sub: "Warehouse",
    icon: Warehouse,
    permission: "inventory.view",
  },
  {
    href: "/drivers",
    label: "Ҳайдовчилар",
    sub: "Drivers",
    icon: Truck,
    permission: "driver.view",
  },
  {
    href: "/gazoblok/production",
    label: "Газоблок и.ч.",
    sub: "Gazoblok production",
    icon: Hammer,
    permission: "any-auth",
  },
  {
    href: "/gazoblok/stock",
    label: "Газоблок омбор",
    sub: "Gazoblok stock",
    icon: Warehouse,
    permission: "any-auth",
  },
];

/** Items grouped under the "Созламалар · Settings" collapsible section. */
export const SETTINGS_NAV: NavItem[] = [
  {
    href: "/users",
    label: "Фойдаланувчилар",
    sub: "Users",
    icon: UserCog,
    permission: "user.view",
  },
  {
    href: "/audit",
    label: "Журнал",
    sub: "Audit log",
    icon: ScrollText,
    permission: "audit.view",
  },
  {
    href: "/pricing",
    label: "Нархлар",
    sub: "Pricing",
    icon: Coins,
    permission: "pricing.edit",
  },
  {
    href: "/table-design",
    label: "Жадвал дизайни",
    sub: "Table Designer",
    icon: TableProperties,
    permission: "pricing.edit",
  },
  {
    href: "/gazoblok/catalog",
    label: "Газоблок нархлари",
    sub: "Gazoblok catalog",
    icon: Boxes,
    permission: "any-auth",
  },
];

export function isVisible(user: AuthUser, item: NavItem): boolean {
  if (item.permission === "any-auth") return true;
  const list = Array.isArray(item.permission) ? item.permission : [item.permission];
  return canAny(user, list);
}

function NavLink({
  item,
  pathname,
  collapsed,
  onNavigate,
  indent = false,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
  indent?: boolean;
}) {
  const Icon = item.icon;
  const active = pathname === item.href || pathname.startsWith(item.href + "/");
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? `${item.label} · ${item.sub}` : undefined}
      className={cn(
        "group relative flex items-center rounded-lg outline-none min-h-11 lg:min-h-0",
        "transition-all duration-150 ease-out",
        collapsed ? "justify-center p-2.5" : cn("gap-3 py-2.5", indent ? "pl-8 pr-3.5" : "px-3.5"),
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground hover:translate-x-0.5",
      )}
    >
      {active && (
        <span className="absolute left-0 top-[20%] bottom-[20%] w-[3px] rounded-r bg-primary" />
      )}
      <Icon
        className={cn(
          "h-[17px] w-[17px] shrink-0 transition-transform duration-150 ease-out",
          active ? "text-primary" : "group-hover:scale-110",
        )}
      />
      {!collapsed && (
        <span className={cn("flex-1 text-[13px] leading-none", active ? "font-semibold" : "font-medium")}>
          {item.label}
        </span>
      )}
      {!collapsed && active && (
        <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
      )}
    </Link>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (first + last).toUpperCase().slice(0, 2) || "?";
}

const COLLAPSED_KEY = "precast.sidebar.collapsed";

/**
 * Inner sidebar body — brand header, filtered nav, user footer.
 *
 * Shared by both the desktop `Sidebar` and the mobile drawer (in
 * MobileTopbar.tsx). `collapsed` controls the slim icon-only layout
 * (desktop only). `onNavigate` lets the mobile drawer close itself
 * when a nav item is tapped.
 */
export function SidebarBody({
  user,
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}: {
  user: AuthUser;
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const lang = useLang();
  const uzOnly = lang === "uz";

  const visibleNav = NAV.filter((item) => isVisible(user, item));
  const visibleOps = OPERATIONS_NAV.filter((item) => isVisible(user, item));
  const visibleSettings = SETTINGS_NAV.filter((item) => isVisible(user, item));

  const inOps = visibleOps.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  );
  const [opsOpen, setOpsOpen] = useState(inOps);

  // Auto-open the settings group if the current page is one of the settings routes.
  const inSettings = visibleSettings.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  );
  const [settingsOpen, setSettingsOpen] = useState(inSettings);

  const customized = isUserCustomized({
    role: user.role,
    permissions: user.permissions,
  });
  const userInitials = initials(user.name);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    onNavigate?.();
    router.push("/login");
  }

  return (
    <>
      {/* Logo block */}
      <div
        className={cn(
          "h-14 flex items-center border-b border-border shrink-0",
          collapsed ? "justify-center" : "px-5 gap-3",
        )}
      >
        <div className="h-9 w-9 rounded-lg bg-primary grid place-items-center shrink-0">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="2" y="2" width="6" height="6" rx="1.5" fill="white" />
            <rect
              x="10"
              y="2"
              width="6"
              height="6"
              rx="1.5"
              fill="white"
              fillOpacity=".5"
            />
            <rect
              x="2"
              y="10"
              width="6"
              height="6"
              rx="1.5"
              fill="white"
              fillOpacity=".5"
            />
            <rect x="10" y="10" width="6" height="6" rx="1.5" fill="white" />
          </svg>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-sm font-extrabold tracking-tight text-foreground leading-tight">
              EtalonSlabs
            </div>
            <div className="text-[10px] font-medium uppercase tracking-widest text-text-tertiary leading-none">
              {uzOnly ? "Ишлаб чиқариш CRM" : "Manufacturing CRM"}
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav
        className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-0.5",
          collapsed ? "px-1.5 py-2.5" : "px-2 py-2.5",
        )}
      >
        {visibleNav.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />
        ))}

        {/* Operations group */}
        {visibleOps.length > 0 && (
          <div className={cn("mt-1", !collapsed && "border-t border-border/50 pt-1")}>
            {collapsed ? (
              visibleOps.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />
              ))
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setOpsOpen((o) => !o)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-colors",
                    inOps
                      ? "text-primary"
                      : "text-text-tertiary hover:text-foreground hover:bg-accent",
                  )}
                >
                  <Factory className="h-[15px] w-[15px] shrink-0" />
                  <span className="flex-1 text-left">Операциялар</span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
                      opsOpen && "rotate-180",
                    )}
                  />
                </button>
                {opsOpen && visibleOps.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} indent />
                ))}
              </>
            )}
          </div>
        )}

        {/* Settings group */}
        {visibleSettings.length > 0 && (
          <div className={cn("mt-1", !collapsed && "border-t border-border/50 pt-1")}>
            {collapsed ? (
              // In collapsed mode render icons directly — no group header
              visibleSettings.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />
              ))
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setSettingsOpen((o) => !o)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-colors",
                    inSettings
                      ? "text-primary"
                      : "text-text-tertiary hover:text-foreground hover:bg-accent",
                  )}
                >
                  <Settings2 className="h-[15px] w-[15px] shrink-0" />
                  <span className="flex-1 text-left">Созламалар</span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
                      settingsOpen && "rotate-180",
                    )}
                  />
                </button>
                {settingsOpen && visibleSettings.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} indent />
                ))}
              </>
            )}
          </div>
        )}
      </nav>

      {/* Footer — user info + collapse toggle + logout */}
      <div
        className={cn(
          "border-t border-border shrink-0",
          collapsed ? "px-1.5 py-2.5" : "px-2 py-2.5",
        )}
      >
        {!collapsed ? (
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <div className="h-[30px] w-[30px] rounded-full bg-primary/15 grid place-items-center shrink-0">
              <span className="text-[11px] font-bold font-mono text-primary">
                {userInitials}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold leading-tight truncate text-foreground">
                {user.name}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary flex items-center gap-1">
                <span className="truncate">{roleDisplayLabel(user.role)}</span>
                {customized ? (
                  <Pencil
                    className="h-2.5 w-2.5 shrink-0"
                    aria-label="Permissions customized"
                  />
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div
            title={`${user.name} · ${roleDisplayLabel(user.role)}`}
            className="flex items-center justify-center py-2"
          >
            <div className="h-[30px] w-[30px] rounded-full bg-primary/15 grid place-items-center">
              <span className="text-[11px] font-bold font-mono text-primary">
                {userInitials}
              </span>
            </div>
          </div>
        )}

        {/* Blender Bridge indicator — auto-hides for non-owners
            via the component's own permission check. */}
        <BlenderStatusIndicator user={user} collapsed={collapsed} />

        <div className={cn("flex gap-1 mt-1", collapsed && "flex-col")}>
          {onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={cn(
                "flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
                collapsed ? "h-8 w-full" : "h-8 w-8",
              )}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={logout}
            title={uzOnly ? "Чиқиш" : "Logout"}
            className={cn(
              "flex items-center justify-center gap-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors",
              collapsed
                ? "h-8 w-full"
                : "h-8 flex-1 px-2 text-[12px] font-medium",
            )}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span>{uzOnly ? "Чиқиш" : "Logout"}</span>}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * Persistent desktop sidebar — dark surface, collapsible. Hidden
 * below the `lg` breakpoint where the mobile topbar's drawer takes
 * over (it renders SidebarBody in always-expanded mode).
 */
export function Sidebar({ user }: { user: AuthUser }) {
  // Default expanded; after mount, hydrate from localStorage so the
  // user's preference persists across navigation.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSED_KEY) === "1") {
        setCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);
  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "hidden lg:flex shrink-0 sticky top-0 h-screen flex-col bg-card border-r border-border",
        "transition-[width] duration-200 ease-out overflow-hidden",
        collapsed ? "w-[60px]" : "w-[240px]",
      )}
    >
      <SidebarBody
        user={user}
        collapsed={collapsed}
        onToggleCollapsed={toggle}
      />
    </aside>
  );
}
