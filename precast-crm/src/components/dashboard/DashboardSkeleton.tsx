'use client';

function SkeletonBlock({ height, radius = 8 }: { height: number; radius?: number }) {
  return (
    <div style={{
      height, borderRadius: radius,
      background: 'var(--dash-surface2)',
      animation: 'pulse 1.5s ease-in-out infinite',
    }} />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="dashboard-root" style={{
      background: 'var(--dash-bg)', minHeight: '100%',
      fontFamily: 'var(--font-body-alt)',
    }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '34px 28px 64px' }}>
        {/* Header */}
        <div style={{ marginBottom: 26 }}>
          <SkeletonBlock height={48} radius={10} />
          <div style={{ marginTop: 10 }}><SkeletonBlock height={20} radius={6} /></div>
        </div>
        {/* Hero */}
        <SkeletonBlock height={340} radius={14} />
        <div style={{ height: 34 }} />
        {/* Financial KPIs */}
        <SkeletonBlock height={14} radius={4} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginTop: 14, marginBottom: 34 }}>
          {[0, 1, 2, 3].map(i => <SkeletonBlock key={i} height={160} radius={14} />)}
        </div>
        {/* Operational KPIs */}
        <SkeletonBlock height={14} radius={4} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginTop: 14, marginBottom: 34 }}>
          {[0, 1, 2, 3].map(i => <SkeletonBlock key={i} height={160} radius={14} />)}
        </div>
        {/* Bottom widgets */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr 0.85fr', gap: 16 }}>
          {[0, 1, 2].map(i => <SkeletonBlock key={i} height={380} radius={14} />)}
        </div>
      </div>
    </div>
  );
}
