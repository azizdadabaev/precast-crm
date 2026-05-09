"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Building2,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { useRouter } from "next/navigation";

interface NavItem {
  href: string;
  label: string;        // primary (UZ)
  sub: string;          // secondary (EN)
  icon: React.ComponentType<{ className?: string }>;
}

interface NavItemWithGate extends NavItem {
  /** When set, only these roles see this nav item. Undefined = visible to all. */
  roles?: Array<"ADMIN" | "OWNER" | "SALES" | "ENGINEER" | "OPERATOR">;
}

const NAV: NavItemWithGate[] = [
  { href: "/dashboard",    label: "Бошқарув",       sub: "Dashboard",     icon: LayoutDashboard },
  { href: "/calculations", label: "Калькулятор",    sub: "Calculations",  icon: Calculator },
  { href: "/orders",       label: "Буюртмалар",     sub: "Orders",        icon: PackageCheck },
  { href: "/projects",     label: "Лойиҳалар",      sub: "Projects",      icon: FolderKanban },
  { href: "/payments",     label: "Тўловлар",       sub: "Payments",      icon: Wallet },
  { href: "/discrepancies",label: "Тафовутлар",     sub: "Discrepancies", icon: AlertTriangle, roles: ["ADMIN", "OWNER"] },
  { href: "/clients",      label: "Мижозлар",       sub: "Clients",       icon: Users },
  { href: "/drivers",      label: "Ҳайдовчилар",    sub: "Drivers",       icon: Truck },
  { href: "/production",   label: "Ишлаб чиқариш",  sub: "Production",    icon: Hammer },
  { href: "/inventory",    label: "Омбор",          sub: "Warehouse",     icon: Warehouse },
  { href: "/sandbox/tapered", label: "Тажриба",     sub: "Sandbox · Tapered", icon: FlaskConical, roles: ["ADMIN"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userRole, setUserRole] = useState<string | null>(null);

  // Pull the current role once so role-gated nav items hide for users
  // who can't access them. Server still enforces auth on each route.
  useEffect(() => {
    let alive = true;
    api<{ role: string }>("/api/auth/me")
      .then((u) => {
        if (alive) setUserRole(u.role);
      })
      .catch(() => {
        /* unauthenticated; the middleware will redirect */
      });
    return () => {
      alive = false;
    };
  }, []);

  const visibleNav = NAV.filter(
    (item) => !item.roles || (userRole && item.roles.includes(userRole as never)),
  );

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <aside className="w-64 shrink-0 border-r bg-card flex flex-col">
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
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
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
                    active ? "text-primary-foreground/70" : "text-muted-foreground",
                  )}
                >
                  {item.sub}
                </div>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t">
        <Button variant="ghost" className="w-full justify-start" onClick={logout}>
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </div>
    </aside>
  );
}
