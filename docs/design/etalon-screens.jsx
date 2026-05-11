// etalon-screens.jsx — Full data fidelity, Modo visual style

// ── Demo data (all original fields) ──────────────────────────────────────────
const ORDERS_DATA = [
  { id:'1', num:'2026-05-0041', client:'Алиев Construction',  phone:'+998 90 111 22 33', address:'Toshkent, Яшнобод tumani',           area:'6.20', total:'1 240 000', paid:'1 240 000', status:'DELIVERED',    payment:'FULLY_PAID',     sched:'12 May 2026', ago:'2h ago',  schedDay:12 },
  { id:'2', num:'2026-05-0040', client:'BuildPro Group',       phone:'+998 93 555 44 66', address:'Samarqand, Registon ko\'chasi 12',    area:'4.06', total:'893 200',   paid:'0',         status:'DISPATCHED',   payment:'AWAITING',       sched:'12 May 2026', ago:'5h ago',  schedDay:12 },
  { id:'3', num:'2026-05-0039', client:'Каримов LLC',          phone:'+998 77 123 45 67', address:'Toshkent, Mirzo-Ulug\'bek',           area:'8.12', total:'1 785 600', paid:'900 000',   status:'IN_PRODUCTION',payment:'PARTIALLY_PAID', sched:'14 May 2026', ago:'1d ago',  schedDay:14 },
  { id:'4', num:'2026-05-0038', client:'Mega Construct',       phone:'+998 91 777 88 99', address:'Namangan, Markaziy ko\'chasi 5',      area:'3.48', total:'696 000',   paid:'696 000',   status:'DELIVERED',    payment:'FULLY_PAID',     sched:'10 May 2026', ago:'2d ago',  schedDay:10 },
  { id:'5', num:'2026-05-0037', client:'GoldenBuild LLC',      phone:'+998 94 222 33 44', address:"Farg'ona, Asaka shahri",              area:'5.80', total:'1 160 000', paid:'580 000',   status:'IN_PRODUCTION',payment:'PARTIALLY_PAID', sched:'15 May 2026', ago:'3d ago',  schedDay:15 },
  { id:'6', num:'2026-05-0036', client:'Ташкент Construct',    phone:'+998 90 999 00 11', address:'Toshkent, Chilonzor tumani 14',       area:'2.90', total:'522 000',   paid:'0',         status:'PLACED',       payment:'AWAITING',       sched:'16 May 2026', ago:'4d ago',  schedDay:16 },
  { id:'7', num:'2026-05-0035', client:'NovoBuild Co',         phone:'+998 97 444 55 66', address:'Buxoro, Markaziy ko\'cha 7',          area:'7.25', total:'1 595 000', paid:'0',         status:'CANCELED',     payment:'AWAITING',       sched:'09 May 2026', ago:'5d ago',  schedDay:9  },
];

const CLIENTS_DATA = [
  { id:'1', name:'Каримов LLC',        phone:'+998 77 123 45 67', address:'Mirzo-Ulug\'bek',        city:'Toshkent',   orders:12, total:'14 200 000', last:'11 May 2026', consent:'GRANTED'  },
  { id:'2', name:'Алиев Construction', phone:'+998 90 111 22 33', address:'Яшнобод tumani',          city:'Toshkent',   orders:8,  total:'7 240 000',  last:'12 May 2026', consent:'GRANTED'  },
  { id:'3', name:'GoldenBuild LLC',    phone:'+998 94 222 33 44', address:'Asaka shahri',            city:"Farg'ona",   orders:6,  total:'6 960 000',  last:'09 May 2026', consent:'GRANTED'  },
  { id:'4', name:'BuildPro Group',     phone:'+998 93 555 44 66', address:'Registon ko\'chasi 12',   city:'Samarqand',  orders:5,  total:'4 460 000',  last:'12 May 2026', consent:'NOT_ASKED'},
  { id:'5', name:'NovoBuild Co',       phone:'+998 97 444 55 66', address:'Markaziy ko\'cha 7',      city:'Buxoro',     orders:4,  total:'3 180 000',  last:'04 May 2026', consent:'GRANTED'  },
  { id:'6', name:'Mega Construct',     phone:'+998 91 777 88 99', address:'Markaziy ko\'chasi 5',    city:'Namangan',   orders:3,  total:'2 088 000',  last:'10 May 2026', consent:'DENIED'   },
  { id:'7', name:'Ташкент Construct',  phone:'+998 90 999 00 11', address:'Chilonzor tumani 14',     city:'Toshkent',   orders:2,  total:'1 044 000',  last:'08 May 2026', consent:'NOT_ASKED'},
];

const WEEK_DATA = [
  { d:'Дш', m2:420, load:'heavy' }, { d:'Сш', m2:610, load:'over' },
  { d:'Чш', m2:290, load:'ok' },   { d:'Пш', m2:475, load:'heavy' },
  { d:'Жм', m2:150, load:'ok' },   { d:'Шн', m2:55,  load:'ok' },
  { d:'Як', m2:0,   load:'ok' },
];

const CITIES = [
  { city:'Toshkent',  count:14, pct:52 }, { city:'Samarqand', count:6,  pct:22 },
  { city:"Farg'ona",  count:4,  pct:15 }, { city:'Namangan',  count:2,  pct:7  },
  { city:'Buxoro',    count:1,  pct:4  },
];

const TOP_CLIENTS = [
  { name:'Каримов LLC',        orders:12, total:'14 200 000' },
  { name:'Алиев Construction', orders:8,  total:'7 240 000'  },
  { name:'GoldenBuild LLC',    orders:6,  total:'6 960 000'  },
  { name:'BuildPro Group',     orders:5,  total:'4 460 000'  },
  { name:'NovoBuild Co',       orders:4,  total:'3 180 000'  },
];

// ── Pipeline dots ─────────────────────────────────────────────────────────────
function Pipeline({ status, t }) {
  const s = STATUS_MAP[status];
  if (!s) return null;
  if (status === 'CANCELED') return (
    <div style={{ display:'flex', alignItems:'center', gap:'5px' }}>
      <Icon name="x" size={11} style={{ color:t.danger }}/>
      <span style={{ fontSize:'10px', fontFamily:t.mono, color:t.danger, letterSpacing:'0.04em' }}>Canceled</span>
    </div>
  );
  const steps = ['Placed','Prod','Dispatch','Delivered'];
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'3px' }}>
      {steps.map((lbl, i) => {
        const done = s.step > i, curr = s.step === i + 1;
        const c = curr ? t.accent : done ? t.emerald : t.border;
        return (
          <React.Fragment key={lbl}>
            <div style={{
              width: curr ? 7 : 5, height: curr ? 7 : 5, borderRadius:'50%',
              background: c, flexShrink:0,
              boxShadow: curr ? `0 0 0 2px ${t.accent}30` : 'none',
            }}/>
            {i < 3 && <div style={{ width:14, height:1, background: done ? t.emerald : t.border }}/>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Shared table ──────────────────────────────────────────────────────────────
function Table({ columns, rows, t, scrollX }) {
  const inner = (
    <div style={{ minWidth: scrollX || '100%' }}>
      {/* Head */}
      <div style={{
        display:'grid', gridTemplateColumns: columns.map(c=>c.w).join(' '),
        padding:'9px 18px', gap:'10px',
        background: t.isDark ? t.bgSub : t.bg,
        borderBottom:`1px solid ${t.border}`,
        position:'sticky', top:0, zIndex:1,
      }}>
        {columns.map(c => (
          <span key={c.key} style={{
            fontSize:'10px', fontWeight:'700', letterSpacing:'0.09em',
            textTransform:'uppercase', color:t.text3, fontFamily:t.body,
            textAlign: c.right ? 'right' : 'left', whiteSpace:'nowrap',
          }}>{c.label}</span>
        ))}
      </div>
      {/* Rows */}
      {rows.length === 0 && (
        <div style={{ padding:'48px', textAlign:'center', color:t.text3, fontFamily:t.body, fontSize:'13px' }}>
          No records found.
        </div>
      )}
      {rows.map((row, i) => (
        <div key={row.__key || i} style={{
          display:'grid', gridTemplateColumns: columns.map(c=>c.w).join(' '),
          padding:'12px 18px', gap:'10px', alignItems:'center',
          borderBottom: i < rows.length-1 ? `1px solid ${t.border}` : 'none',
          borderLeft:`3px solid ${row.__accent || 'transparent'}`,
          background: i%2===0 ? t.surface : (t.isDark ? `${t.bgSub}70` : `${t.bg}80`),
          cursor:'pointer', transition:'background 100ms',
        }}
        onMouseEnter={e => e.currentTarget.style.background = t.surfaceHover}
        onMouseLeave={e => e.currentTarget.style.background = i%2===0 ? t.surface : (t.isDark ? `${t.bgSub}70` : `${t.bg}80`)}
        >
          {columns.map(c => (
            <div key={c.key} style={{ textAlign: c.right ? 'right' : 'left', minWidth:0 }}>
              {row[c.key]}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
  return (
    <div style={{
      background:t.surface, border:`1px solid ${t.border}`,
      borderRadius:t.r, overflow: scrollX ? 'auto' : 'hidden',
    }}>
      {inner}
    </div>
  );
}

// ── DASHBOARD — 11 KPIs in 3 sections (mirrors original layout) ───────────────
function DashboardScreen({ t }) {
  const mono = { fontFamily:t.mono, fontSize:'12px', fontVariantNumeric:'tabular-nums' };

  // Row 1 — Financial health (4 cards)
  const financial = [
    { label:'Revenue · This Month', value:'127 450 000', unit:'UZS', meta:'vs 113.5M last month', trend:'+12.4%', trendGood:true },
    { label:'Revenue · All Time',   value:'1 842 000 000', unit:'UZS', meta:'Since Jan 2024', trend:null },
    { label:'Avg Order Value',       value:'38 100 000', unit:'UZS', meta:'47 orders this month', trend:'+4.2%', trendGood:true },
    { label:'Receivables',           value:'14 200 000', unit:'UZS', meta:'3 orders outstanding', trend:'+3.1%', trendGood:false, attention:'warning' },
  ];

  // Row 2 — Operational status (4 cards)
  const operational = [
    { label:'Active Customers',  value:'27',          unit:'', meta:'4 new this month', trend:'+4',    trendGood:true },
    { label:'Today Deliveries',  value:'3',           unit:'', meta:'2 confirmed, 1 pending', trend:null },
    { label:'Open Discrepancies',value:'1',           unit:'', meta:'1 under review', attention:'danger', trend:null },
    { label:'Cash on Road',      value:'2 300 000',   unit:'UZS', meta:'3 drivers in transit', attention:'warning', trend:null },
  ];

  const statusAccent = s => ({ DELIVERED:t.success, DISPATCHED:t.gold, IN_PRODUCTION:t.warning, CANCELED:t.danger, PLACED:t.accent }[s]||t.border);

  const recentCols = [
    { key:'num',    label:'Order №', w:'150px' },
    { key:'client', label:'Client',  w:'1fr' },
    { key:'area',   label:'Area',    w:'75px', right:true },
    { key:'total',  label:'Total',   w:'115px', right:true },
    { key:'pay',    label:'Payment', w:'90px' },
    { key:'pipe',   label:'Status',  w:'140px' },
  ];

  const recentRows = ORDERS_DATA.slice(0,6).map(o => {
    const pm = PAY_MAP[o.payment];
    return {
      __key: o.id, __accent: statusAccent(o.status),
      num: <div><div style={{...mono, color:t.accent, fontWeight:'600', fontSize:'12px', letterSpacing:'0.02em'}}>{o.num}</div><div style={{fontSize:'10px',color:t.text3,fontFamily:t.mono,marginTop:'1px'}}>{o.ago}</div></div>,
      client: <div><div style={{fontSize:'13px',fontFamily:t.body,color:t.text1,fontWeight:'600'}}>{o.client}</div><div style={{fontSize:'11px',color:t.text3,marginTop:'1px'}}>{o.address}</div></div>,
      area: <span style={{...mono,color:t.text2}}>{o.area} m²</span>,
      total: <span style={{...mono,fontWeight:'700',color:t.text1}}>{o.total}</span>,
      pay: <Chip col={pm.col} t={t}>{pm.label}</Chip>,
      pipe: <Pipeline status={o.status} t={t}/>,
    };
  });

  function KpiRow({ items }) {
    return (
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'14px', marginBottom:'22px' }}>
        {items.map((k,i) => <KpiCard key={i} {...k} t={t}/>)}
      </div>
    );
  }

  return (
    <div style={{ padding:'28px 28px', maxWidth:1400, width:'100%' }}>
      {/* Page header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'26px' }}>
        <div>
          <h1 style={{ fontSize:'22px', fontWeight:'800', letterSpacing:'-0.025em', color:t.text1, fontFamily:t.head, margin:0 }}>
            Бошқарув <span style={{ fontSize:'14px', fontWeight:'500', color:t.text3, fontFamily:t.body }}>· Dashboard</span>
          </h1>
          <p style={{ fontSize:'12px', color:t.text3, fontFamily:t.body, margin:'4px 0 0' }}>Monday, 11 May 2026 · Last updated 09:24</p>
        </div>
        <Btn icon="plus" t={t}>Буюртма · New Order</Btn>
      </div>

      {/* Section 1 — Financial health */}
      <SectionHead t={t}>Молиявий ҳолат · Financial Health</SectionHead>
      <KpiRow items={financial}/>

      {/* Section 2 — Operational status */}
      <SectionHead t={t}>Операцион ҳолат · Operational Status</SectionHead>
      <KpiRow items={operational}/>

      {/* Section 3 — Business insights (3 wide panels) */}
      <SectionHead t={t}>Бизнес таҳлил · Business Insights</SectionHead>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'14px', marginBottom:'26px' }}>
        {/* City distribution */}
        <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:t.r, padding:'18px' }}>
          <div style={{ fontSize:'11px', fontWeight:'700', letterSpacing:'0.08em', textTransform:'uppercase', color:t.text3, fontFamily:t.body, marginBottom:'14px' }}>Мижозлар шаҳарлар бўйича</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            {CITIES.map((c,i) => (
              <div key={c.city} style={{ display:'grid', gridTemplateColumns:'90px 1fr 32px', gap:'10px', alignItems:'center' }}>
                <span style={{ fontSize:'12px', fontFamily:t.body, color:t.text2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.city}</span>
                <div style={{ height:'5px', background:t.bgSub, borderRadius:'3px', overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${c.pct}%`, background: i===0 ? t.accent : t.text3, borderRadius:'3px', opacity:0.8 }}/>
                </div>
                <span style={{ fontSize:'11px', fontFamily:t.mono, color:t.text2, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{c.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top customers */}
        <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:t.r, padding:'18px' }}>
          <div style={{ fontSize:'11px', fontWeight:'700', letterSpacing:'0.08em', textTransform:'uppercase', color:t.text3, fontFamily:t.body, marginBottom:'14px' }}>Топ мижозлар</div>
          {TOP_CLIENTS.map((c,i) => (
            <div key={c.name} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'9px 0', borderBottom: i<TOP_CLIENTS.length-1 ? `1px solid ${t.border}` : 'none', cursor:'pointer' }}>
              <span style={{ width:18, textAlign:'right', fontSize:'10px', fontFamily:t.mono, color:t.text3, fontWeight:'600' }}>{i+1}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'12px', fontFamily:t.body, color:t.text1, fontWeight:'600', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</div>
                <div style={{ fontSize:'10px', fontFamily:t.mono, color:t.text3 }}>{c.orders} orders</div>
              </div>
              <span style={{ fontSize:'11px', fontFamily:t.mono, color:t.text1, fontWeight:'600', fontVariantNumeric:'tabular-nums', flexShrink:0, whiteSpace:'nowrap' }}>{c.total}</span>
            </div>
          ))}
        </div>

        {/* Week capacity */}
        <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:t.r, padding:'18px' }}>
          <div style={{ fontSize:'11px', fontWeight:'700', letterSpacing:'0.08em', textTransform:'uppercase', color:t.text3, fontFamily:t.body, marginBottom:'14px' }}>Ҳафталик юклама</div>
          <div style={{ display:'flex', gap:'7px', alignItems:'flex-end', height:'90px' }}>
            {WEEK_DATA.map(d => {
              const h = Math.max(d.m2>0?3:0, Math.round((d.m2/600)*90));
              const c = d.load==='over' ? t.danger : d.load==='heavy' ? t.warning : t.text3;
              return (
                <div key={d.d} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'5px', justifyContent:'flex-end', height:'100%' }}>
                  <div style={{ width:'100%', height:`${h}px`, background:c, opacity:d.m2===0?0.15:0.85, borderRadius:'3px 3px 2px 2px', transition:'height 400ms' }}/>
                  <span style={{ fontSize:'9px', fontFamily:t.mono, color:t.text3, textTransform:'uppercase', letterSpacing:'0.05em' }}>{d.d}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display:'flex', gap:'12px', marginTop:'12px', borderTop:`1px solid ${t.border}`, paddingTop:'10px' }}>
            {[['ok',t.text3,'Normal'],['heavy',t.warning,'Heavy'],['over',t.danger,'>600m²']].map(([k,c,l]) => (
              <span key={k} style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'10px', fontFamily:t.body, color:t.text3 }}>
                <div style={{ width:7, height:7, borderRadius:'2px', background:c, opacity:0.85 }}/>{l}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Recent orders table */}
      <SectionHead t={t}>Сўнгги буюртмалар · Recent Orders</SectionHead>
      <Table columns={recentCols} rows={recentRows} t={t}/>
    </div>
  );
}

// ── ORDERS — capacity calendar + full 10-column table ────────────────────────

// Capacity per day: aggregate area from non-canceled orders
const CAP_DATA = {
  9:  { m2:7.25,  orders:1, load:'available' },
  10: { m2:3.48,  orders:1, load:'available' },
  12: { m2:10.26, orders:2, load:'available' },
  14: { m2:8.12,  orders:1, load:'available' },
  15: { m2:5.80,  orders:1, load:'available' },
  16: { m2:2.90,  orders:1, load:'available' },
};

// ── Capacity Calendar ─────────────────────────────────────────────────────────
const DAYS_UZ = ['DU','SE','CH','PA','JU','SH','YA'];
const DAYS_EN = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function loadColor(load, m2, t) {
  if (m2 > 600) return { bg:`${t.danger}18`, dot:t.danger, text:t.danger };
  if (m2 > 450) return { bg:`${t.warning}18`, dot:t.warning, text:t.warning };
  if (m2 > 300) return { bg:`${t.gold}14`, dot:t.gold, text:t.gold };
  if (m2 > 0)   return { bg:`${t.success}12`, dot:t.success, text:t.success };
  return { bg:'transparent', dot:t.border, text:t.text3 };
}

function CapacityCalendar({ selectedDay, onSelect, t }) {
  // May 2026: starts on Friday (index 4 in Mon=0)
  // Build a 6×7 grid starting from Mon Apr 27
  const weeks = [];
  // Apr 27 = day -4 relative to May 1
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const dayOffset = w * 7 + d - 4; // -4 = Mon Apr 27
      const mayDay = dayOffset + 1; // 1-based May day
      week.push(mayDay);
    }
    weeks.push(week);
  }

  return (
    <div style={{
      background: t.surface,
      border: `1px solid ${t.border}`,
      borderRadius: t.r,
      overflow: 'hidden',
      marginBottom: '16px',
    }}>
      {/* Month nav */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'12px 20px',
        borderBottom:`1px solid ${t.border}`,
        background: t.isDark ? t.bgSub : t.bg,
      }}>
        <button style={{ width:28, height:28, borderRadius:t.rXs, background:'transparent', border:`1px solid ${t.border}`, cursor:'pointer', color:t.text2, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 120ms' }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=t.accent;e.currentTarget.style.color=t.accent;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.text2;}}
        ><Icon name="chevronLeft" size={13}/></button>

        <div style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer' }}>
          <span style={{ fontSize:'14px', fontWeight:'700', fontFamily:t.head, color:t.text1, letterSpacing:'-0.01em' }}>May 2026</span>
          <Icon name="chevronRight" size={12} style={{ color:t.text3, transform:'rotate(90deg)' }}/>
        </div>

        <button style={{ width:28, height:28, borderRadius:t.rXs, background:'transparent', border:`1px solid ${t.border}`, cursor:'pointer', color:t.text2, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 120ms' }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=t.accent;e.currentTarget.style.color=t.accent;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.text2;}}
        ><Icon name="chevronRight" size={13}/></button>
      </div>

      {/* Day headers */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:`1px solid ${t.border}` }}>
        {DAYS_UZ.map((d,i) => (
          <div key={d} style={{
            padding:'8px 4px', textAlign:'center',
            borderRight: i<6 ? `1px solid ${t.border}` : 'none',
            background: t.isDark ? t.bgSub : t.bg,
          }}>
            <span style={{ fontSize:'10px', fontWeight:'700', letterSpacing:'0.08em', color:t.text3, fontFamily:t.mono }}>{d}</span>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom: wi<5?`1px solid ${t.border}`:'none' }}>
          {week.map((day, di) => {
            const isCurrentMonth = day >= 1 && day <= 31;
            const isToday = day === 11;
            const isSelected = day === selectedDay;
            const cap = isCurrentMonth ? CAP_DATA[day] : null;
            const lc = cap ? loadColor(cap.load, cap.m2, t) : { bg:'transparent', text:t.text3 };
            const hasOrders = cap && cap.orders > 0;

            return (
              <div
                key={di}
                onClick={() => isCurrentMonth && onSelect(isSelected ? null : day)}
                style={{
                  minHeight: '64px',
                  padding:'7px 8px',
                  borderRight: di<6?`1px solid ${t.border}`:'none',
                  background: isSelected
                    ? `${t.accent}18`
                    : hasOrders ? lc.bg : 'transparent',
                  cursor: isCurrentMonth ? 'pointer' : 'default',
                  position:'relative',
                  transition:'background 120ms',
                  outline: isToday ? `2px solid ${t.accent}` : isSelected ? `2px solid ${t.accent}` : 'none',
                  outlineOffset:'-2px',
                }}
                onMouseEnter={e=>{ if(isCurrentMonth && !isSelected) e.currentTarget.style.background=`${t.accent}08`; }}
                onMouseLeave={e=>{ if(isCurrentMonth && !isSelected) e.currentTarget.style.background= hasOrders ? lc.bg : 'transparent'; }}
              >
                {/* Date number */}
                <span style={{
                  fontSize:'12px', fontWeight: isToday ? '800' : '500',
                  fontFamily: t.mono, color: !isCurrentMonth ? t.text4 : isToday ? t.accent : t.text2,
                  display:'block', lineHeight:1,
                }}>{isCurrentMonth ? day : (wi===0 ? 27+di : di+1)}</span>

                {/* Order count badge */}
                {hasOrders && (
                  <div style={{
                    position:'absolute', top:'5px', right:'6px',
                    width:16, height:16, borderRadius:'50%',
                    background:`${lc.text}20`, border:`1px solid ${lc.text}40`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}>
                    <span style={{ fontSize:'9px', fontFamily:t.mono, color:lc.text, fontWeight:'700', lineHeight:1 }}>{cap.orders}</span>
                  </div>
                )}

                {/* m² */}
                {hasOrders && (
                  <span style={{
                    fontSize:'10px', fontFamily:t.mono, color:lc.text,
                    display:'block', marginTop:'4px', fontWeight:'600',
                    fontVariantNumeric:'tabular-nums',
                  }}>{cap.m2} m²</span>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Legend */}
      <div style={{
        display:'flex', gap:'18px', padding:'10px 20px',
        borderTop:`1px solid ${t.border}`,
        background: t.isDark ? t.bgSub : t.bg,
        flexWrap:'wrap',
      }}>
        {[
          [t.success,'Available','≤300 m²'],
          [t.gold,   'Moderate', '≤450 m²'],
          [t.warning,'Heavy',    '≤600 m²'],
          [t.danger, 'Overbooked','>600 m²'],
        ].map(([c,l,r]) => (
          <div key={l} style={{ display:'flex', alignItems:'center', gap:'5px' }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:c }}/>
            <span style={{ fontSize:'11px', fontFamily:t.body, color:t.text2 }}>
              {l} <span style={{ color:t.text3 }}>{r}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const FILTERS = [['','All'],['PLACED','Placed'],['IN_PRODUCTION','In Prod'],['DELIVERED','Delivered'],['DISPATCHED','Dispatched'],['CANCELED','Canceled']];

function OrdersScreen({ t }) {
  const [q, setQ] = React.useState('');
  const [f, setF] = React.useState('');
  const [selectedDay, setSelectedDay] = React.useState(null);

  const statusAccent = s => ({ DELIVERED:t.success, DISPATCHED:t.gold, IN_PRODUCTION:t.warning, CANCELED:t.danger, PLACED:t.accent }[s]||t.border);

  const filtered = ORDERS_DATA.filter(o =>
    (!f || o.status === f) &&
    (!selectedDay || o.schedDay === selectedDay) &&
    (!q || o.client.toLowerCase().includes(q.toLowerCase()) || o.num.includes(q) || o.address.toLowerCase().includes(q.toLowerCase()))
  );

  // All 10 original columns
  const cols = [
    { key:'num',    label:'№',                w:'152px' },
    { key:'client', label:'МИЖОЗ · CLIENT',   w:'148px' },
    { key:'phone',  label:'ТЕЛ · PHONE',      w:'148px' },
    { key:'addr',   label:'МАНЗИЛ · ADDRESS', w:'180px' },
    { key:'area',   label:'МАЙДОН · AREA',    w:'90px',  right:true },
    { key:'total',  label:'ЖАМИ · TOTAL',     w:'115px', right:true },
    { key:'paid',   label:'ТЎЛАНГАН · PAID',  w:'115px', right:true },
    { key:'status', label:'STATUS',           w:'120px' },
    { key:'pay',    label:'PAYMENT',          w:'110px' },
    { key:'sched',  label:'SCHEDULED',        w:'115px' },
  ];

  const rows = filtered.map(o => {
    const pm = PAY_MAP[o.payment];
    const sm = STATUS_MAP[o.status];
    const paidNum = parseFloat(o.paid.replace(/\s/g,''));
    const totalNum = parseFloat(o.total.replace(/\s/g,''));
    const paidColor = paidNum >= totalNum && paidNum > 0 ? t.success : paidNum > 0 ? t.accent : t.text3;

    return {
      __key: o.id, __accent: statusAccent(o.status),
      num: <div>
        <div style={{ fontFamily:t.mono, fontSize:'12px', color:t.accent, fontWeight:'600', letterSpacing:'0.02em', whiteSpace:'nowrap' }}>{o.num}</div>
        <div style={{ fontSize:'10px', color:t.text3, fontFamily:t.mono, marginTop:'2px' }}>{o.ago}</div>
      </div>,
      client: <span style={{ fontSize:'13px', fontFamily:t.body, color:t.text1, fontWeight:'600' }}>{o.client}</span>,
      phone: <span style={{ fontSize:'11px', fontFamily:t.mono, color:t.text2, letterSpacing:'0.02em', fontVariantNumeric:'tabular-nums' }}>{o.phone}</span>,
      addr: <span style={{ fontSize:'11px', fontFamily:t.body, color:t.text3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'block' }}>{o.address}</span>,
      area: <span style={{ fontFamily:t.mono, fontSize:'12px', color:t.text2, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>{o.area} m²</span>,
      total: <span style={{ fontFamily:t.mono, fontSize:'12px', color:t.text1, fontWeight:'700', fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>{o.total}</span>,
      paid: <span style={{ fontFamily:t.mono, fontSize:'12px', fontWeight:'600', color: paidColor, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>
        {paidNum === 0 ? '—' : o.paid}
      </span>,
      status: <Chip col={sm?.pip || 'default'} t={t}>{sm?.label || o.status}</Chip>,
      pay: <Chip col={pm.col} t={t}>{pm.label}</Chip>,
      sched: <span style={{ fontSize:'11px', fontFamily:t.mono, color:t.text2, whiteSpace:'nowrap' }}>{o.sched}</span>,
    };
  });

  return (
    <div style={{ padding:'24px 24px', width:'100%' }}>
      {/* Page header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'18px', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h1 style={{ fontSize:'20px', fontWeight:'800', letterSpacing:'-0.02em', color:t.text1, fontFamily:t.head, margin:0 }}>
            Буюртмалар <span style={{ fontSize:'13px', fontWeight:'500', color:t.text3, fontFamily:t.body }}>· Orders</span>
          </h1>
          <p style={{ fontSize:'12px', color:t.text3, fontFamily:t.body, margin:'3px 0 0' }}>
            Placed orders — search by order #, client, or address. Pick a day on the calendar to filter by schedule.
          </p>
        </div>
        <Btn icon="plus" t={t} small>Буюртма Бериш</Btn>
      </div>

      {/* Capacity calendar */}
      <CapacityCalendar selectedDay={selectedDay} onSelect={setSelectedDay} t={t}/>

      {/* Selected day banner */}
      {selectedDay && (
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'9px 16px', marginBottom:'12px',
          background:`${t.accent}12`, border:`1px solid ${t.accent}28`,
          borderRadius:t.rSm,
        }}>
          <span style={{ fontSize:'12px', fontFamily:t.body, color:t.accent, fontWeight:'600' }}>
            Filtered to <span style={{ fontFamily:t.mono }}>May {selectedDay}, 2026</span>
            {' '}— {filtered.length} order{filtered.length!==1?'s':''}
          </span>
          <button onClick={()=>setSelectedDay(null)} style={{ fontSize:'11px', fontFamily:t.body, color:t.text3, background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>
            Clear filter
          </button>
        </div>
      )}

      {/* Search + filter toolbar */}
      <div style={{ display:'flex', gap:'10px', marginBottom:'14px', flexWrap:'wrap', alignItems:'center' }}>
        <SearchBar value={q} onChange={setQ} placeholder="Order # · Client · Phone · Address" t={t}/>
        <div style={{ display:'flex', border:`1px solid ${t.border}`, borderRadius:t.rSm, overflow:'hidden', background:t.surface }}>
          {FILTERS.map(([v,label]) => (
            <button key={v} onClick={() => setF(v)} style={{
              padding:'8px 13px', border:'none', cursor:'pointer',
              background: f===v ? t.accent : 'transparent',
              color: f===v ? '#fff' : t.text2,
              fontSize:'11px', fontFamily:t.body, fontWeight:'700',
              letterSpacing:'0.05em', textTransform:'uppercase',
              borderRight:`1px solid ${t.border}`, transition:'all 120ms', whiteSpace:'nowrap',
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Orders table */}
      <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:t.r, overflow:'auto' }}>
        <div style={{ minWidth:'1280px' }}>
          {/* Header */}
          <div style={{
            display:'grid', gridTemplateColumns: cols.map(c=>c.w).join(' '),
            padding:'9px 18px', gap:'10px',
            background: t.isDark ? t.bgSub : t.bg,
            borderBottom:`2px solid ${t.border}`,
            position:'sticky', top:0, zIndex:1,
          }}>
            {cols.map(c => (
              <span key={c.key} style={{
                fontSize:'10px', fontWeight:'700', letterSpacing:'0.09em',
                textTransform:'uppercase', color:t.text3, fontFamily:t.body,
                textAlign: c.right ? 'right' : 'left', whiteSpace:'nowrap',
              }}>{c.label}</span>
            ))}
          </div>

          {/* Rows */}
          {rows.length === 0 && (
            <div style={{ padding:'48px', textAlign:'center', color:t.text3, fontFamily:t.body, fontSize:'13px' }}>
              No orders found.
            </div>
          )}
          {rows.map((row, i) => (
            <div key={row.__key} style={{
              display:'grid', gridTemplateColumns: cols.map(c=>c.w).join(' '),
              padding:'12px 18px', gap:'10px', alignItems:'center',
              borderBottom: i < rows.length-1 ? `1px solid ${t.border}` : 'none',
              borderLeft:`3px solid ${row.__accent}`,
              background: i%2===0 ? t.surface : (t.isDark?`${t.bgSub}70`:`${t.bg}80`),
              cursor:'pointer', transition:'background 100ms',
            }}
            onMouseEnter={e => e.currentTarget.style.background = t.surfaceHover}
            onMouseLeave={e => e.currentTarget.style.background = i%2===0 ? t.surface : (t.isDark?`${t.bgSub}70`:`${t.bg}80`)}
            >
              {cols.map(c => (
                <div key={c.key} style={{ textAlign: c.right ? 'right' : 'left', minWidth:0 }}>
                  {row[c.key]}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop:'10px', fontSize:'11px', fontFamily:t.mono, color:t.text3, letterSpacing:'0.04em' }}>
        {rows.length} result{rows.length!==1?'s':''}
        {selectedDay && <span style={{ color:t.accent }}> · May {selectedDay}</span>}
      </div>
    </div>
  );
}

// ── CLIENTS — all original fields ─────────────────────────────────────────────
const CONSENT_CFG = {
  GRANTED:   { label:'Granted',   col:'success' },
  NOT_ASKED: { label:'Not Asked', col:'neutral' },
  DENIED:    { label:'Denied',    col:'danger' },
};

function ClientsScreen({ t }) {
  const [q, setQ] = React.useState('');
  const [selected, setSelected] = React.useState(new Set());

  const filtered = CLIENTS_DATA.filter(c =>
    !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.city.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q)
  );

  const toggleAll = () => {
    const eligible = filtered.filter(c => c.consent==='GRANTED').map(c=>c.id);
    const allSelected = eligible.every(id => selected.has(id));
    if (allSelected) { const s=new Set(selected); eligible.forEach(id=>s.delete(id)); setSelected(s); }
    else { const s=new Set(selected); eligible.forEach(id=>s.add(id)); setSelected(s); }
  };

  const cols = [
    { key:'sel',     label:'',                   w:'36px' },
    { key:'name',    label:'Мижоз · Client',     w:'1fr' },
    { key:'phone',   label:'Тел · Phone',         w:'155px' },
    { key:'address', label:'Манзил · Address',    w:'180px' },
    { key:'city',    label:'Шаҳар · City',        w:'110px' },
    { key:'orders',  label:'Буюртмалар',          w:'90px', right:true },
    { key:'revenue', label:'Даромад (UZS)',        w:'140px', right:true },
    { key:'last',    label:'Охирги буюртма',       w:'130px' },
    { key:'consent', label:'Розилик',              w:'110px' },
  ];

  const rows = filtered.map(c => {
    const cs = CONSENT_CFG[c.consent];
    const cColor = cs.col==='success' ? t.success : cs.col==='danger' ? t.danger : t.text3;
    const isSel = selected.has(c.id);
    const eligible = c.consent==='GRANTED';

    return {
      __key: c.id,
      __accent: eligible ? `${t.success}50` : 'transparent',
      sel: (
        <div onClick={e => { e.stopPropagation(); if (!eligible) return; const s=new Set(selected); s.has(c.id)?s.delete(c.id):s.add(c.id); setSelected(s); }}
          style={{
            width:16, height:16, borderRadius:'4px', cursor: eligible?'pointer':'not-allowed',
            border:`1.5px solid ${isSel?t.accent:t.border}`,
            background: isSel ? t.accent : 'transparent',
            display:'flex', alignItems:'center', justifyContent:'center',
            transition:'all 120ms',
          }}>
          {isSel && <Icon name="check" size={9} style={{ color:'#fff' }}/>}
        </div>
      ),
      name: <div>
        <div style={{ fontSize:'13px', fontFamily:t.body, color:t.text1, fontWeight:'600' }}>{c.name}</div>
      </div>,
      phone: <span style={{ fontSize:'11px', fontFamily:t.mono, color:t.text2, letterSpacing:'0.02em', fontVariantNumeric:'tabular-nums' }}>{c.phone}</span>,
      address: <span style={{ fontSize:'11px', fontFamily:t.body, color:t.text3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'block' }}>{c.address}</span>,
      city: <span style={{ fontSize:'12px', fontFamily:t.body, color:t.text2 }}>{c.city}</span>,
      orders: <span style={{ fontSize:'12px', fontFamily:t.mono, color:t.text1, fontVariantNumeric:'tabular-nums', textAlign:'right', display:'block' }}>{c.orders}</span>,
      revenue: <span style={{ fontSize:'12px', fontFamily:t.mono, color:t.text1, fontWeight:'700', fontVariantNumeric:'tabular-nums', textAlign:'right', display:'block' }}>{c.total}</span>,
      last: <span style={{ fontSize:'11px', fontFamily:t.mono, color:t.text2 }}>{c.last}</span>,
      consent: <span style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'2px 8px', borderRadius:'20px', fontSize:'10px', fontWeight:'600', fontFamily:t.mono, letterSpacing:'0.04em', textTransform:'uppercase', background:`${cColor}18`, color:cColor, border:`1px solid ${cColor}28` }}>{cs.label}</span>,
    };
  });

  return (
    <div style={{ padding:'28px 28px', maxWidth:1500, width:'100%' }}>
      <PageTitle uz="Мижозлар" en="Clients"
        sub="Client directory — select eligible rows to export contact info."
        t={t} right={<Btn icon="plus" t={t}>Мижоз қўшish</Btn>}
      />
      <div style={{ display:'flex', gap:'10px', marginBottom:'16px', alignItems:'center', flexWrap:'wrap' }}>
        <SearchBar value={q} onChange={setQ} placeholder="Name · City · Phone" t={t}/>
        {selected.size > 0 && (
          <div style={{
            display:'flex', alignItems:'center', gap:'10px',
            padding:'8px 14px', background:`${t.accent}14`,
            border:`1px solid ${t.accent}30`, borderRadius:t.rSm,
          }}>
            <span style={{ fontSize:'12px', fontFamily:t.body, color:t.accent, fontWeight:'600' }}>
              {selected.size} selected
            </span>
            <button onClick={() => setSelected(new Set())} style={{ fontSize:'11px', fontFamily:t.body, color:t.text3, background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>Clear</button>
            <Btn t={t} small>Export Contacts</Btn>
          </div>
        )}
      </div>
      <Table columns={cols} rows={rows} t={t} scrollX="1380px"/>
      <div style={{ marginTop:'10px', fontSize:'11px', fontFamily:t.mono, color:t.text3, letterSpacing:'0.04em' }}>
        {filtered.length} clients · {filtered.filter(c=>c.consent==='GRANTED').length} export-eligible
      </div>
    </div>
  );
}

// ── CALCULATOR — all 18 columns, all panels, premium redesign ─────────────────
function CalculatorScreen({ t }) {
  const [rounding, setRounding] = React.useState('5');
  const [consent, setConsent] = React.useState(false);

  // Demo rooms with full computed values
  const rooms = [
    { id:1, name:'Yotoqxona 1', w:'3.60', l:'4.80', bear:'0.15', corr:'0', slabL:'4.30', pat:'Г-Б',   extra:false, start:false, beamL:'3.90', pitches:7, rows:7, perRow:18, blocks:126, beams:8,  area:'14.75', rate:'140 000', sub:'2 067 500' },
    { id:2, name:'Yotoqxona 2', w:'3.20', l:'4.40', bear:'0.15', corr:'0', slabL:'3.90', pat:'Б-Г-Б', extra:false, start:false, beamL:'3.50', pitches:6, rows:7, perRow:16, blocks:112, beams:9,  area:'12.41', rate:'140 000', sub:'1 737 400' },
    { id:3, name:'Кухня',       w:'2.80', l:'3.60', bear:'0.15', corr:'0', slabL:'3.30', pat:'Г-Б',   extra:false, start:false, beamL:'3.10', pitches:6, rows:6, perRow:14, blocks:84,  beams:7,  area:'8.58',  rate:'140 000', sub:'1 201 200' },
  ];

  const lbl = { fontSize:'9px', fontWeight:'700', letterSpacing:'0.10em', textTransform:'uppercase', fontFamily:t.body };
  const cell = { fontFamily:t.mono, fontSize:'12px', fontVariantNumeric:'tabular-nums', color:t.text1 };
  const computed = { ...cell, color:t.text2 };

  // Zone header backgrounds
  const zoneInput   = t.isDark ? `${t.warning}08`  : `${t.warning}07`;
  const zonePat     = t.isDark ? `${t.accent}08`   : `${t.accent}06`;
  const zoneOut     = t.isDark ? `${t.bgSub}`       : t.bg;
  const zonePrice   = t.isDark ? `${t.emerald}08`  : `${t.emerald}06`;

  // Column definitions
  const cols = [
    { key:'name',    head:'ХОНА',      sub:'Name',       w:130, zone:'input'  },
    { key:'w',       head:'ЭНИ ⓘ',    sub:'Width',      w:72,  zone:'input'  },
    { key:'l',       head:'БЎЙИ ⓘ',   sub:'Length',     w:72,  zone:'input'  },
    { key:'bear',    head:'МИНИШ ⓘ',  sub:'Bearing',    w:70,  zone:'input'  },
    { key:'corr',    head:'КОРР. ⓘ',  sub:'Correction', w:66,  zone:'input'  },
    { key:'slabL',   head:'ЙИГМА Б.ⓘ',sub:'Slab L',     w:72,  zone:'input'  },
    { key:'pat',     head:'ШАБЛОН',   sub:'Pattern',    w:100, zone:'pattern' },
    { key:'extra',   head:'+Б',        sub:'Extra',      w:44,  zone:'pattern' },
    { key:'start',   head:'БОШ Б.ⓘ',  sub:'Start',      w:52,  zone:'pattern' },
    { key:'beamL',   head:'Б.У.З.',   sub:'Beam L',     w:66,  zone:'out'    },
    { key:'pitches', head:'ҚАДАМ',    sub:'Pitches',    w:60,  zone:'out'    },
    { key:'rows',    head:'ҚАТОР',    sub:'Rows',       w:56,  zone:'out'    },
    { key:'perRow',  head:'1 КАТ.',   sub:'Per row',    w:58,  zone:'out'    },
    { key:'blocks',  head:'ЖАМИ',     sub:'Blocks',     w:62,  zone:'out'    },
    { key:'beams',   head:'БАЛКА',    sub:'Beams',      w:58,  zone:'out'    },
    { key:'area',    head:'МАЙДОН',   sub:'Slab area',  w:72,  zone:'out'    },
    { key:'rate',    head:'М² НАРХⓘ', sub:'Rate',       w:96,  zone:'price'  },
    { key:'sub',     head:'СУММА',    sub:'Subtotal',   w:110, zone:'price'  },
    { key:'del',     head:'',         sub:'',           w:36,  zone:'del'    },
  ];

  const zoneBg = z => ({ input: zoneInput, pattern: zonePat, out: zoneOut, price: zonePrice, del:'transparent' }[z] || 'transparent');

  const totalBlocks = rooms.reduce((s,r) => s+r.blocks,0);
  const totalBeams  = rooms.reduce((s,r) => s+r.beams,0);
  const totalArea   = rooms.reduce((s,r) => s+parseFloat(r.area),0).toFixed(2);
  const totalSub    = rooms.reduce((s,r) => s+parseInt(r.sub.replace(/\s/g,'')),0);
  const fmt = n => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g,' ');

  function CellInput({ value, zone }) {
    return (
      <div style={{
        background: zone==='input' ? (t.isDark?`${t.warning}15`:`${t.warning}12`) : t.bgSub,
        border:`1px solid ${t.border}`, borderRadius:'4px',
        padding:'5px 8px', ...cell, fontSize:'12px', cursor:'text',
        minHeight:'28px', display:'flex', alignItems:'center',
      }}>{value}</div>
    );
  }

  function Checkbox({ checked }) {
    return (
      <div style={{
        width:16, height:16, borderRadius:'3px',
        border:`1.5px solid ${checked?t.accent:t.border}`,
        background: checked?t.accent:'transparent',
        display:'flex', alignItems:'center', justifyContent:'center',
        cursor:'pointer', margin:'0 auto',
      }}>
        {checked && <Icon name="check" size={9} style={{ color:'#fff' }}/>}
      </div>
    );
  }

  const gridWidth = cols.reduce((s,c)=>s+c.w,0) + 'px';

  return (
    <div style={{ padding:'24px 24px', width:'100%' }}>
      {/* Page title */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'18px', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h1 style={{ fontSize:'20px', fontWeight:'800', letterSpacing:'-0.02em', color:t.text1, fontFamily:t.head, margin:0 }}>
            Калькулятор <span style={{ fontSize:'13px', fontWeight:'500', color:t.text3, fontFamily:t.body }}>· Calculator</span>
          </h1>
          <p style={{ fontSize:'12px', color:t.text3, fontFamily:t.body, margin:'3px 0 0' }}>Quick calc during a phone call. Save as Project, or place an order directly.</p>
        </div>
        <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
          <Btn variant="secondary" t={t} small>Лойиҳани сақлаш</Btn>
          <Btn t={t} icon="arrowRight" small>Буюртма Бериш · Place Order</Btn>
        </div>
      </div>

      {/* Client strip */}
      <div style={{
        border:`1px solid ${t.border}`, borderRadius:t.r,
        background:t.surface, marginBottom:'16px', overflow:'hidden',
      }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 220px 1fr', gap:'0' }}>
          {[
            { icon:'clients', label:'ИСМ* · Name',          ph:'Мижоз исми',          val:'',              isPhone:false },
            { icon:'bell',    label:'ТЕЛ РАҚАМ* · Phone',   ph:'+998 90 __ __ __',    val:'',              isPhone:true  },
            { icon:'search',  label:'МАНЗИЛ* · Address',     ph:'Tashkent · Yunusobod 12-7', val:'',        isPhone:false },
          ].map((f,i) => (
            <div key={i} style={{
              padding:'12px 18px',
              borderRight: i<2 ? `1px solid ${t.border}` : 'none',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'6px' }}>
                <span style={{ ...lbl, color:t.text3 }}>{f.label}</span>
              </div>
              <div style={{
                fontSize:'13px', fontWeight:'500',
                fontFamily: f.isPhone ? t.mono : t.body,
                color: f.val ? (f.isPhone ? t.accent : t.text1) : t.text3,
              }}>
                {f.val || f.ph}
              </div>
            </div>
          ))}
        </div>
        {/* Consent */}
        <div style={{ padding:'10px 18px', borderTop:`1px solid ${t.border}`, display:'flex', alignItems:'center', gap:'10px', background: t.isDark ? `${t.bgSub}80` : t.bg }}>
          <div onClick={() => setConsent(!consent)} style={{
            width:15, height:15, borderRadius:'3px', cursor:'pointer', flexShrink:0,
            border:`1.5px solid ${consent?t.accent:t.border}`,
            background: consent?t.accent:'transparent',
            display:'flex', alignItems:'center', justifyContent:'center',
            transition:'all 120ms',
          }}>
            {consent && <Icon name="check" size={9} style={{ color:'#fff' }}/>}
          </div>
          <span style={{ fontSize:'12px', fontFamily:t.body, color:t.text2 }}>
            <span style={{ color:t.text1, fontWeight:'600' }}>Розилик берди</span> · Client agrees to share contact with future prospects
          </span>
        </div>
      </div>

      {/* Calc grid */}
      <div style={{
        border:`1px solid ${t.border}`, borderRadius:t.r,
        background:t.surface, overflow:'hidden', marginBottom:'14px',
      }}>
        <div style={{ overflowX:'auto' }}>
          <div style={{ minWidth: gridWidth }}>
            {/* Zone band */}
            <div style={{
              display:'grid',
              gridTemplateColumns: cols.map(c=>c.w+'px').join(' '),
              borderBottom:`1px solid ${t.border}`,
            }}>
              {/* Input zone label */}
              <div style={{ gridColumn:'1/7', padding:'4px 12px', background:zoneInput, borderRight:`1px solid ${t.border}` }}>
                <span style={{ ...lbl, color:t.text3 }}>Input</span>
              </div>
              <div style={{ gridColumn:'7/10', padding:'4px 12px', background:zonePat, borderRight:`1px solid ${t.border}` }}>
                <span style={{ ...lbl, color:t.accent }}>Pattern</span>
              </div>
              <div style={{ gridColumn:'10/17', padding:'4px 12px', background:zoneOut, borderRight:`1px solid ${t.border}` }}>
                <span style={{ ...lbl, color:t.text3 }}>Computed Output</span>
              </div>
              <div style={{ gridColumn:'17/19', padding:'4px 12px', background:zonePrice }}>
                <span style={{ ...lbl, color:t.emerald }}>Pricing</span>
              </div>
              <div style={{ gridColumn:'19/20', background:'transparent' }}/>
            </div>

            {/* Column headers */}
            <div style={{
              display:'grid',
              gridTemplateColumns: cols.map(c=>c.w+'px').join(' '),
              borderBottom:`2px solid ${t.border}`,
            }}>
              {cols.map(c => (
                <div key={c.key} style={{
                  padding:'8px 8px 6px',
                  background: zoneBg(c.zone),
                  borderRight: c.zone !== 'del' ? `1px solid ${t.border}` : 'none',
                  textAlign: ['blocks','beams','pitches','rows','perRow'].includes(c.key) ? 'center' : 'left',
                }}>
                  <div style={{ ...lbl, color: c.zone==='pattern'?t.accent : c.zone==='price'?t.emerald : t.text3, whiteSpace:'nowrap' }}>{c.head}</div>
                  {c.sub && <div style={{ fontSize:'9px', color:t.text3, fontFamily:t.body, marginTop:'1px', opacity:0.7 }}>{c.sub}</div>}
                </div>
              ))}
            </div>

            {/* Data rows */}
            {rooms.map((r,i) => (
              <div key={r.id} style={{
                display:'grid',
                gridTemplateColumns: cols.map(c=>c.w+'px').join(' '),
                borderBottom:`1px solid ${t.border}`,
                borderLeft:`3px solid ${t.accent}28`,
                background: i%2===0 ? t.surface : (t.isDark?`${t.bgSub}50`:`${t.bg}60`),
                alignItems:'center',
              }}>
                {/* name */}
                <div style={{ padding:'8px 10px', borderRight:`1px solid ${t.border}` }}>
                  <span style={{ fontSize:'13px', fontWeight:'600', fontFamily:t.body, color:t.text1 }}>{r.name}</span>
                </div>
                {/* width */}
                <div style={{ padding:'6px 6px', borderRight:`1px solid ${t.border}` }}><CellInput value={r.w} zone="input"/></div>
                {/* length */}
                <div style={{ padding:'6px 6px', borderRight:`1px solid ${t.border}` }}><CellInput value={r.l} zone="input"/></div>
                {/* bearing */}
                <div style={{ padding:'6px 6px', borderRight:`1px solid ${t.border}` }}><CellInput value={r.bear} zone="input"/></div>
                {/* corr */}
                <div style={{ padding:'6px 6px', borderRight:`1px solid ${t.border}` }}><CellInput value={r.corr} zone="input"/></div>
                {/* slab L — computed blue */}
                <div style={{ padding:'6px 8px', borderRight:`1px solid ${t.border}`, textAlign:'center' }}>
                  <span style={{ ...cell, color:t.accent, fontWeight:'600' }}>{r.slabL}</span>
                </div>
                {/* pattern dropdown */}
                <div style={{ padding:'6px 6px', borderRight:`1px solid ${t.border}` }}>
                  <div style={{
                    background:`${t.accent}12`, border:`1px solid ${t.accent}28`,
                    borderRadius:'4px', padding:'4px 8px',
                    fontSize:'11px', fontFamily:t.mono, color:t.accent, fontWeight:'600',
                    display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer',
                  }}>
                    <span>{r.pat}</span>
                    <span style={{ opacity:0.5, fontSize:'9px' }}>▾</span>
                  </div>
                </div>
                {/* extra checkbox */}
                <div style={{ padding:'6px', borderRight:`1px solid ${t.border}`, display:'flex', justifyContent:'center' }}>
                  <Checkbox checked={r.extra}/>
                </div>
                {/* start checkbox */}
                <div style={{ padding:'6px', borderRight:`1px solid ${t.border}`, display:'flex', justifyContent:'center' }}>
                  <Checkbox checked={r.start}/>
                </div>
                {/* beam L */}
                <div style={{ padding:'6px 8px', borderRight:`1px solid ${t.border}`, textAlign:'center' }}>
                  <span style={{ ...computed }}>{r.beamL}</span>
                </div>
                {/* pitches */}
                <div style={{ padding:'6px 8px', borderRight:`1px solid ${t.border}`, textAlign:'center' }}>
                  <span style={{ ...computed }}>{r.pitches}</span>
                </div>
                {/* rows */}
                <div style={{ padding:'6px 8px', borderRight:`1px solid ${t.border}`, textAlign:'center' }}>
                  <span style={{ ...computed }}>{r.rows}</span>
                </div>
                {/* per row */}
                <div style={{ padding:'6px 8px', borderRight:`1px solid ${t.border}`, textAlign:'center' }}>
                  <span style={{ ...computed }}>{r.perRow}</span>
                </div>
                {/* blocks — amber */}
                <div style={{ padding:'6px 8px', borderRight:`1px solid ${t.border}`, textAlign:'center', background:`${t.warning}08` }}>
                  <span style={{ ...cell, color:t.warning, fontWeight:'700' }}>{r.blocks}</span>
                </div>
                {/* beams — green */}
                <div style={{ padding:'6px 8px', borderRight:`1px solid ${t.border}`, textAlign:'center' }}>
                  <span style={{ ...cell, color:t.emerald, fontWeight:'600' }}>{r.beams}</span>
                </div>
                {/* area */}
                <div style={{ padding:'6px 8px', borderRight:`1px solid ${t.border}`, textAlign:'right' }}>
                  <span style={{ ...computed, whiteSpace:'nowrap' }}>{r.area} m²</span>
                </div>
                {/* rate */}
                <div style={{ padding:'6px 6px', borderRight:`1px solid ${t.border}` }}>
                  <div style={{
                    background: t.isDark?`${t.emerald}10`:`${t.emerald}08`,
                    border:`1px solid ${t.emerald}28`, borderRadius:'4px',
                    padding:'4px 8px', fontSize:'11px', fontFamily:t.mono,
                    color:t.emerald, fontWeight:'500', cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'space-between',
                    whiteSpace:'nowrap',
                  }}>
                    <span>{r.rate}</span>
                    <span style={{ opacity:0.5, fontSize:'9px', marginLeft:'4px' }}>▾</span>
                  </div>
                </div>
                {/* subtotal */}
                <div style={{ padding:'6px 10px', borderRight:`1px solid ${t.border}`, textAlign:'right' }}>
                  <span style={{ ...cell, color:t.emerald, fontWeight:'700', fontSize:'13px' }}>{r.sub}</span>
                </div>
                {/* delete */}
                <div style={{ padding:'6px', display:'flex', justifyContent:'center' }}>
                  <button style={{
                    width:24, height:24, borderRadius:'5px', border:'none',
                    background:'transparent', cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    color:t.text3, transition:'all 120ms',
                  }}
                  onMouseEnter={e=>{e.currentTarget.style.background=`${t.danger}18`;e.currentTarget.style.color=t.danger;}}
                  onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color=t.text3;}}
                  >
                    <Icon name="x" size={13}/>
                  </button>
                </div>
              </div>
            ))}

            {/* Totals row */}
            <div style={{
              display:'grid',
              gridTemplateColumns: cols.map(c=>c.w+'px').join(' '),
              borderTop:`2px solid ${t.borderStrong||t.border}`,
              background: t.isDark ? `${t.accent}06` : `${t.accent}04`,
              alignItems:'center',
            }}>
              <div style={{ padding:'10px 10px', gridColumn:'1/6', borderRight:`1px solid ${t.border}` }}>
                <span style={{ ...lbl, color:t.text2 }}>ЖАМИ · TOTALS</span>
              </div>
              <div style={{ padding:'10px 8px', borderRight:`1px solid ${t.border}`, textAlign:'center' }}>
                <span style={{ ...cell, color:t.accent, fontWeight:'700' }}>
                  {rooms[0]?.slabL} m
                </span>
              </div>
              <div style={{ padding:'10px 8px', gridColumn:'8/14', borderRight:`1px solid ${t.border}` }}/>
              <div style={{ padding:'10px 8px', borderRight:`1px solid ${t.border}`, textAlign:'center', background:`${t.warning}08` }}>
                <span style={{ ...cell, color:t.warning, fontWeight:'800' }}>{totalBlocks}</span>
              </div>
              <div style={{ padding:'10px 8px', borderRight:`1px solid ${t.border}`, textAlign:'center' }}>
                <span style={{ ...cell, color:t.emerald, fontWeight:'700' }}>{totalBeams}</span>
              </div>
              <div style={{ padding:'10px 8px', borderRight:`1px solid ${t.border}`, textAlign:'right' }}>
                <span style={{ ...cell, fontWeight:'700', whiteSpace:'nowrap' }}>{totalArea} m²</span>
              </div>
              <div style={{ padding:'10px 8px', borderRight:`1px solid ${t.border}` }}/>
              <div style={{ padding:'10px 10px', textAlign:'right' }}>
                <span style={{ ...cell, color:t.emerald, fontWeight:'800', fontSize:'14px' }}>{fmt(totalSub)}</span>
              </div>
              <div/>
            </div>
          </div>
        </div>
      </div>

      {/* Action toolbar */}
      <div style={{
        display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap',
        padding:'12px 16px',
        background:t.surface, border:`1px solid ${t.border}`,
        borderRadius:t.rSm, marginBottom:'20px',
      }}>
        {/* Round to */}
        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginRight:'4px' }}>
          <span style={{ ...lbl, color:t.text3, whiteSpace:'nowrap' }}>ЛАБОРАТОРИЙ ЎЛЧАМ · ROUND TO</span>
          <div style={{ display:'flex', gap:'2px', background:t.bgSub, border:`1px solid ${t.border}`, borderRadius:'6px', overflow:'hidden', padding:'2px' }}>
            {['10','5'].map(v => (
              <button key={v} onClick={()=>setRounding(v)} style={{
                padding:'4px 10px', borderRadius:'4px', border:'none', cursor:'pointer',
                background: rounding===v ? t.text1 : 'transparent',
                color: rounding===v ? t.bg : t.text2,
                fontSize:'11px', fontFamily:t.mono, fontWeight:'700',
                transition:'all 120ms',
              }}>{v} СМ</button>
            ))}
          </div>
          <button style={{
            display:'flex', alignItems:'center', gap:'4px', padding:'5px 10px',
            background:t.bgSub, border:`1px solid ${t.border}`, borderRadius:'6px',
            cursor:'pointer', fontSize:'11px', fontFamily:t.mono, color:t.text2, fontWeight:'600',
          }}>
            <span>↑</span> ALL
          </button>
        </div>

        <div style={{ width:'1px', height:'24px', background:t.border, margin:'0 4px' }}/>

        {/* Add room */}
        <button style={{
          display:'flex', alignItems:'center', gap:'7px',
          padding:'7px 14px', borderRadius:'6px',
          background:`${t.accent}12`, border:`1px solid ${t.accent}28`,
          cursor:'pointer', color:t.accent, fontSize:'12px',
          fontFamily:t.body, fontWeight:'600', transition:'all 120ms',
          whiteSpace:'nowrap', flexShrink:0,
        }}
        onMouseEnter={e=>{e.currentTarget.style.background=`${t.accent}22`;}}
        onMouseLeave={e=>{e.currentTarget.style.background=`${t.accent}12`;}}
        >
          <Icon name="plus" size={13}/> Add room · Янги хона
          <kbd style={{ fontSize:'10px', fontFamily:t.mono, background:t.bgSub, border:`1px solid ${t.border}`, borderRadius:'3px', padding:'1px 5px', color:t.text3, marginLeft:'2px' }}>Shift+↵</kbd>
        </button>

        {/* Clear */}
        <button style={{
          display:'flex', alignItems:'center', gap:'6px', padding:'7px 12px',
          borderRadius:'6px', background:'transparent', border:`1px solid ${t.border}`,
          cursor:'pointer', color:t.danger, fontSize:'12px', fontFamily:t.body, fontWeight:'600',
          whiteSpace:'nowrap', flexShrink:0,
        }}>
          <Icon name="x" size={13}/> Тозалаш · Clear
        </button>

        {/* Spacer */}
        <div style={{ flex:1 }}/>

        {/* Save */}
        <button style={{
          display:'flex', alignItems:'center', gap:'6px', padding:'7px 14px',
          borderRadius:'6px', background:'transparent', border:`1px solid ${t.border}`,
          cursor:'pointer', color:t.text2, fontSize:'12px', fontFamily:t.body, fontWeight:'600',
          whiteSpace:'nowrap', flexShrink:0,
        }}>
          Save Project
        </button>

        {/* Place order */}
        <button style={{
          display:'flex', alignItems:'center', gap:'7px', padding:'7px 18px',
          borderRadius:'6px', background:t.accent, border:'none',
          cursor:'pointer', color:'#fff', fontSize:'12px', fontFamily:t.body, fontWeight:'700',
          transition:'all 120ms', whiteSpace:'nowrap', flexShrink:0,
        }}
        onMouseEnter={e=>{e.currentTarget.style.background=t.accentHover;}}
        onMouseLeave={e=>{e.currentTarget.style.background=t.accent;}}
        >
          <Icon name="arrowRight" size={13}/> Буюртма Бериш · Place Order
        </button>
      </div>

      {/* Three bottom panels */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'16px' }}>
        {/* Grand total */}
        <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:t.r, padding:'18px 20px' }}>
          <div style={{ ...lbl, color:t.text3, marginBottom:'16px' }}>СЎНГИ НАРХИ · GRAND TOTAL</div>
          {[
            { l:'Жами хоналар · Rooms subtotal', v:fmt(totalSub), bold:false, color:t.text1 },
            { l:'Чегирма % · Discount %',        v:'—',           bold:false, color:t.text3, input:true },
            { l:'Чегирма сумма · Discount UZS',  v:'—',           bold:false, color:t.text3, input:true },
          ].map((row,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 0', borderBottom:`1px solid ${t.border}` }}>
              <span style={{ fontSize:'12px', fontFamily:t.body, color:t.text2 }}>{row.l}</span>
              <span style={{ fontFamily:t.mono, fontSize:'12px', color:row.color, fontVariantNumeric:'tabular-nums', fontWeight: row.bold?'700':'500' }}>{row.v}</span>
            </div>
          ))}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:'12px', gap:'8px' }}>
            <span style={{ fontSize:'13px', fontFamily:t.body, color:t.text1, fontWeight:'700', whiteSpace:'nowrap' }}>Сумма · Total</span>
            <span style={{ fontFamily:t.mono, fontSize:'15px', color:t.emerald, fontWeight:'800', fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>
              {fmt(totalSub)} <span style={{ fontSize:'11px', fontWeight:'500' }}>UZS</span>
            </span>
          </div>
        </div>

        {/* Production list */}
        <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:t.r, padding:'18px 20px' }}>
          <div style={{ ...lbl, color:t.text3, marginBottom:'16px' }}>БАЛКА + ҒИШТ · PRODUCTION LIST</div>
          {rooms.map(r => (
            <div key={r.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:`1px solid ${t.border}` }}>
              <span style={{ fontSize:'12px', fontFamily:t.body, color:t.text1, fontWeight:'500' }}>
                Балка {r.beamL}m
              </span>
              <div style={{ display:'flex', gap:'14px' }}>
                <span style={{ fontSize:'11px', fontFamily:t.mono, color:t.warning, fontWeight:'600' }}>×{r.beams} beams</span>
                <span style={{ fontSize:'11px', fontFamily:t.mono, color:t.text3 }}>{r.blocks} blocks</span>
              </div>
            </div>
          ))}
          <div style={{ paddingTop:'10px', display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontSize:'11px', fontFamily:t.body, color:t.text3 }}>Total</span>
            <span style={{ fontSize:'11px', fontFamily:t.mono, color:t.warning, fontWeight:'700' }}>{totalBeams} beams · {totalBlocks} blocks</span>
          </div>
        </div>

        {/* Materials */}
        <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:t.r, padding:'18px 20px' }}>
          <div style={{ ...lbl, color:t.text3, marginBottom:'16px' }}>МАТЕРИАЛЛАР · MATERIALS</div>
          {[
            { l:'Бетон қатлами · Concrete topping', v:`${(parseFloat(totalArea)*0.05).toFixed(2)} m³`, c:t.accent },
            { l:'Йиғма майдон · Slab area',          v:`${totalArea} m²`,                              c:t.text1 },
          ].map((row,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom: i===0?`1px solid ${t.border}`:'none' }}>
              <span style={{ fontSize:'12px', fontFamily:t.body, color:t.text2 }}>{row.l}</span>
              <span style={{ fontFamily:t.mono, fontSize:'13px', color:row.c, fontWeight:'700', fontVariantNumeric:'tabular-nums' }}>{row.v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Placeholder ───────────────────────────────────────────────────────────────
function PlaceholderScreen({ page, t }) {
  const labels = { payments:'Тўловлар · Payments', drivers:'Ҳайдовчилар · Drivers', production:'Ишлаб чиқариш · Production', warehouse:'Омбор · Warehouse', discrepancies:'Тафовутлар · Discrepancies', projects:'Лойиҳалар · Projects', users:'Фойдаланувчилар · Users' };
  const icons  = { payments:'payments', drivers:'drivers', production:'production', warehouse:'warehouse', discrepancies:'discrepancies', projects:'projects', users:'users' };
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'14px', padding:'80px 32px' }}>
      <div style={{ width:52, height:52, borderRadius:t.r, background:`${t.accent}12`, border:`1px solid ${t.accent}20`, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <Icon name={icons[page]||'dashboard'} size={24} style={{ color:t.accent }}/>
      </div>
      <div style={{ fontSize:'16px', fontWeight:'700', color:t.text1, fontFamily:t.head }}>{labels[page]||page}</div>
      <div style={{ fontSize:'13px', color:t.text3, fontFamily:t.body, textAlign:'center', maxWidth:320, lineHeight:1.6 }}>
        Full implementation exists in the codebase — not rendered in this prototype view.
      </div>
    </div>
  );
}

Object.assign(window, { DashboardScreen, OrdersScreen, ClientsScreen, CalculatorScreen, PlaceholderScreen, Pipeline, CapacityCalendar });
