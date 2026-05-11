// etalon-ui.jsx — Modo-inspired design system

const ThemeCtx = React.createContext(null);

function getTokens(dark) {
  if (dark) return {
    bg: '#0a0c11', bgSub: '#070910',
    surface: '#10141d', surfaceHover: '#161b27', surfaceActive: '#1c2235',
    border: '#1c2133', borderStrong: '#252c40', borderMid: '#1a1f2e',
    text1: '#e4e8f4', text2: '#7d87a4', text3: '#3e4660', text4: '#252c40',
    sidebarBg: '#060810', sidebarBorder: '#0f1220',
    sidebarText: '#3e4660', sidebarHover: '#5a6580', sidebarActive: '#e4e8f4',
    sidebarActiveBg: 'rgba(78,128,255,0.14)',
    accent: '#4e80ff', accentHover: '#3d6fef', accentDim: 'rgba(78,128,255,0.12)',
    accentText: '#ffffff',
    emerald: '#10b981', emeraldDim: 'rgba(16,185,129,0.12)',
    gold: '#e8a020', goldDim: 'rgba(232,160,32,0.12)',
    danger: '#f87171', dangerDim: 'rgba(248,113,113,0.12)',
    warning: '#f59e0b', warningDim: 'rgba(245,158,11,0.12)',
    success: '#22c55e', successDim: 'rgba(34,197,94,0.12)',
    r: '10px', rSm: '6px', rXs: '4px',
    head: "'Manrope', sans-serif",
    body: "'Manrope', sans-serif",
    mono: "'JetBrains Mono', 'IBM Plex Mono', monospace",
    isDark: true,
  };
  return {
    bg: '#f3f5fb', bgSub: '#eaecf5',
    surface: '#ffffff', surfaceHover: '#f8f9fd', surfaceActive: '#eef1fa',
    border: '#dde1f0', borderStrong: '#c4cadf', borderMid: '#e4e7f2',
    text1: '#0c0f1a', text2: '#5a6488', text3: '#9aa3bf', text4: '#dde1f0',
    sidebarBg: '#060810', sidebarBorder: '#0f1220',
    sidebarText: '#3e4660', sidebarHover: '#5a6580', sidebarActive: '#e4e8f4',
    sidebarActiveBg: 'rgba(78,128,255,0.14)',
    accent: '#4e80ff', accentHover: '#3d6fef', accentDim: 'rgba(78,128,255,0.10)',
    accentText: '#ffffff',
    emerald: '#059669', emeraldDim: 'rgba(5,150,105,0.10)',
    gold: '#b45309', goldDim: 'rgba(180,83,9,0.10)',
    danger: '#dc2626', dangerDim: 'rgba(220,38,38,0.08)',
    warning: '#d97706', warningDim: 'rgba(217,119,6,0.08)',
    success: '#16a34a', successDim: 'rgba(22,163,74,0.08)',
    r: '10px', rSm: '6px', rXs: '4px',
    head: "'Manrope', sans-serif",
    body: "'Manrope', sans-serif",
    mono: "'JetBrains Mono', 'IBM Plex Mono', monospace",
    isDark: false,
  };
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const PATHS = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></>,
  calculator: <><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="14"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/></>,
  orders: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
  projects: <><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="9" y1="14" x2="9" y2="18"/><line x1="12" y1="12" x2="12" y2="18"/><line x1="15" y1="16" x2="15" y2="18"/></>,
  clients: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  payments: <><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
  discrepancies: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
  drivers: <><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11v12"/><path d="M16 17h3a2 2 0 0 0 2-2v-4l-1.68-5.02A2 2 0 0 0 17.4 4H14"/><circle cx="10" cy="17" r="2"/><circle cx="19" cy="17" r="2"/></>,
  production: <><path d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0a2.12 2.12 0 0 1 0-3L12 9"/><path d="M17.64 15 22 10.64"/><path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91"/></>,
  warehouse: <><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M15 22v-4a3 3 0 0 0-6 0v4"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  sandbox: <><path d="M10 2v8L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45L14 10V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
  search: <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>,
  moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></>,
  chevronRight: <polyline points="9 18 15 12 9 6"/>,
  chevronLeft: <polyline points="15 18 9 12 15 6"/>,
  plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
  trendUp: <><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></>,
  trendDown: <><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></>,
  x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  check: <polyline points="20 6 9 17 4 12"/>,
  arrowRight: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
  moreH: <><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>,
  bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
};

function Icon({ name, size = 16, style = {}, className = '' }) {
  const p = PATHS[name];
  if (!p) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      style={style} className={className}>{p}</svg>
  );
}

// ── Status / Payment badge maps ───────────────────────────────────────────────
const STATUS_MAP = {
  PLACED:        { label:'Placed',        pip:'accent',   step:1 },
  IN_PRODUCTION: { label:'In Production', pip:'warning',  step:2 },
  DISPATCHED:    { label:'Dispatched',    pip:'gold',     step:3 },
  DELIVERED:     { label:'Delivered',     pip:'success',  step:4 },
  CANCELED:      { label:'Canceled',      pip:'danger',   step:0 },
};
const PAY_MAP = {
  AWAITING:       { label:'Awaiting',  col:'warning' },
  PARTIALLY_PAID: { label:'Partial',   col:'accent' },
  FULLY_PAID:     { label:'Paid',      col:'success' },
};

function pipColor(pip, t) {
  return { accent: t.accent, warning: t.warning, gold: t.gold, success: t.success, danger: t.danger, emerald: t.emerald }[pip] || t.text2;
}

// ── Chip ──────────────────────────────────────────────────────────────────────
function Chip({ children, col, t }) {
  if (col === 'neutral' || col === 'default') {
    return (
      <span style={{
        display:'inline-flex', alignItems:'center', gap:'5px',
        padding:'3px 9px', borderRadius:'20px',
        fontSize:'11px', fontWeight:'600', fontFamily:t.mono,
        letterSpacing:'0.04em', textTransform:'uppercase',
        background:t.bgSub, color:t.text3, border:`1px solid ${t.border}`,
        whiteSpace:'nowrap',
      }}>{children}</span>
    );
  }
  const c = pipColor(col, t);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '3px 9px', borderRadius: '20px',
      fontSize: '11px', fontWeight: '600', fontFamily: t.mono,
      letterSpacing: '0.04em', textTransform: 'uppercase',
      background: `${c}18`, color: c, border: `1px solid ${c}28`,
      whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

// ── Kpi Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, labelUz, value, unit, meta, trend, trendGood, attention, t }) {
  const attBorder = attention === 'danger' ? t.danger : attention === 'warning' ? t.warning : null;
  return (
    <div style={{
      background: t.surface,
      border: `1px solid ${t.border}`,
      borderLeft: attBorder ? `3px solid ${attBorder}` : `1px solid ${t.border}`,
      borderRadius: t.r,
      padding: '22px 24px',
      display: 'flex', flexDirection: 'column', gap: '8px',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* label row */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px' }}>
        <span style={{
          fontSize: '11px', fontWeight: '600', letterSpacing: '0.08em',
          textTransform: 'uppercase', color: t.text2, fontFamily: t.body,
          whiteSpace: 'nowrap',
        }}>{label}</span>
        {trend != null && (
          <span style={{
            display:'inline-flex', alignItems:'center', gap:'3px',
            fontSize:'11px', fontWeight:'600', padding:'2px 7px',
            borderRadius:'20px', fontFamily: t.mono,
            background: trendGood ? t.successDim : t.dangerDim,
            color: trendGood ? t.success : t.danger,
          }}>
            <Icon name={trendGood ? 'trendUp' : 'trendDown'} size={10}/>
            {trend}
          </span>
        )}
      </div>
      {/* value */}
      <div style={{ display:'flex', alignItems:'baseline', gap:'6px', flexWrap:'wrap', minWidth:0 }}>
        <span style={{
          fontSize:'26px', fontWeight:'800', letterSpacing:'-0.03em',
          color: attBorder ? attBorder : t.text1, fontFamily: t.head,
          fontVariantNumeric:'tabular-nums', lineHeight:1.1,
          whiteSpace:'nowrap',
        }}>{value}</span>
        {unit && <span style={{ fontSize:'11px', color:t.text3, fontFamily:t.mono, flexShrink:0 }}>{unit}</span>}
      </div>
      {meta && <div style={{ fontSize:'12px', color:t.text3, fontFamily:t.body }}>{meta}</div>}
    </div>
  );
}

// ── Section head ─────────────────────────────────────────────────────────────
function SectionHead({ children, t }) {
  return (
    <div style={{
      fontSize: '11px', fontWeight: '700', letterSpacing: '0.10em',
      textTransform: 'uppercase', color: t.text3, fontFamily: t.body,
      marginBottom: '14px',
      display: 'flex', alignItems: 'center', gap: '10px',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ flexShrink: 0 }}>{children}</span>
      <div style={{ flex:1, height:'1px', background: t.border, minWidth: 10 }}/>
    </div>
  );
}

// ── Page title ────────────────────────────────────────────────────────────────
function PageTitle({ uz, en, sub, t, right }) {
  return (
    <div style={{
      display:'flex', alignItems:'flex-start', justifyContent:'space-between',
      marginBottom:'28px', gap:'16px', flexWrap:'wrap',
    }}>
      <div>
        <h1 style={{
          fontSize:'22px', fontWeight:'800', letterSpacing:'-0.025em',
          color:t.text1, fontFamily:t.head, margin:0,
          display:'flex', alignItems:'baseline', gap:'10px', flexWrap:'wrap',
        }}>
          {uz}
          {en && <span style={{ fontSize:'14px', fontWeight:'500', color:t.text3, fontFamily:t.body }}>· {en}</span>}
        </h1>
        {sub && <p style={{ fontSize:'13px', color:t.text3, fontFamily:t.body, margin:'5px 0 0', lineHeight:1.5 }}>{sub}</p>}
      </div>
      {right && <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>{right}</div>}
    </div>
  );
}

// ── Btn ───────────────────────────────────────────────────────────────────────
function Btn({ children, variant = 'primary', t, icon, onClick, small }) {
  const isPrimary = variant === 'primary';
  const isGhost = variant === 'ghost';
  return (
    <button onClick={onClick} style={{
      display:'inline-flex', alignItems:'center', gap:'7px',
      padding: small ? '6px 14px' : '9px 18px',
      borderRadius: t.rSm,
      background: isPrimary ? t.accent : isGhost ? 'transparent' : t.surface,
      color: isPrimary ? '#fff' : t.text1,
      border: isPrimary ? 'none' : `1px solid ${t.border}`,
      cursor:'pointer', fontSize: small ? '12px' : '13px',
      fontWeight:'600', fontFamily:t.body, letterSpacing:'0.01em',
      transition:'all 120ms', whiteSpace:'nowrap',
    }}
    onMouseEnter={e => { if (isPrimary) e.currentTarget.style.background = t.accentHover; else e.currentTarget.style.background = t.surfaceHover; }}
    onMouseLeave={e => { if (isPrimary) e.currentTarget.style.background = t.accent; else e.currentTarget.style.background = isPrimary ? t.accent : isGhost ? 'transparent' : t.surface; }}
    >
      {icon && <Icon name={icon} size={14}/>}
      {children}
    </button>
  );
}

// ── Search bar ────────────────────────────────────────────────────────────────
function SearchBar({ value, onChange, placeholder, t }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:'10px',
      padding:'9px 14px', background:t.surface,
      border:`1px solid ${t.border}`, borderRadius:t.rSm,
      flex:1, maxWidth:340,
      transition:'border-color 150ms',
    }}>
      <Icon name="search" size={14} style={{ color:t.text3, flexShrink:0 }}/>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          border:'none', outline:'none', background:'transparent',
          fontSize:'13px', fontFamily:t.body, color:t.text1, width:'100%',
        }}
      />
    </div>
  );
}

Object.assign(window, { ThemeCtx, getTokens, Icon, Chip, KpiCard, SectionHead, PageTitle, Btn, SearchBar, STATUS_MAP, PAY_MAP, pipColor });
