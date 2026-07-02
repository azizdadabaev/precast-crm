'use client';

import Link from 'next/link';

interface ClientRow {
  id: string;
  name: string;
  totalRevenue: number;
  orderCount: number;
}

interface Props {
  clients: ClientRow[];
}

function fmt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
}

export function TopClients({ clients }: Props) {
  const maxRevenue = Math.max(...clients.map(c => c.totalRevenue), 1);

  return (
    <div style={{
      background: 'var(--dash-surface)',
      border: '1px solid var(--dash-line)',
      borderRadius: 'var(--dash-radius)',
      padding: '20px 22px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
        <h3 style={{
          margin: 0,
          fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 19,
          color: 'var(--dash-ink)',
        }}>Энг тўрти мижозлар</h3>
        <span style={{ fontFamily: 'var(--font-num)', fontSize: 11, color: 'var(--dash-muted)' }}>12 ой</span>
      </div>

      {clients.length === 0 && (
        <p style={{ fontFamily: 'var(--font-body-alt)', fontSize: 13, color: 'var(--dash-muted)' }}>
          Маълумот йўқ
        </p>
      )}

      {clients.map(c => {
        const pct = (c.totalRevenue / maxRevenue) * 100;
        return (
          <div key={c.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '11px 0', borderTop: '1px solid var(--dash-line)',
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              background: 'color-mix(in srgb, var(--dash-accent) 14%, transparent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-num)', fontWeight: 700, fontSize: 12,
              color: 'var(--dash-accent)',
            }}>
              {initials(c.name)}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <Link href={`/clients/${c.id}`} style={{
                  fontFamily: 'var(--font-body-alt)', fontWeight: 600, fontSize: 13.5,
                  color: 'var(--dash-ink)', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  textDecoration: 'none',
                }}>{c.name}</Link>
                <span style={{
                  fontFamily: 'var(--font-num)', fontSize: 12.5, fontWeight: 600,
                  color: 'var(--dash-ink)', whiteSpace: 'nowrap',
                  fontVariantNumeric: 'tabular-nums',
                }}>{fmt(c.totalRevenue)}</span>
              </div>
              <div style={{
                height: 5, borderRadius: 4, background: 'var(--dash-surface2)',
                margin: '6px 0 4px', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 4,
                  background: 'var(--dash-accent)',
                  width: `${pct}%`,
                }} />
              </div>
              <span style={{ fontFamily: 'var(--font-body-alt)', fontSize: 11.5, color: 'var(--dash-muted)' }}>
                {c.orderCount} та буюртма
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
