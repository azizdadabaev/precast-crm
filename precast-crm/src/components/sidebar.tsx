"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  Building2,
  FlaskConical,
  UserCog,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import {
  canAny,
  isUserCustomized,
  roleDisplayLabel,
  type Action,
} from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth";

interface NavItem {
  href: string;
  label: string; // primary (UZ)
  sub: string; // secondary (EN)
  icon: React.ComponentType<{ className?: string }>;
  /**
   * Permission(s) required to see this item. An array means ANY-of
   * (e.g. dashboard accepts both view and viewBasic). Mirrors the
   * shape of ROUTE_PERMISSIONS in src/lib/page-auth.ts so the nav
   * can never show an item the page-level gate would reject.
   */
  permission: Action | Action[];
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
    sub: "Calculations",
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
    href: "/projects",
    label: "Лойиҳалар",
    sub: "Projects",
    icon: FolderKanban,
    permission: "order.view",
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
    href: "/clients",
    label: "Мижозлар",
    sub: "Clients",
    icon: Users,
    permission: "client.view",
  },
  {
    href: "/drivers",
    label: "Ҳайдовчилар",
    sub: "Drivers",
    icon: Truck,
    permission: "driver.view",
  },
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
    href: "/sandbox/tapered",
    label: "Тажриба",
    sub: "Sandbox · Tapered",
    icon: FlaskConical,
    permission: "sandbox.access",
  },
  {
    href: "/users",
    label: "Фойдаланувчилар",
    sub: "Users",
    icon: UserCog,
    permission: "user.view",
  },
];

export function isVisible(user: AuthUser, item: NavItem): boolean {
  const list = Array.isArray(item.permission) ? item.permission : [item.permission];
  return canAny(user, list);
}

/**
 * Inner sidebar body — brand header, filtered nav, user footer.
 *
 * Shared by both the desktop `Sidebar` and the mobile drawer.
 * `onNavigate` lets the mobile drawer close itself when a nav item
 * is tapped; desktop omits it.
 */
export function SidebarBody({
  user,
  onNavigate,
}: {
  user: AuthUser;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const visibleNav = NAV.filter((item) => isVisible(user, item));
  const customized = isUserCustomized({
    role: user.role,
    permissions: user.permissions,
  });

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    onNavigate?.();
    router.push("/login");
  }

  return (
    <>
      <div className="p-5 border-b">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-md bg-primary text-primary-foreground grid place-items-center">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold leading-tight">Precast CRM</div>
            <div className="text-xs text-muted-foreground">Beam &amp; Block</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors min-h-11",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-accent",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <div className="flex-1 leading-tight">
                <div className="font-medium">{item.label}</div>
                <div
                  className={cn(
                    "text-[10px] uppercase tracking-wider",
                    active
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground",
                  )}
                >
                  {item.sub}
                </div>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t space-y-2">
        <div className="px-2">
          <div className="text-sm font-medium leading-tight truncate">
            {user.name}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className="truncate">{roleDisplayLabel(user.role)}</span>
            {customized ? (
              <Pencil
                className="h-3 w-3 shrink-0"
                aria-label="Permissions customized"
              />
            ) : null}
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start min-h-11"
          onClick={logout}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </div>
    </>
  );
}

/**
 * Persistent desktop sidebar. Hidden below the `lg` breakpoint —
 * the mobile topbar's drawer takes over there.
 */
export function Sidebar({ user }: { user: AuthUser }) {
  return (
    <aside className="hidden lg:flex w-64 shrink-0 border-r bg-card flex-col">
      <SidebarBody user={user} />
    </aside>
  );
}
