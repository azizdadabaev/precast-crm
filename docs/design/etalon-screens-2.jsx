// etalon-screens-2.jsx — Projects, Payments, Discrepancies, Clients (updated),
//   Drivers, Production, Warehouse, Sandbox, Users, Login

// ── shared helpers ────────────────────────────────────────────────────────────
function PageHead({ uz, en, sub, t, right }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'20px', flexWrap:'wrap', gap:'12px' }}>
      <div>
        <h1 style={{ fontSize:'20px', fontWeight:'800', letterSpacing:'-0.02em', color:t.text1, fontFamily:t.head, margin:0 }}>
          {uz} <span style={{ fontSize:'13px', fontWeight:'500', color:t.text3, fontFamily:t.body }}>· {en}</span>
        </h1>
        {sub && <p style={{ fontSize:'12px', color:t.text3, fontFamily:t.body, margin:'3px 0 0' }}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

function TabBar({ tabs, active, onChange, t }) {
  return (
    <div style={{ display:'flex', gap:'0', marginBottom:'18px', borderBottom:`2px solid ${t.border}` }}>
      {tabs.map(([v,l]) => (
        <button key={v} onClick={()=>onChange(v)} style={{
          padding:'9px 18px', border:'none', background:'transparent', cursor:'pointer',
          fontSize:'12px', fontFamily:t.body, fontWeight:'700', letterSpacing:'0.06em',
          textTransform:'uppercase', color: active===v ? t.accent : t.text3,
          borderBottom: active===v ? `2px solid ${t.accent}` : '2px solid transparent',
          marginBottom:'-2px', transition:'color 120ms',
        }}>{l}</button>
      ))}
    </div>
  );
}

function DataTable({ cols, rows, t, minWidth }) {
  return (
    <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:t.r, overflow:'auto' }}>
      <div style={{ minWidth: minWidth||'100%' }}>
        <div style={{ display:'grid', gridTemplateColumns:cols.map(c=>c.w).join(' '), padding:'9px 18px', gap:'10px', background:t.isDark?t.bgSub:t.bg, borderBottom:`2px solid ${t.border}` }}>
          {cols.map(c => <span key={c.k} style={{ fontSize:'10px', fontWeight:'700', letterSpacing:'0.09em', textTransform:'uppercase', color:t.text3, fontFamily:t.body, textAlign:c.r?'right':'left', whiteSpace:'nowrap' }}>{c.l}</span>)}
        </div>
        {rows.length===0 && <div style={{ padding:'40px', textAlign:'center', color:t.text3, fontFamily:t.body, fontSize:'13px' }}>No records.</div>}
        {rows.map((row,i) => (
          <div key={row.__k||i} style={{
            display:'grid', gridTemplateColumns:cols.map(c=>c.w).join(' '),
            padding:'12px 18px', gap:'10px', alignItems:'center',
            borderBottom: i<rows.length-1 ? `1px solid ${t.border}` : 'none',
            borderLeft:`3px solid ${row.__a||'transparent'}`,
            background: i%2===0 ? t.surface : (t.isDark?`${t.bgSub}70`:`${t.bg}80`),
            cursor:'pointer', transition:'background 100ms',
          }}
          onMouseEnter={e=>e.currentTarget.style.background=t.surfaceHover}
          onMouseLeave={e=>e.currentTarget.style.background=i%2===0?t.surface:(t.isDark?`${t.bgSub}70`:`${t.bg}80`)}
          >
            {cols.map(c => <div key={c.k} style={{ textAlign:c.r?'right':'left', minWidth:0 }}>{row[c.k]}</div>)}
          </div>
        ))}
      </div>
    </div>
  );
}

function mono12(t) { return { fontFamily:t.mono, fontSize:'12px', fontVariantNumeric:'tabular-nums', color:t.text1 }; }

// ── PROJECTS ──────────────────────────────────────────────────────────────────
function ProjectsScreen({ t }) {
  const [tab, setTab] = React.useState('drafts');
  const [q, setQ] = React.useState('');
  const data = [
    { id:'1', client:'—',               phone:'9989623515',      addr:'—',         rooms:8, area:'17.81 m²', sub:'2 492 840', status:'DRAFT', upd:'11 May 2026' },
    { id:'2', client:'—',               phone:'+998 93 403 65 67',addr:'—',         rooms:1, area:'22.45 m²', sub:'3 142 440', status:'DRAFT', upd:'11 May 2026' },
    { id:'3', client:'—',               phone:'+998 93 505 66 88',addr:'—',         rooms:8, area:'19.96 m²', sub:'3 518 240', status:'DRAFT', upd:'11 May 2026' },
  ];
  const m = mono12(t);
  const cols = [
    { k:'client', l:'МИЖОЗ · CLIENT',   w:'1fr'   },
    { k:'phone',  l:'ТЕЛ · PHONE',      w:'160px' },
    { k:'addr',   l:'МАНЗИЛ · ADDRESS', w:'160px' },
    { k:'rooms',  l:'ХОНАЛАР · ROOMS',  w:'90px', r:true },
    { k:'area',   l:'МАЙДОН · AREA',    w:'110px', r:true },
    { k:'sub',    l:'СУММА · SUBTOTAL', w:'130px', r:true },
    { k:'status', l:'STATUS',           w:'130px' },
    { k:'upd',    l:'UPDATED',          w:'130px' },
  ];
  const rows = data.map(d => ({
    __k:d.id, __a:`${t.warning}60`,
    client: <span style={{ ...m, color:t.text3 }}>{d.client}</span>,
    phone:  <span style={{ ...m }}>{d.phone}</span>,
    addr:   <span style={{ ...m, color:t.text3 }}>{d.addr}</span>,
    rooms:  <span style={{ ...m, textAlign:'right', display:'block' }}>{d.rooms}</span>,
    area:   <span style={{ ...m, textAlign:'right', display:'block', whiteSpace:'nowrap' }}>{d.area}</span>,
    sub:    <span style={{ ...m, fontWeight:'700', color:t.text1, textAlign:'right', display:'block' }}>{d.sub}</span>,
    status: <span style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'3px 10px', borderRadius:'20px', fontSize:'10px', fontWeight:'700', fontFamily:t.mono, letterSpacing:'0.06em', textTransform:'uppercase', background:`${t.warning}18`, color:t.warning, border:`1px solid ${t.warning}30` }}>ЛОЙИХА · DRAFT</span>,
    upd:    <span style={{ ...m, color:t.text2, fontSize:'11px' }}>{d.upd}</span>,
  }));
  return (
    <div style={{ padding:'24px' }}>
      <PageHead uz="Лойиҳалар" en="Projects" sub="Saved calculations not yet placed as orders. Search by name, phone or address." t={t}
        right={<Btn icon="plus" t={t} small>New Calculation</Btn>}/>
      <div style={{ display:'flex', gap:'10px', marginBottom:'16px', alignItems:'center' }}>
        <SearchBar value={q} onChange={setQ} placeholder="Қидириш · Search by name, phone (last 4 digits OK), or address" t={t}/>
        <div style={{ display:'flex', border:`1px solid ${t.border}`, borderRadius:t.rSm, overflow:'hidden', background:t.surface }}>
          {[['drafts','DRAFTS'],['all','ALL']].map(([v,l]) => (
            <button key={v} onClick={()=>setTab(v)} style={{ padding:'8px 16px', border:'none', cursor:'pointer', background:tab===v?t.accent:'transparent', color:tab===v?'#fff':t.text2, fontSize:'11px', fontFamily:t.body, fontWeight:'700', letterSpacing:'0.05em', borderRight:`1px solid ${t.border}`, transition:'all 120ms' }}>{l}</button>
          ))}
        </div>
      </div>
      <DataTable cols={cols} rows={rows} t={t}/>
    </div>
  );
}

// ── PAYMENTS ──────────────────────────────────────────────────────────────────
function PaymentsScreen({ t }) {
  const [tab, setTab] = React.useState('pending');
  const data = [
    { id:'1', order:'2026-05-0010', client:'Bobur',          phone:'+998 93 481 33 30', addr:'Andijon',          amount:'2 500 000', expected:'—',         method:'Cash · Нақд', driver:'—',               rec:'11 May 2026', status:'PENDING' },
    { id:'2', order:'2026-05-0008', client:'Bobur',          phone:'+998 93 481 33 30', addr:'Andijon',          amount:'1 000 000', expected:'—',         method:'Cash · Нақд', driver:'—',               rec:'11 May 2026', status:'PENDING' },
    { id:'3', order:'2026-05-0007', client:'Davron Yusupov', phone:'+998 93 403 65 67', addr:"Qo'qon · Buvayda", amount:'1 000 000', expected:'—',         method:'Cash · Нақд', driver:'—',               rec:'11 May 2026', status:'PENDING' },
    { id:'4', order:'2026-05-0004', client:'Yusupov & Sons', phone:'+998 90 987 65 43', addr:'Bukhara · Old town',amount:'3 500 000', expected:'3 500 000', method:'Cash · Нақд', driver:'Sherzod Tursunov', rec:'11 May 2026', status:'PENDING' },
  ];
  const m = mono12(t);
  const cols = [
    { k:'order',  l:'ORDER',            w:'140px' },
    { k:'client', l:'CLIENT',           w:'1fr'   },
    { k:'addr',   l:'МАНЗИЛ · ADDRESS', w:'150px' },
    { k:'amount', l:'AMOUNT',           w:'120px', r:true },
    { k:'exp',    l:'EXPECTED',         w:'120px', r:true },
    { k:'method', l:'METHOD',           w:'120px' },
    { k:'driver', l:'DRIVER',           w:'150px' },
    { k:'rec',    l:'RECORDED',         w:'120px' },
    { k:'status', l:'STATUS',           w:'120px' },
    { k:'action', l:'',                 w:'100px' },
  ];
  const rows = data.map(d => ({
    __k:d.id, __a:t.warning,
    order:  <span style={{ ...m, color:t.accent, fontWeight:'600' }}>{d.order}</span>,
    client: <div><div style={{ fontSize:'13px', fontFamily:t.body, color:t.text1, fontWeight:'600' }}>{d.client}</div><div style={{ fontSize:'11px', color:t.text3, fontFamily:t.mono }}>{d.phone}</div></div>,
    addr:   <span style={{ fontSize:'11px', fontFamily:t.body, color:t.text3 }}>{d.addr}</span>,
    amount: <span style={{ ...m, fontWeight:'700', textAlign:'right', display:'block' }}>{d.amount}</span>,
    exp:    <span style={{ ...m, color:t.text3, textAlign:'right', display:'block' }}>{d.expected}</span>,
    method: <span style={{ fontSize:'12px', fontFamily:t.body, color:t.text2 }}>{d.method}</span>,
    driver: <span style={{ fontSize:'12px', fontFamily:t.body, color:t.text2 }}>{d.driver}</span>,
    rec:    <span style={{ ...m, color:t.text2, fontSize:'11px' }}>{d.rec}</span>,
    status: <span style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'3px 9px', borderRadius:'20px', fontSize:'10px', fontWeight:'700', fontFamily:t.mono, letterSpacing:'0.05em', background:`${t.warning}18`, color:t.warning, border:`1px solid ${t.warning}30` }}>⏳ PENDING</span>,
    action: <button style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'6px 14px', background:t.emerald, color:'#fff', border:'none', borderRadius:t.rXs, cursor:'pointer', fontSize:'11px', fontFamily:t.body, fontWeight:'700', whiteSpace:'nowrap' }}>✓ Review</button>,
  }));
  return (
    <div style={{ padding:'24px' }}>
      <PageHead uz="Тўловлар" en="Payments" sub="Maker-checker queue. Operators record cash; ADMIN or OWNER confirms or rejects." t={t}/>
      <TabBar tabs={[['pending','PENDING'],['confirmed','CONFIRMED'],['rejected','REJECTED']]} active={tab} onChange={setTab} t={t}/>
      <DataTable cols={cols} rows={rows} t={t} minWidth="1200px"/>
    </div>
  );
}

// ── DISCREPANCIES ─────────────────────────────────────────────────────────────
function DiscrepanciesScreen({ t }) {
  const [tab, setTab] = React.useState('open');
  const m = mono12(t);
  const cols = [
    { k:'order',  l:'ORDER #',   w:'140px' },
    { k:'client', l:'CLIENT',    w:'160px' },
    { k:'driver', l:'DRIVER',    w:'140px' },
    { k:'exp',    l:'EXPECTED',  w:'120px', r:true },
    { k:'recv',   l:'RECEIVED',  w:'120px', r:true },
    { k:'short',  l:'SHORT',     w:'110px', r:true },
    { k:'status', l:'STATUS',    w:'90px'  },
    { k:'rep',    l:'REPORTED',  w:'150px' },
    { k:'res',    l:'RESOLVED',  w:'100px' },
    { k:'action', l:'',          w:'90px'  },
  ];
  const rows = [{
    __k:'1', __a:t.danger,
    order:  <span style={{ ...m, color:t.accent, fontWeight:'600' }}>2026-05-0006</span>,
    client: <span style={{ fontSize:'13px', fontFamily:t.body, color:t.text1, fontWeight:'600' }}>Andijon Stroy</span>,
    driver: <span style={{ fontSize:'12px', fontFamily:t.body, color:t.text2 }}>Diyor Yusupov</span>,
    exp:    <span style={{ ...m, textAlign:'right', display:'block' }}>6 000 000</span>,
    recv:   <span style={{ ...m, textAlign:'right', display:'block' }}>5 500 000</span>,
    short:  <span style={{ ...m, color:t.danger, fontWeight:'800', textAlign:'right', display:'block' }}>500 000</span>,
    status: <span style={{ display:'inline-flex', padding:'2px 8px', borderRadius:'4px', fontSize:'10px', fontWeight:'700', fontFamily:t.mono, letterSpacing:'0.06em', background:`${t.warning}18`, color:t.warning, border:`1px solid ${t.warning}30` }}>OPEN</span>,
    rep:    <div><div style={{ fontSize:'11px', fontFamily:t.mono, color:t.text2 }}>11 May 2026</div><div style={{ fontSize:'10px', color:t.text3, fontFamily:t.body }}>Aziz Dadabaev</div></div>,
    res:    <span style={{ ...m, color:t.text3 }}>—</span>,
    action: <button style={{ padding:'6px 12px', background:t.surface, border:`1px solid ${t.border}`, borderRadius:t.rXs, cursor:'pointer', fontSize:'11px', fontFamily:t.body, color:t.text1, fontWeight:'600' }}>Update</button>,
  }];
  return (
    <div style={{ padding:'24px' }}>
      <PageHead uz="Тафовутлар" en="Discrepancies" sub="Cash shortfalls flagged at confirmation time. ADMIN / OWNER only." t={t}/>
      <TabBar tabs={[['open','OPEN'],['resolved','RESOLVED'],['disputed','DISPUTED']]} active={tab} onChange={setTab} t={t}/>
      <DataTable cols={cols} rows={rows} t={t} minWidth="1100px"/>
    </div>
  );
}

// ── CLIENTS (updated to match actual codebase columns) ─────────────────────────
function ClientsScreen({ t }) {
  const [q, setQ] = React.useState('');
  const [lang, setLang] = React.useState('all');
  const data = [
    { id:'1', name:'jjkbk',            phone:'+998 93 676 15 88', addr:'mlkm',                    lang:'UZ', src:'—',         orders:1, added:'11 May 2026' },
    { id:'2', name:'Bobur',            phone:'+998 93 481 33 30', addr:'Andijon',                  lang:'UZ', src:'—',         orders:2, added:'11 May 2026' },
    { id:'3', name:'Davron Yusupov',   phone:'+998 93 403 65 67', addr:"Qo'qon · Buvayda",        lang:'UZ', src:'—',         orders:1, added:'11 May 2026' },
    { id:'4', name:'Andijon Stroy',    phone:'+998 93 444 55 66', addr:'Andijon · Bobur 14',       lang:'UZ', src:'Walk-in',   orders:1, added:'11 May 2026' },
    { id:'5', name:'Navoi Build',      phone:'+998 93 001 12 23', addr:'Navoi · Center',           lang:'UZ', src:'Instagram', orders:2, added:'11 May 2026' },
    { id:'6', name:'Stroy-Master',     phone:'+998 99 777 88 99', addr:'Tashkent · Chilanzar',    lang:'RU', src:'Referral',  orders:0, added:'11 May 2026' },
    { id:'7', name:'Yusupov & Sons',   phone:'+998 90 987 65 43', addr:'Bukhara · Old town',       lang:'UZ', src:'Instagram', orders:1, added:'11 May 2026' },
    { id:'8', name:'BuildPro Group',   phone:'+998 77 123 45 67', addr:'Tashkent · Mirzo-Ulugbek', lang:'RU', src:'Walk-in',   orders:0, added:'11 May 2026' },
    { id:'9', name:'Karimov LLC',      phone:'+998 93 555 44 66', addr:'Samarkand · Registan',    lang:'UZ', src:'Referral',  orders:1, added:'11 May 2026' },
    { id:'10',name:'Aliyev Construction',phone:'+998 90 111 22 33',addr:'Tashkent · Yunusobod',   lang:'UZ', src:'Instagram', orders:1, added:'11 May 2026' },
  ];
  const m = mono12(t);
  const filtered = data.filter(c => (lang==='all'||c.lang===lang) && (!q||c.name.toLowerCase().includes(q.toLowerCase())||c.phone.includes(q)||c.addr.toLowerCase().includes(q.toLowerCase())));
  const cols = [
    { k:'sel',    l:'',                  w:'36px'  },
    { k:'name',   l:'ИСМ · NAME',        w:'1fr'   },
    { k:'phone',  l:'ТЕЛ · PHONE',       w:'160px' },
    { k:'addr',   l:'МАНЗИЛ · ADDRESS',  w:'200px' },
    { k:'lang',   l:'LANG',              w:'60px'  },
    { k:'src',    l:'SOURCE',            w:'110px' },
    { k:'orders', l:'ORDERS',            w:'80px', r:true },
    { k:'added',  l:'ADDED',             w:'120px' },
  ];
  const rows = filtered.map(c => ({
    __k:c.id,
    sel: <div style={{ width:15, height:15, borderRadius:'3px', border:`1.5px solid ${t.border}`, background:'transparent', cursor:'pointer' }}/>,
    name: <span style={{ fontSize:'13px', fontFamily:t.body, color:t.text1, fontWeight:'600' }}>{c.name}</span>,
    phone: <span style={{ ...m, color:t.accent }}>{c.phone}</span>,
    addr: <span style={{ fontSize:'11px', fontFamily:t.body, color:t.text3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'block' }}>{c.addr}</span>,
    lang: <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:'3px', fontSize:'10px', fontWeight:'700', fontFamily:t.mono, background: c.lang==='RU'?`${t.danger}18`:`${t.accent}18`, color:c.lang==='RU'?t.danger:t.accent }}>{c.lang}</span>,
    src: <span style={{ fontSize:'12px', fontFamily:t.body, color:c.src==='—'?t.text3:t.text2 }}>{c.src}</span>,
    orders: <span style={{ ...m, textAlign:'right', display:'block', color:c.orders>0?t.text1:t.text3 }}>{c.orders}</span>,
    added: <span style={{ fontSize:'11px', fontFamily:t.mono, color:t.text2 }}>{c.added}</span>,
  }));
  return (
    <div style={{ padding:'24px' }}>
      <PageHead uz="Мижозлар" en="Clients" sub="Auto-populated when an Order is placed. Search by name, phone (last 4 digits OK), or address." t={t}
        right={<Btn icon="plus" t={t} small>+ New Client</Btn>}/>
      <div style={{ display:'flex', gap:'10px', marginBottom:'16px', alignItems:'center' }}>
        <SearchBar value={q} onChange={setQ} placeholder="Қидириш · name, phone (last 4 digits OK), or address..." t={t}/>
        <select value={lang} onChange={e=>setLang(e.target.value)} style={{ padding:'8px 12px', border:`1px solid ${t.border}`, borderRadius:t.rSm, background:t.surface, color:t.text1, fontSize:'12px', fontFamily:t.body, cursor:'pointer' }}>
          <option value="all">All languages</option>
          <option value="UZ">UZ</option>
          <option value="RU">RU</option>
        </select>
      </div>
      <DataTable cols={cols} rows={rows} t={t}/>
      <div style={{ marginTop:'10px', fontSize:'11px', fontFamily:t.mono, color:t.text3 }}>{filtered.length} clients</div>
    </div>
  );
}

// ── DRIVERS ───────────────────────────────────────────────────────────────────
function DriversScreen({ t }) {
  const m = mono12(t);
  const data = [
    { id:'1', name:'Diyor Yusupov',   notes:'Backup driver, weekends',      phone:'+998 77 100 30 40', dispatches:0, disc30:1, last:'11 May 2026', active:true },
    { id:'2', name:'Olimjon Karimov', notes:'Lead driver, 12-ton truck',    phone:'+998 90 100 10 20', dispatches:3, disc30:0, last:'11 May 2026', active:true },
    { id:'3', name:'Sherzod Tursunov',notes:'Tashkent + Samarkand routes',  phone:'+998 93 500 20 30', dispatches:0, disc30:0, last:'11 May 2026', active:true },
  ];
  const cols = [
    { k:'name',   l:'ИСМ · NAME',            w:'1fr'   },
    { k:'phone',  l:'ТЕЛ · PHONE',           w:'160px' },
    { k:'disp',   l:'ACTIVE DISPATCHES',     w:'150px', r:true },
    { k:'disc',   l:'DISCREPANCIES (30D)',   w:'160px', r:true },
    { k:'last',   l:'LAST DISPATCH',         w:'140px' },
    { k:'status', l:'STATUS',               w:'100px' },
    { k:'action', l:'',                      w:'120px' },
  ];
  const rows = data.map(d => ({
    __k:d.id, __a:t.success,
    name: <div><div style={{ fontSize:'13px', fontFamily:t.body, color:t.text1, fontWeight:'600' }}>{d.name}</div><div style={{ fontSize:'11px', color:t.text3, fontFamily:t.body, fontStyle:'italic', marginTop:'1px' }}>{d.notes}</div></div>,
    phone: <span style={{ ...m }}>{d.phone}</span>,
    disp: <span style={{ ...m, textAlign:'right', display:'block', color:d.dispatches>0?t.accent:t.text2 }}>{d.dispatches}</span>,
    disc: <span style={{ ...m, textAlign:'right', display:'block', color:d.disc30>0?t.danger:t.text2, fontWeight:d.disc30>0?'700':'400' }}>{d.disc30}</span>,
    last: <span style={{ fontSize:'11px', fontFamily:t.mono, color:t.accent }}>{d.last}</span>,
    status: <span style={{ display:'inline-flex', padding:'3px 10px', borderRadius:'20px', fontSize:'10px', fontWeight:'700', fontFamily:t.mono, background:`${t.success}18`, color:t.success, border:`1px solid ${t.success}30` }}>ACTIVE</span>,
    action: <button style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'6px 12px', background:'transparent', border:`1px solid ${t.border}`, borderRadius:t.rXs, cursor:'pointer', fontSize:'11px', fontFamily:t.body, color:t.text2 }}>⊘ Deactivate</button>,
  }));
  return (
    <div style={{ padding:'24px' }}>
      <PageHead uz="Хайдовчилар" en="Drivers" sub="Truck drivers who collect cash from customers at the delivery site." t={t}
        right={<Btn icon="plus" t={t} small>+ Add Driver</Btn>}/>
      <DataTable cols={cols} rows={rows} t={t}/>
    </div>
  );
}

// ── PRODUCTION ────────────────────────────────────────────────────────────────
function ProductionScreen({ t }) {
  const lbl = { fontSize:'10px', fontWeight:'700', letterSpacing:'0.09em', textTransform:'uppercase', color:t.text3, fontFamily:t.body };
  const entries = [
    { date:'11 May 2026', count:'1 entry', lines:[{ kind:'Ғишт · Blocks', beamL:'', qty:'+6000', isBlock:true }] },
    { date:'10 May 2026', count:'1 entry', lines:[{ kind:'Балка 4.30 m', beamL:'', qty:'+60',   isBlock:false }] },
    { date:'09 May 2026', count:'1 entry', note:'"Shift B · top-up" — Sales Manager', lines:[
      { kind:'Балка 4.30 m', qty:'+30', isBlock:false },
      { kind:'Балка 6.30 m', qty:'+12', isBlock:false },
      { kind:'Ғишт · Blocks', qty:'+800', isBlock:true },
    ]},
    { date:'05 May 2026', count:'1 entry', note:'"Shift A · Monday casting batch" — Sales Manager', lines:[
      { kind:'Балка 4.30 m', qty:'+40',   isBlock:false },
      { kind:'Балка 5.20 m', qty:'+25',   isBlock:false },
      { kind:'Балка 6.30 m', qty:'+18',   isBlock:false },
      { kind:'Ғишт · Blocks', qty:'+1200', isBlock:true },
    ]},
  ];
  return (
    <div style={{ padding:'24px' }}>
      <PageHead uz="Ишлаб чиқариш" en="Production" sub="Log today's factory output. Each entry increments stock in the warehouse." t={t}/>
      {/* Log form */}
      <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:t.r, padding:'20px', marginBottom:'24px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
          <span style={{ fontSize:'13px', fontWeight:'700', letterSpacing:'0.06em', textTransform:'uppercase', fontFamily:t.body, color:t.text1 }}>ЯНГИ МАҲСУЛОТ · LOG PRODUCTION</span>
          <span style={{ fontSize:'11px', color:t.text3, fontFamily:t.body }}>Each line increments stock.</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'200px 1fr', gap:'12px', marginBottom:'14px' }}>
          <div><div style={{ ...lbl, marginBottom:'5px' }}>САНА · DATE</div><div style={{ border:`1px solid ${t.border}`, borderRadius:t.rXs, padding:'8px 12px', fontFamily:t.mono, fontSize:'13px', color:t.text1, background:t.isDark?`${t.warning}10`:t.bg }}>05/11/2026</div></div>
          <div><div style={{ ...lbl, marginBottom:'5px' }}>ИЗОҲ · NOTES (OPTIONAL)</div><div style={{ border:`1px solid ${t.border}`, borderRadius:t.rXs, padding:'8px 12px', fontFamily:t.body, fontSize:'13px', color:t.text3, background:t.surface }}>e.g. Shift A, lot #42</div></div>
        </div>
        {/* Line grid */}
        <div style={{ border:`1px solid ${t.border}`, borderRadius:t.rXs, overflow:'hidden', marginBottom:'12px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 200px 150px 36px', padding:'8px 14px', gap:'10px', background:t.isDark?t.bgSub:t.bg, borderBottom:`1px solid ${t.border}` }}>
            {['KIND','BEAM LENGTH','QTY',''].map(h => <span key={h} style={lbl}>{h}</span>)}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 200px 150px 36px', padding:'10px 14px', gap:'10px', alignItems:'center' }}>
            <div style={{ border:`1px solid ${t.border}`, borderRadius:t.rXs, padding:'7px 12px', background:`${t.accent}10`, color:t.accent, fontSize:'12px', fontFamily:t.body, display:'flex', justifyContent:'space-between' }}>Балка · Beam <span>▾</span></div>
            <div style={{ border:`1px solid ${t.border}`, borderRadius:t.rXs, padding:'7px 12px', fontFamily:t.mono, fontSize:'12px', color:t.text1, background:t.isDark?`${t.warning}10`:t.bg }}>4.3</div>
            <div style={{ border:`1px solid ${t.border}`, borderRadius:t.rXs, padding:'7px 12px', fontFamily:t.mono, fontSize:'12px', color:t.text1, background:t.isDark?`${t.warning}10`:t.bg }}>0</div>
            <button style={{ width:28, height:28, border:'none', background:'transparent', cursor:'pointer', color:t.danger, display:'flex', alignItems:'center', justifyContent:'center' }}><Icon name="x" size={14}/></button>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <button style={{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'7px 14px', border:`1px dashed ${t.border}`, borderRadius:t.rXs, background:'transparent', cursor:'pointer', color:t.text3, fontSize:'12px', fontFamily:t.body }}>
            <Icon name="plus" size={12}/> Add line
          </button>
          <button style={{ display:'inline-flex', alignItems:'center', gap:'7px', padding:'8px 18px', background:t.text3, border:'none', borderRadius:t.rXs, cursor:'pointer', color:t.bg, fontSize:'12px', fontFamily:t.body, fontWeight:'700' }}>
            ✓ Save Production Log
          </button>
        </div>
      </div>
      {/* Recent 14 days */}
      <SectionHead t={t}>СЎНГГИ 14 КУН · RECENT 14 DAYS</SectionHead>
      <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
        {entries.map((e,ei) => (
          <div key={ei} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:t.rSm, padding:'14px 18px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
              <span style={{ fontSize:'13px', fontWeight:'700', fontFamily:t.head, color:t.text1 }}>{e.date}</span>
              <span style={{ fontSize:'11px', fontFamily:t.mono, color:t.text3 }}>{e.count}</span>
            </div>
            <div style={{ display:'flex', gap:'24px', flexWrap:'wrap' }}>
              {e.lines.map((l,li) => (
                <div key={li} style={{ display:'flex', gap:'10px', alignItems:'center' }}>
                  <span style={{ fontSize:'12px', fontFamily:t.body, color:l.isBlock?t.warning:t.accent }}>{l.kind}</span>
                  <span style={{ fontSize:'13px', fontFamily:t.mono, fontWeight:'700', color:l.isBlock?t.warning:t.text1 }}>{l.qty}</span>
                </div>
              ))}
            </div>
            {e.note && <div style={{ fontSize:'11px', fontFamily:t.body, color:t.text3, fontStyle:'italic', marginTop:'8px' }}>"{e.note.replace(/^"/,'').replace(/"$/,'')}"</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── WAREHOUSE ─────────────────────────────────────────────────────────────────
function WarehouseScreen({ t }) {
  const m = mono12(t);
  const lbl = { fontSize:'10px', fontWeight:'700', letterSpacing:'0.09em', textTransform:'uppercase', color:t.text3, fontFamily:t.body };
  const Pill = ({txt, isBlock}) => (
    <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:'20px', fontSize:'10px', fontWeight:'600', fontFamily:t.mono, background:isBlock?`${t.warning}18`:`${t.success}18`, color:isBlock?t.warning:t.success, border:`1px solid ${isBlock?t.warning:t.success}28`, whiteSpace:'nowrap', marginRight:'4px' }}>{txt}</span>
  );
  const beams = [
    { len:'Балка 4.30 m', qty:130, low:10, moves:[['+production +60',false],['+production +30',false],['+production +40',false]] },
    { len:'Балка 5.20 m', qty:25,  low:10, moves:[['+production +25',false]] },
    { len:'Балка 6.30 m', qty:30,  low:10, moves:[['+production +12',false],['+production +18',false]] },
  ];
  const TableHead = ({cols}) => (
    <div style={{ display:'grid', gridTemplateColumns:cols.map(c=>c.w).join(' '), padding:'9px 18px', gap:'10px', background:t.isDark?t.bgSub:t.bg, borderBottom:`1px solid ${t.border}` }}>
      {cols.map(c => <span key={c.l} style={{ ...lbl, textAlign:c.r?'right':'left' }}>{c.l}</span>)}
    </div>
  );
  return (
    <div style={{ padding:'24px' }}>
      <PageHead uz="Омбор" en="Warehouse" sub="On-hand stock, low-stock thresholds, and recent movements per SKU." t={t}/>
      {/* Stock KPI cards */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'24px' }}>
        {[
          { label:'БАЛКА · BEAMS IN STOCK', value:'185', sub:'3 SKUs', color:t.success },
          { label:'ҒИШТ · BLOCKS IN STOCK', value:'8000', sub:'1 SKU', color:t.warning },
        ].map((k,i) => (
          <div key={i} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:t.r, padding:'20px 24px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
              <div style={{ width:20, height:20, borderRadius:'4px', background:`${k.color}20`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <span style={{ fontSize:'11px', color:k.color }}>■</span>
              </div>
              <span style={{ ...lbl, color:k.color }}>{k.label}</span>
            </div>
            <div style={{ fontSize:'36px', fontWeight:'800', fontFamily:t.head, color:t.text1, letterSpacing:'-0.03em', fontVariantNumeric:'tabular-nums', lineHeight:1 }}>{k.value}</div>
            <div style={{ fontSize:'12px', fontFamily:t.body, color:t.text3, marginTop:'4px' }}>{k.sub}</div>
          </div>
        ))}
      </div>
      {/* Beams table */}
      <div style={{ marginBottom:'20px' }}>
        <div style={{ marginBottom:'10px' }}>
          <div style={{ fontSize:'14px', fontWeight:'700', color:t.text1, fontFamily:t.head }}>Балкалар · Beams</div>
          <div style={{ fontSize:'12px', color:t.text3, fontFamily:t.body }}>One row per manufactured length</div>
        </div>
        <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:t.r, overflow:'hidden' }}>
          <TableHead cols={[{l:'LENGTH',w:'200px'},{l:'QTY',w:'100px',r:true},{l:'LOW-STOCK AT',w:'130px',r:true},{l:'RECENT MOVEMENTS',w:'1fr'}]}/>
          {beams.map((b,i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'200px 100px 130px 1fr', padding:'12px 18px', gap:'10px', alignItems:'center', borderBottom:i<beams.length-1?`1px solid ${t.border}`:'none', background:b.qty<=b.low?`${t.danger}08`:i%2===0?t.surface:(t.isDark?`${t.bgSub}70`:`${t.bg}80`) }}>
              <span style={{ fontSize:'13px', fontFamily:t.body, color:t.text1, fontWeight:'600' }}>{b.len}</span>
              <span style={{ ...m, fontWeight:'700', textAlign:'right', display:'block', color:b.qty<=b.low?t.danger:t.text1 }}>{b.qty}</span>
              <span style={{ ...m, textAlign:'right', display:'block', color:t.text3 }}>{b.low}</span>
              <div>{b.moves.map(([txt,isBlock],j)=><Pill key={j} txt={txt} isBlock={isBlock}/>)}</div>
            </div>
          ))}
        </div>
      </div>
      {/* Blocks table */}
      <div>
        <div style={{ marginBottom:'10px' }}>
          <div style={{ fontSize:'14px', fontWeight:'700', color:t.text1, fontFamily:t.head }}>Ғиштлар · Blocks</div>
          <div style={{ fontSize:'12px', color:t.text3, fontFamily:t.body }}>Single SKU</div>
        </div>
        <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:t.r, overflow:'hidden' }}>
          <TableHead cols={[{l:'ITEM',w:'200px'},{l:'QTY',w:'100px',r:true},{l:'LOW-STOCK AT',w:'130px',r:true},{l:'RECENT MOVEMENTS',w:'1fr'}]}/>
          <div style={{ display:'grid', gridTemplateColumns:'200px 100px 130px 1fr', padding:'12px 18px', gap:'10px', alignItems:'center' }}>
            <span style={{ fontSize:'13px', fontFamily:t.body, color:t.text1, fontWeight:'600' }}>Ғишт · Block</span>
            <span style={{ ...m, fontWeight:'800', textAlign:'right', display:'block' }}>8000</span>
            <span style={{ ...m, textAlign:'right', display:'block', color:t.text3 }}>10</span>
            <div>{[['+production +6000',true],['+production +800',true],['+production +1200',true]].map(([txt,ib],j)=><Pill key={j} txt={txt} isBlock={ib}/>)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SANDBOX / TAPERED ─────────────────────────────────────────────────────────
function SandboxScreen({ t }) {
  const [viewMode, setViewMode] = React.useState('perRow');
  const m = mono12(t);
  const lbl = { fontSize:'10px', fontWeight:'700', letterSpacing:'0.09em', textTransform:'uppercase', color:t.text3, fontFamily:t.body };
  const results = { w1:'4 m', w2:'5 m', len:'1.5 m', spacing:'0.58 m', dw:'1.000 m', cm:'66.67 cm/m', cr:'38.67 cm/row', pitches:2, beams:3, lEff:'1.500 m', lCov:'1.160 m', severity:'extreme' };
  const rows = [{row:'#1',iw:'4.000',beam:'4.300',blocks:20},{row:'#2',iw:'4.500',beam:'4.800',blocks:23},{row:'#3',iw:'5.000',beam:'5.300',blocks:25}];
  const InfoPanel = ({n,title,children}) => (
    <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:t.r, padding:'18px', marginBottom:'14px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'14px' }}>
        <span style={{ fontSize:'11px', fontWeight:'700', fontFamily:t.mono, color:t.accent, letterSpacing:'0.06em' }}>{n}.</span>
        <span style={{ fontSize:'12px', fontWeight:'700', letterSpacing:'0.08em', textTransform:'uppercase', color:t.text1, fontFamily:t.body }}>{title}</span>
      </div>
      {children}
    </div>
  );
  const KV = ({k,v,accent}) => (
    <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
      <span style={{ fontSize:'9px', fontWeight:'700', letterSpacing:'0.10em', textTransform:'uppercase', color:t.text3, fontFamily:t.body }}>{k}</span>
      <span style={{ fontSize:'14px', fontWeight:'700', fontFamily:t.mono, color:accent?t.accent:t.text1 }}>{v}</span>
    </div>
  );
  return (
    <div style={{ padding:'24px' }}>
      <PageHead uz="Қиялашган плита" en="Tapered Beam-and-Block" sub="Trapezoidal and irregular-quadrilateral slab calculator. See SPEC.md (in the sandbox folder) for the canonical math; results follow the §9 report layout." t={t}/>
      <div style={{ display:'grid', gridTemplateColumns:'420px 1fr', gap:'20px', alignItems:'start' }}>
        {/* Left: inputs */}
        <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:t.r, padding:'20px' }}>
          <div style={{ fontSize:'13px', fontWeight:'700', color:t.text1, fontFamily:t.head, marginBottom:'16px' }}>Кирувчи маълумотлар · Inputs</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px', marginBottom:'14px' }}>
            {[['WIDTH 1 (M)','4'],['WIDTH 2 (M)','5'],['LENGTH (M)','1.5']].map(([l,v]) => (
              <div key={l}><div style={{ ...lbl, marginBottom:'5px' }}>{l}</div>
                <div style={{ border:`1px solid ${t.border}`, borderRadius:t.rXs, padding:'8px 12px', fontFamily:t.mono, fontSize:'13px', color:t.text1, background:t.isDark?`${t.warning}10`:t.bg }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'14px', padding:'10px 14px', border:`1px solid ${t.border}`, borderRadius:t.rXs }}>
            <div style={{ width:15, height:15, borderRadius:'3px', border:`1.5px solid ${t.border}` }}/>
            <span style={{ fontSize:'12px', fontFamily:t.body, color:t.text2 }}>Тўғри тўртбурчак эмас? · Irregular quadrilateral?</span>
          </div>
          <div style={{ marginBottom:'16px' }}>
            <div style={{ ...lbl, marginBottom:'5px' }}>BEAM SPACING (M)</div>
            <div style={{ border:`1px solid ${t.border}`, borderRadius:t.rXs, padding:'8px 12px', fontFamily:t.mono, fontSize:'13px', color:t.text1, background:t.isDark?`${t.warning}10`:t.bg }}>0.58</div>
          </div>
          <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
            <button style={{ padding:'9px 20px', background:t.accent, color:'#fff', border:'none', borderRadius:t.rSm, cursor:'pointer', fontSize:'13px', fontFamily:t.body, fontWeight:'700' }}>Ҳисоблаш · Calculate</button>
            <div style={{ border:`1px solid ${t.border}`, borderRadius:t.rSm, padding:'9px 14px', fontSize:'12px', fontFamily:t.body, color:t.text2, display:'flex', alignItems:'center', gap:'6px', cursor:'pointer' }}>
              Show worked example <span>▾</span>
            </div>
          </div>
        </div>
        {/* Right: results */}
        <div>
          <InfoPanel n="1" title="КИРИШ · INPUT">
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'14px' }}>
              <KV k="WIDTH 1" v={results.w1}/><KV k="WIDTH 2" v={results.w2}/><KV k="LENGTH" v={results.len}/><KV k="SPACING" v={results.spacing}/>
            </div>
          </InfoPanel>
          <InfoPanel n="2" title="ГЕОМЕТРИЯ · GEOMETRY">
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'14px', marginBottom:'10px' }}>
              <KV k="ΔW" v={results.dw}/><KV k="C_M (PER METRE)" v={results.cm}/><KV k="C_R (PER ROW)" v={results.cr}/><KV k="PITCHES" v={results.pitches}/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'14px' }}>
              <KV k="BEAMS" v={results.beams}/><KV k="L_EFFECTIVE" v={results.lEff}/><KV k="L_COVERED (= PITCHES × S)" v={results.lCov}/><KV k="SEVERITY" v={results.severity}/>
            </div>
            <div style={{ marginTop:'10px', fontSize:'11px', fontFamily:t.body, color:t.text3, fontStyle:'italic' }}>No bump: R ≤ 0.45 m; the slab edge is absorbed by edge compensation rather than extending the covered length.</div>
          </InfoPanel>
          <InfoPanel n="3" title="СТРАТЕГИЯ · BEAM STRATEGY">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'14px' }}>
              <div style={{ display:'flex', gap:'0', border:`1px solid ${t.border}`, borderRadius:t.rXs, overflow:'hidden' }}>
                {[['perRow','ҚАТОРМА-ҚАТОР · PER-ROW'],['grouped','ГУРУХЛАНГАН · GROUPED']].map(([v,l]) => (
                  <button key={v} onClick={()=>setViewMode(v)} style={{ padding:'7px 14px', border:'none', cursor:'pointer', background:viewMode===v?t.text1:'transparent', color:viewMode===v?t.bg:t.text2, fontSize:'10px', fontFamily:t.body, fontWeight:'700', letterSpacing:'0.05em', transition:'all 120ms', whiteSpace:'nowrap' }}>{l}</button>
                ))}
              </div>
              <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:'20px', fontSize:'10px', fontWeight:'700', fontFamily:t.mono, background:`${t.warning}18`, color:t.warning, border:`1px solid ${t.warning}30` }}>HYBRID</span>
            </div>
            <div style={{ border:`1px solid ${t.border}`, borderRadius:t.rXs, overflow:'hidden' }}>
              <div style={{ display:'grid', gridTemplateColumns:'80px 1fr 1fr 80px', padding:'8px 14px', gap:'10px', background:t.isDark?t.bgSub:t.bg, borderBottom:`1px solid ${t.border}` }}>
                {['ROW','INNER W (M)','BEAM (M)','BLOCKS'].map(h=><span key={h} style={{ ...lbl, textAlign:'center' }}>{h}</span>)}
              </div>
              {rows.map((r,i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'80px 1fr 1fr 80px', padding:'11px 14px', gap:'10px', alignItems:'center', borderBottom:i<rows.length-1?`1px solid ${t.border}`:'none' }}>
                  <span style={{ ...m, textAlign:'center', display:'block' }}>{r.row}</span>
                  <span style={{ ...m, color:t.accent, fontWeight:'700', textAlign:'center', display:'block' }}>{r.iw}</span>
                  <span style={{ ...m, textAlign:'center', display:'block' }}>{r.beam}</span>
                  <span style={{ ...m, textAlign:'center', display:'block' }}>{r.blocks}</span>
                </div>
              ))}
              <div style={{ display:'grid', gridTemplateColumns:'80px 1fr 1fr 80px', padding:'10px 14px', gap:'10px', borderTop:`2px solid ${t.border}`, background:`${t.accent}06` }}>
                <span style={{ ...lbl, textAlign:'center' }}>TOTAL</span>
                <span style={{ ...m, color:t.text3, textAlign:'center', display:'block' }}>3 rows</span>
                <span style={{ ...m, fontWeight:'700', textAlign:'center', display:'block' }}>14.40 m</span>
                <span style={{ ...m, fontWeight:'700', textAlign:'center', display:'block' }}>68</span>
              </div>
            </div>
            <div style={{ marginTop:'12px', fontSize:'11px', fontFamily:t.body, color:t.text3, lineHeight:1.7 }}>
              <div style={{ marginBottom:'4px', fontStyle:'italic' }}>Хар бир қатор учун аниқ ўлчам — бизнинг 65 m бэддан кесиб тайёрлаймиз. · Per-row exact widths — cut to order from our 65 m prestressing bed.</div>
              {['Minimise stopper adjustments on the prestressing bed.','Minimise prestressing interruptions.','SKU count: 2.'].map((li,i)=><div key={i} style={{ display:'flex', gap:'6px' }}><span>•</span><span>{li}</span></div>)}
              <div style={{ color:t.warning }}>• Hybrid: beams cover 3 of 3 beams; remainder is monolithic.</div>
            </div>
            <div style={{ marginTop:'14px', display:'flex', justifyContent:'flex-end' }}>
              <button style={{ display:'inline-flex', alignItems:'center', gap:'8px', padding:'9px 20px', background:t.emerald, color:'#fff', border:'none', borderRadius:t.rSm, cursor:'pointer', fontSize:'12px', fontFamily:t.body, fontWeight:'700' }}>
                ✦ Калькуляторга юбориш · Send to calculator
              </button>
            </div>
          </InfoPanel>
        </div>
      </div>
    </div>
  );
}

// ── USERS ─────────────────────────────────────────────────────────────────────
function UsersScreen({ t }) {
  const m = mono12(t);
  const data = [
    { id:'1', name:'Aziz Dadabaev', you:true,  email:'owner@precast.local',     tpl:'Эгаси · Owner',            tplCustom:false, perms:32, active:true,  last:'11 May 2026' },
    { id:'2', name:'Owner Two',     you:false, email:'owner2@precast.local',    tpl:'Эгаси · Owner',            tplCustom:false, perms:32, active:true,  last:'—' },
    { id:'3', name:'Admin',         you:false, email:'admin@precast.local',     tpl:'Администратор · Admin',    tplCustom:false, perms:30, active:true,  last:'—' },
    { id:'4', name:'Sales Manager', you:false, email:'sales@precast.local',     tpl:'Сотув · Sales',            tplCustom:true,  perms:19, active:true,  last:'11 May 2026' },
    { id:'5', name:'Driver Demo',   you:false, email:'driver@precast.local',    tpl:'Хайдовчи · Driver',        tplCustom:true,  perms:2,  active:true,  last:'—' },
    { id:'6', name:'Gh',            you:false, email:'adadabaev98@gmail.com',   tpl:'Сотув · Sales',            tplCustom:false, perms:11, active:false, last:'—' },
    { id:'7', name:'Dilmurod',      you:false, email:'dilmurod@precast.local',  tpl:'Омбор · Inventory',        tplCustom:true,  perms:6,  active:false, last:'11 May 2026' },
    { id:'8', name:'Inventory Manager',you:false,email:'inventory@precast.local',tpl:'Омбор · Inventory',      tplCustom:false, perms:6,  active:false, last:'—' },
    { id:'9', name:'Accountant',    you:false, email:'accountant@precast.local',tpl:'Бухгалтер · Accountant',  tplCustom:false, perms:9,  active:false, last:'—' },
  ];
  const cols = [
    { k:'name',  l:'ИСМ · NAME',                w:'200px' },
    { k:'email', l:'EMAIL',                     w:'220px' },
    { k:'tpl',   l:'ШАБЛОН · TEMPLATE',         w:'200px' },
    { k:'perms', l:'РУХСАТЛАР · PERMS',         w:'120px', r:true },
    { k:'status',l:'ҲОЛАТИ · STATUS',           w:'150px' },
    { k:'last',  l:'ОХИРГИ КИРИШ · LAST LOGIN', w:'160px' },
    { k:'action',l:'',                          w:'80px'  },
  ];
  const rows = data.map(d => ({
    __k:d.id,
    name: <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
      <span style={{ fontSize:'13px', fontFamily:t.body, fontWeight:'600', color:d.active?t.text1:t.text3 }}>{d.name}</span>
      {d.you && <span style={{ fontSize:'10px', fontFamily:t.mono, color:t.accent, background:`${t.accent}14`, padding:'1px 6px', borderRadius:'4px' }}>(you)</span>}
    </div>,
    email: <span style={{ fontSize:'12px', fontFamily:t.mono, color:d.active?t.text2:t.text3 }}>{d.email}</span>,
    tpl: <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
      <span style={{ fontSize:'12px', fontFamily:t.body, color:d.active?t.text2:t.text3 }}>{d.tpl}</span>
      {d.tplCustom && <span style={{ fontSize:'10px', fontFamily:t.mono, color:t.warning, background:`${t.warning}14`, padding:'1px 6px', borderRadius:'4px' }}>✏ Максус</span>}
    </div>,
    perms: <span style={{ ...m, textAlign:'right', display:'block', color:d.active?t.text1:t.text3, fontWeight:'600' }}>{d.perms}</span>,
    status: d.active
      ? <span style={{ display:'inline-flex', padding:'3px 10px', borderRadius:'20px', fontSize:'10px', fontWeight:'700', fontFamily:t.mono, background:`${t.success}18`, color:t.success, border:`1px solid ${t.success}30` }}>Фаол · Active</span>
      : <span style={{ display:'inline-flex', padding:'3px 10px', borderRadius:'20px', fontSize:'10px', fontWeight:'700', fontFamily:t.mono, background:t.bgSub, color:t.text3, border:`1px solid ${t.border}` }}>Ўчирилган · Disabled</span>,
    last: <span style={{ fontSize:'11px', fontFamily:t.mono, color:d.last==='—'?t.text3:t.text2 }}>{d.last}</span>,
    action: <button style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'6px 12px', background:'transparent', border:`1px solid ${t.border}`, borderRadius:t.rXs, cursor:'pointer', fontSize:'11px', fontFamily:t.body, color:t.text2 }}>✏ Edit</button>,
  }));
  return (
    <div style={{ padding:'24px' }}>
      <PageHead uz="Фойдаланувчилар" en="Users" sub="Ходимларни қўшинг, рухсатларни мослаштиринг ва ҳисобларни ўчиринг · Add staff, customize permissions, disable accounts." t={t}
        right={<Btn icon="plus" t={t} small>+ Янги фойдаланувчи · Add user</Btn>}/>
      <DataTable cols={cols} rows={rows} t={t}/>
    </div>
  );
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function LoginScreen({ t }) {
  const [email, setEmail] = React.useState('');
  const [pass, setPass] = React.useState('');
  const inputStyle = {
    width:'100%', padding:'10px 14px',
    border:`1px solid ${t.border}`, borderRadius:t.rSm,
    background:t.isDark?t.surface:t.bg, color:t.text1,
    fontSize:'13px', fontFamily:t.body, outline:'none',
    boxSizing:'border-box', transition:'border-color 150ms',
  };
  return (
    <div style={{ minHeight:'100vh', background:t.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:t.body }}>
      <div style={{
        width:420, background:t.surface,
        border:`1px solid ${t.border}`, borderRadius:'12px',
        padding:'40px 40px 32px', boxShadow:`0 8px 40px rgba(0,0,0,${t.isDark?'0.5':'0.08'})`,
      }}>
        {/* Logo */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:'28px' }}>
          <div style={{ width:52, height:52, borderRadius:'12px', background:t.accent, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'14px' }}>
            <svg width="28" height="28" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="2" width="6" height="6" rx="1.5" fill="white"/>
              <rect x="10" y="2" width="6" height="6" rx="1.5" fill="white" fillOpacity=".5"/>
              <rect x="2" y="10" width="6" height="6" rx="1.5" fill="white" fillOpacity=".5"/>
              <rect x="10" y="10" width="6" height="6" rx="1.5" fill="white"/>
            </svg>
          </div>
          <h1 style={{ fontSize:'20px', fontWeight:'800', letterSpacing:'-0.02em', color:t.text1, fontFamily:t.head, margin:'0 0 4px' }}>EtalonSlabs</h1>
          <p style={{ fontSize:'13px', color:t.text3, margin:0 }}>Sign in to your account</p>
        </div>
        {/* Form */}
        <div style={{ display:'flex', flexDirection:'column', gap:'16px', marginBottom:'20px' }}>
          <div>
            <label style={{ fontSize:'12px', fontWeight:'600', color:t.text2, display:'block', marginBottom:'6px', fontFamily:t.body }}>Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
              style={inputStyle} placeholder="admin@etalon.local"
              onFocus={e=>e.target.style.borderColor=t.accent}
              onBlur={e=>e.target.style.borderColor=t.border}
            />
          </div>
          <div>
            <label style={{ fontSize:'12px', fontWeight:'600', color:t.text2, display:'block', marginBottom:'6px', fontFamily:t.body }}>Password</label>
            <input type="password" value={pass} onChange={e=>setPass(e.target.value)}
              style={inputStyle} placeholder="••••••••"
              onFocus={e=>e.target.style.borderColor=t.accent}
              onBlur={e=>e.target.style.borderColor=t.border}
            />
          </div>
        </div>
        <button style={{
          width:'100%', padding:'12px',
          background:t.accent, color:'#fff', border:'none',
          borderRadius:t.rSm, cursor:'pointer',
          fontSize:'14px', fontFamily:t.body, fontWeight:'700',
          letterSpacing:'0.02em', transition:'background 120ms',
          marginBottom:'16px',
        }}
        onMouseEnter={e=>e.currentTarget.style.background=t.accentHover}
        onMouseLeave={e=>e.currentTarget.style.background=t.accent}
        >Sign in</button>
        <p style={{ fontSize:'12px', color:t.text3, textAlign:'center', margin:0, fontFamily:t.mono }}>
          Default seed: <span style={{ color:t.accent }}>admin@precast.local</span> / <span style={{ color:t.accent }}>admin123</span>
        </p>
      </div>
    </div>
  );
}

Object.assign(window, { ProjectsScreen, PaymentsScreen, DiscrepanciesScreen, ClientsScreen, DriversScreen, ProductionScreen, WarehouseScreen, SandboxScreen, UsersScreen, LoginScreen });
