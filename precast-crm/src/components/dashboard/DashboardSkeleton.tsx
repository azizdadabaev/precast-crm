"use client";

import { SkeletonCard } from "./Skeleton";
import { useT } from "@/lib/i18n";

/**
 * Skeleton placeholder for the dashboard — same grid as the live
 * version (4 + 4 + 3) so there's no layout shift when data arrives.
 */
export function DashboardSkeleton() {
  const t = useT();
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>
          Бошқарув<span className="lang-en"> · Dashboard</span>
        </h1>
        <p>
          {t(
            "Даромад, операциялар ва мижозлар фаолиятининг реал вақтдаги кўриниши.",
            "Real-time view of revenue, operations, and customer activity.",
          )}
        </p>
      </header>

      <section className="dashboard-section">
        <h2>{t("Молиявий ҳолат", "Financial health")}</h2>
        <div className="dashboard-grid dashboard-grid-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <h2>{t("Операцион ҳолат", "Operational status")}</h2>
        <div className="dashboard-grid dashboard-grid-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <h2>{t("Бизнес кўрсаткичлари", "Business insights")}</h2>
        <div className="dashboard-grid dashboard-grid-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} wide />
          ))}
        </div>
      </section>
    </div>
  );
}
