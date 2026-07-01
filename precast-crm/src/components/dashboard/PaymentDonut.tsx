'use client';

interface Props {
  breakdown: { paid: number; partial: number; awaiting: number };
}

export function PaymentDonut({ breakdown }: Props) {
  const total = breakdown.paid + breakdown.partial + breakdown.awaiting;
  const size = 148, r = 54, sw = 18, cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * r;

  const segs = [
    { count: breakdown.paid,     color: 'var(--dash-pos)',    label: 'Тўланган' },
    { count: breakdown.partial,  color: 'var(--dash-accent)', label: 'Қисман' },
    { count: breakdown.awaiting, color: 'var(--dash-muted)',  label: 'Кутилмоқда' },
  ];

  let acc = 0;
  const arcs = segs.map((seg, i) => {
    if (total === 0 || seg.count === 0) return null;
    const frac = seg.count / total;
    const len = C * frac;
    const gap = C - len;
    const offset = -C * acc;
    acc += frac;
    return (
      <circle
        key={i}
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={seg.color}
        strokeWidth={sw}
        strokeDasharray={`${len} ${gap}`}
        strokeDashoffset={offset}
        strokeLinecap="butt"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    );
  });

  const paidPct = total > 0 ? Math.round((breakdown.paid / total) * 100) : 0;

  return (
    <div style={{
      background: 'var(--dash-surface)',
      border: '1px solid var(--dash-line)',
      borderRadius: 'var(--dash-radius)',
      padding: '20px 22px',
    }}>
      <h3 style={{
        margin: '0 0 4px',
        fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 19,
        color: 'var(--dash-ink)',
      }}>Тўлов ҳолати</h3>
      <span style={{ fontFamily: 'var(--font-body-alt)', fontSize: 12, color: 'var(--dash-muted)' }}>
        {total} та буюртма
      </span>

      <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0 16px' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Track */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--dash-surface2)" strokeWidth={sw} />
          {arcs}
          <text
            x={cx} y={cy - 4} textAnchor="middle"
            fill="var(--dash-ink)" fontSize={30} fontWeight={700}
            fontFamily="var(--font-num)"
          >{paidPct}%</text>
          <text
            x={cx} y={cy + 16} textAnchor="middle"
            fill="var(--dash-muted)" fontSize={11}
            fontFamily="var(--font-body-alt)"
          >тўланган</text>
        </svg>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {segs.map((seg) => (
          <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{
              width: 9, height: 9, borderRadius: 3, flexShrink: 0,
              background: seg.color,
            }} />
            <span style={{ flex: 1, fontFamily: 'var(--font-body-alt)', fontSize: 13, color: 'var(--dash-ink)' }}>
              {seg.label}
            </span>
            <span style={{
              fontFamily: 'var(--font-num)', fontSize: 13, fontWeight: 700,
              color: 'var(--dash-ink)', fontVariantNumeric: 'tabular-nums',
            }}>{seg.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
