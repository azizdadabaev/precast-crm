"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/crew-pay", label: "Умумий" },
  { href: "/crew-pay/days", label: "Кунлик журнал" },
  { href: "/crew-pay/ledger", label: "Касса" },
  { href: "/crew-pay/pay", label: "Иш ҳақи" },
  { href: "/crew-pay/workers", label: "Ишчилар" },
  { href: "/crew-pay/settings", label: "Созламалар" },
];

export default function CrewPayLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path.startsWith("/crew-pay/payslip")) return <>{children}</>; // print page: no chrome
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Бригада маоши
          <span className="lang-en text-muted-foreground font-normal text-base"> · Crew pay</span>
        </h1>
        <p className="text-sm text-muted-foreground">10 см блок бригадаси — ҳар бир сифатли блок учун ҳақ</p>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => {
          const active = t.href === "/crew-pay" ? path === t.href : path.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href}
              className={cn("whitespace-nowrap px-3 py-2.5 text-sm border-b-2 -mb-px min-h-[44px] flex items-center",
                active ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
