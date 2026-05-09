"use client";

import { SkeletonCard } from "./Skeleton";

/**
 * Skeleton placeholder for the dashboard — same grid as the live
 * version (4 + 4 + 3) so there's no layout shift when data arrives.
 */
export function DashboardSkeleton() {
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Бошқарув · Dashboard</h1>
        <p>Real-time view of revenue, operations, and customer activity.</p>
      </header>

      <section className="dashboard-section">
        <h2>Financial health</h2>
        <div className="dashboard-grid dashboard-grid-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <h2>Operational status</h2>
        <div className="dashboard-grid dashboard-grid-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <h2>Business insights</h2>
        <div className="dashboard-grid dashboard-grid-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} wide />
          ))}
        </div>
      </section>
    </div>
  );
}
