"use client";

/**
 * Skeleton card — same shape as a real KPI card so the layout doesn't
 * shift when data arrives. Three shimmer lines: label, value, meta.
 */
export function SkeletonCard({ wide = false }: { wide?: boolean }) {
  return (
    <article className={`dash-card ${wide ? "dash-card-wide" : ""}`}>
      <div className="dash-skeleton-line" style={{ width: "40%", height: 12 }} />
      <div
        className="dash-skeleton-line"
        style={{ width: "60%", height: 28, marginTop: 12 }}
      />
      {!wide && (
        <div
          className="dash-skeleton-line"
          style={{ width: "30%", height: 10, marginTop: 8 }}
        />
      )}
      {wide && (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="dash-skeleton-line"
              style={{ width: `${100 - i * 8}%`, height: 12 }}
            />
          ))}
        </div>
      )}
    </article>
  );
}
