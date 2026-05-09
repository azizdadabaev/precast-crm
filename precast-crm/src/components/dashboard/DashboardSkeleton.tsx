"use client";

/**
 * Skeleton placeholder for the dashboard — same grid as the live
 * version (4 + 4 + 3 cards across 3 sections) so there's no layout
 * shift when data arrives. Uses the design-system pulse animation.
 */
export function DashboardSkeleton() {
  return (
    <div className="dashboard-page space-y-12">
      <header>
        <div
          className="ds-skeleton-card"
          style={{ height: 48, minHeight: 0, padding: 0, width: "60%" }}
        />
      </header>
      {[4, 4, 3].map((cols, sectionIdx) => (
        <section key={sectionIdx}>
          <div
            className="ds-skeleton-card mb-5"
            style={{ height: 32, minHeight: 0, padding: 0, width: 240 }}
          />
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 ${
              cols === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"
            } gap-5`}
          >
            {Array.from({ length: cols }).map((_, i) =>
              cols === 3 ? (
                <div key={i} className="ds-skeleton-info-card" />
              ) : (
                <div key={i} className="ds-skeleton-card" />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
