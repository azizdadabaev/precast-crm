// etalon-layout.jsx — Icon-rail sidebar + topbar

const NAV = [
  { id:'dashboard',     uz:'Бошқарув',       en:'Dashboard',     icon:'dashboard' },
  { id:'calculator',    uz:'Калькулятор',     en:'Calculator',    icon:'calculator' },
  { id:'orders',        uz:'Буюртмалар',      en:'Orders',        icon:'orders' },
  { id:'projects',      uz:'Лойиҳалар',       en:'Projects',      icon:'projects' },
  { id:'clients',       uz:'Мижозлар',        en:'Clients',       icon:'clients' },
  { id:'payments',      uz:'Тўловлар',        en:'Payments',      icon:'payments' },
  { id:'discrepancies', uz:'Тафовутлар',      en:'Discrepancies', icon:'discrepancies' },
  { id:'drivers',       uz:'Ҳайдовчилар',     en:'Drivers',       icon:'drivers' },
  { id:'production',    uz:'Ишлаб чиқариш',   en:'Production',    icon:'production' },
  { id:'warehouse',     uz:'Омбор',           en:'Warehouse',     icon:'warehouse' },
  { id:'sandbox',       uz:'Тажриба',         en:'Sandbox · Tapered', icon:'sandbox' },
  { id:'users',         uz:'Фойдаланувчилар', en:'Users',         icon:'users' },
];

// ── Logo ──────────────────────────────────────────────────────────────────────
function Logo({ expanded, t }) {
  return (
    <div style={{
      height: 56, display:'flex', alignItems:'center',
      padding: expanded ? '0 20px' : '0',
      justifyContent: expanded ? 'flex-start' : 'center',
      borderBottom:`1px solid ${t.sidebarBorder}`,
      flexShrink: 0, gap: 12,
    }}>
      {/* Mark */}
      <div style={{
        width:34, height:34, borderRadius:'9px',
        background: t.accent,
        display:'flex', alignItems:'center', justifyContent:'center',
        flexShrink:0,
      }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect x="2" y="2" width="6" height="6" rx="1.5" fill="white"/>
          <rect x="10" y="2" width="6" height="6" rx="1.5" fill="white" fillOpacity=".5"/>
          <rect x="2" y="10" width="6" height="6" rx="1.5" fill="white" fillOpacity=".5"/>
          <rect x="10" y="10" width="6" height="6" rx="1.5" fill="white"/>
        </svg>
      </div>
      {expanded && (
        <div>
          <div style={{
            fontSize:'14px', fontWeight:'800', letterSpacing:'-0.02em',
            color:'#fff', fontFamily:t.head, lineHeight:1.2,
          }}>EtalonSlabs</div>
          <div style={{
            fontSize:'10px', fontWeight:'500', letterSpacing:'0.08em',
            color: t.sidebarText, textTransform:'uppercase', lineHeight:1,
          }}>Manufacturing CRM</div>
        </div>
      )}
    </div>
  );
}

// ── Nav item ──────────────────────────────────────────────────────────────────
function NavItem({ item, active, expanded, t, onClick }) {
  const [hov, setHov] = React.useState(false);
  const isActive = active === item.id;

  return (
    <button
      onClick={() => onClick(item.id)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={!expanded ? `${item.uz}  ·  ${item.en}` : undefined}
      style={{
        display:'flex', alignItems:'center',
        gap: expanded ? 12 : 0,
        padding: expanded ? '10px 14px' : '10px 0',
        justifyContent: expanded ? 'flex-start' : 'center',
        width:'100%', border:'none', cursor:'pointer',
        borderRadius:'8px',
        background: isActive ? t.sidebarActiveBg : hov ? 'rgba(255,255,255,0.04)' : 'transparent',
        transition:'background 120ms',
        color: isActive ? t.sidebarActive : hov ? t.sidebarHover : t.sidebarText,
        outline:'none', position:'relative',
      }}
    >
      {/* Active indicator bar */}
      {isActive && (
        <div style={{
          position:'absolute', left:0, top:'20%', bottom:'20%',
          width:'3px', borderRadius:'0 3px 3px 0',
          background: t.accent,
        }}/>
      )}
      <Icon name={item.icon} size={17} style={{
        flexShrink:0,
        color: isActive ? t.accent : hov ? t.sidebarHover : t.sidebarText,
        transition:'color 120ms',
      }}/>
      {expanded && (
        <span style={{
          fontSize:'13px', fontWeight: isActive ? '600' : '500',
          fontFamily:t.body, lineHeight:1,
          color: isActive ? t.sidebarActive : hov ? t.sidebarHover : t.sidebarText,
          transition:'color 120ms',
          flex:1, textAlign:'left',
        }}>{item.uz}</span>
      )}
      {expanded && isActive && (
        <div style={{
          width:6, height:6, borderRadius:'50%',
          background: t.accent, flexShrink:0,
        }}/>
      )}
    </button>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ page, onNavigate, t, expanded, onToggle }) {
  return (
    <aside style={{
      width: expanded ? 240 : 60,
      minWidth: expanded ? 240 : 60,
      background: t.sidebarBg,
      borderRight: `1px solid ${t.sidebarBorder}`,
      display:'flex', flexDirection:'column',
      height:'100vh', position:'sticky', top:0,
      transition:'width 220ms cubic-bezier(.4,0,.2,1), min-width 220ms cubic-bezier(.4,0,.2,1)',
      overflow:'hidden', flexShrink:0,
    }}>
      <Logo expanded={expanded} t={t}/>

      {/* Nav */}
      <nav style={{
        flex:1, overflowY:'auto', overflowX:'hidden',
        padding: expanded ? '10px 8px' : '10px 6px',
        display:'flex', flexDirection:'column', gap:'2px',
      }}>
        {NAV.map(item => (
          <NavItem key={item.id} item={item} active={page}
            expanded={expanded} t={t} onClick={onNavigate}/>
        ))}
      </nav>

      {/* Footer */}
      <div style={{
        borderTop:`1px solid ${t.sidebarBorder}`,
        padding: expanded ? '10px 8px' : '10px 6px',
        display:'flex', flexDirection:'column', gap:'2px',
      }}>
        {/* User row */}
        {expanded ? (
          <div style={{
            display:'flex', alignItems:'center', gap:'10px',
            padding:'8px 10px',
          }}>
            <div style={{
              width:30, height:30, borderRadius:'50%',
              background:`${t.accent}20`,
              display:'flex', alignItems:'center', justifyContent:'center',
              flexShrink:0,
            }}>
              <span style={{ fontSize:'11px', fontFamily:t.mono, color:t.accent, fontWeight:'700' }}>AD</span>
            </div>
            <div style={{ minWidth:0, flex:1 }}>
              <div style={{ fontSize:'13px', fontFamily:t.body, color:'#c8cfe0', fontWeight:'600', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>Aziz Dadabaev</div>
              <div style={{ fontSize:'10px', fontFamily:t.mono, color:t.sidebarText, letterSpacing:'0.06em', textTransform:'uppercase' }}>Admin</div>
            </div>
          </div>
        ) : (
          <button title="Aziz Dadabaev · Admin" style={{
            display:'flex', alignItems:'center', justifyContent:'center',
            padding:'8px 0', background:'transparent', border:'none', cursor:'pointer',
          }}>
            <div style={{
              width:28, height:28, borderRadius:'50%',
              background:`${t.accent}20`,
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <span style={{ fontSize:'11px', fontFamily:t.mono, color:t.accent, fontWeight:'700' }}>AD</span>
            </div>
          </button>
        )}

        {/* Settings + Toggle row */}
        <div style={{ display:'flex', gap:'4px', justifyContent: expanded ? 'flex-start' : 'center' }}>
          <button
            onClick={onToggle}
            title={expanded ? 'Collapse' : 'Expand'}
            style={{
              display:'flex', alignItems:'center', justifyContent:'center',
              width:34, height:34, borderRadius:'8px',
              background:'transparent', border:'none', cursor:'pointer',
              color:t.sidebarText, transition:'all 120ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.06)'; e.currentTarget.style.color=t.sidebarHover; }}
            onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color=t.sidebarText; }}
          >
            <Icon name={expanded ? 'chevronLeft' : 'chevronRight'} size={15}/>
          </button>
          {expanded && (
            <button style={{
              display:'flex', alignItems:'center', justifyContent:'center',
              width:34, height:34, borderRadius:'8px',
              background:'transparent', border:'none', cursor:'pointer',
              color:t.sidebarText, transition:'all 120ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.06)'; e.currentTarget.style.color=t.sidebarHover; }}
            onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color=t.sidebarText; }}
            >
              <Icon name="settings" size={15}/>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

// ── Top bar ───────────────────────────────────────────────────────────────────
function TopBar({ page, t, dark, onToggleDark }) {
  const names = {
    dashboard:['Бошқарув','Dashboard'], calculator:['Калькулятор','Calculator'],
    orders:['Буюртмалар','Orders'], projects:['Лойиҳалар','Projects'],
    clients:['Мижозлар','Clients'], payments:['Тўловлар','Payments'],
    discrepancies:['Тафовутлар','Discrepancies'], drivers:['Ҳайдовчилар','Drivers'],
    production:['Ишлаб чиқариш','Production'], warehouse:['Омбор','Warehouse'],
  };
  const [uz, en] = names[page] || ['—','—'];

  return (
    <header style={{
      height:52, display:'flex', alignItems:'center',
      justifyContent:'space-between',
      padding:'0 24px',
      borderBottom:`1px solid ${t.border}`,
      background: t.isDark ? t.bgSub : t.surface,
      flexShrink:0,
    }}>
      {/* Breadcrumb */}
      <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
        <span style={{ fontSize:'12px', color:t.text3, fontFamily:t.body }}>EtalonSlabs</span>
        <span style={{ color:t.border, fontSize:'16px', lineHeight:1 }}>/</span>
        <span style={{ fontSize:'13px', color:t.text1, fontFamily:t.body, fontWeight:'600' }}>{uz}</span>
        <span style={{
          fontSize:'10px', color:t.text3, fontFamily:t.mono,
          background:t.bgSub, border:`1px solid ${t.border}`,
          padding:'1px 7px', borderRadius:'20px', letterSpacing:'0.06em',
        }}>{en}</span>
      </div>

      {/* Right side */}
      <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
        {/* Search */}
        <div style={{
          display:'flex', alignItems:'center', gap:'8px',
          padding:'6px 12px',
          background: t.isDark ? t.surface : t.bg,
          border:`1px solid ${t.border}`, borderRadius:t.rSm,
          cursor:'text',
        }}>
          <Icon name="search" size={13} style={{ color:t.text3 }}/>
          <span style={{ fontSize:'12px', fontFamily:t.body, color:t.text3 }}>Search…</span>
          <kbd style={{
            fontSize:'10px', fontFamily:t.mono, color:t.text3,
            background:t.border, padding:'1px 5px', borderRadius:'4px',
          }}>⌘K</kbd>
        </div>

        {/* Notifications */}
        <button style={{
          width:34, height:34, borderRadius:t.rSm,
          background:'transparent', border:`1px solid ${t.border}`,
          display:'flex', alignItems:'center', justifyContent:'center',
          cursor:'pointer', color:t.text2, position:'relative',
        }}>
          <Icon name="bell" size={15}/>
          <div style={{
            position:'absolute', top:8, right:8,
            width:6, height:6, borderRadius:'50%',
            background:t.accent, border:`2px solid ${t.isDark ? t.bgSub : t.surface}`,
          }}/>
        </button>

        {/* Dark toggle */}
        <button onClick={onToggleDark} style={{
          width:34, height:34, borderRadius:t.rSm,
          background:'transparent', border:`1px solid ${t.border}`,
          display:'flex', alignItems:'center', justifyContent:'center',
          cursor:'pointer', color:t.text2,
        }}>
          <Icon name={dark ? 'sun' : 'moon'} size={15}/>
        </button>

        {/* Avatar */}
        <div style={{
          width:32, height:32, borderRadius:'50%',
          background:`${t.accent}22`,
          border:`2px solid ${t.accent}40`,
          display:'flex', alignItems:'center', justifyContent:'center',
          cursor:'pointer',
        }}>
          <span style={{ fontSize:'11px', fontFamily:t.mono, color:t.accent, fontWeight:'700' }}>AD</span>
        </div>
      </div>
    </header>
  );
}

Object.assign(window, { Sidebar, TopBar });
