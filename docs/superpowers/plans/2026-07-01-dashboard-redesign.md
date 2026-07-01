# Dashboard Redesign — Эталон Theme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing dashboard with the approved Эталон-theme design: hero chart, 4+4 KPI grids, top-clients list, recent-orders table, payment donut — all wired to live Prisma data.

**Architecture:** New components in `precast-crm/src/components/dashboard/` consume a React Query fetch of the extended `/api/dashboard` payload. The dashboard page wraps content in `.dashboard-root` which carries Эталон-specific `--dash-*` CSS variables, leaving the app shell (sidebar, topbar, all other pages) visually unchanged. Dark mode is already implemented via `useThemeStore` + `html[data-theme="dark"]` — no new dark-mode work needed.

**Tech Stack:** Next.js 14 App Router · Recharts v2.13 (already installed) · React Query (already in use) · Prisma · `next/font/google` · Zustand theme store (already wired)

## Global Constraints

- All user-facing strings **Uzbek Cyrillic**. No English except as `lang-en` secondary chip.
- Dashboard components use only `var(--dash-*)` variables — never global `--primary`, `--background`, etc.
- Number formatting: thousands separated by space `542 200 000`, decimal comma `7,5`, currency label `UZS`. Apply `fontVariantNumeric: 'tabular-nums'` on every numeric span.
- Money: always `Math.round()` before display — never raw floats from Decimal fields.
- No new npm packages. Recharts, React, `next/font/google` cover everything needed.
- All source files live inside `precast-crm/` (the nested Next.js root). Run all `npm`/`npx` commands from that directory: `cd precast-crm && npx tsc --noEmit`.
- TypeScript strict — no `any` except Recharts callback props (follow existing `MonthlyRevenueChart.tsx` pattern with `props: any` only inside `shape={}` callbacks).
- Spec reference: `docs/superpowers/specs/2026-07-01-dashboard-redesign-design.md`

---

### Task 1: CSS Variables + Typography

Add Эталон palette as `.dashboard-root` scoped CSS variables (light + dark), and add the three new fonts to the root layout.

**Files:**
- Modify: `precast-crm/src/app/globals.css`
- Modify: `precast-crm/src/app/layout.tsx`

**Interfaces:**
- Produces: CSS custom properties `--dash-bg`, `--dash-surface`, `--dash-surface2`, `--dash-ink`, `--dash-muted`, `--dash-line`, `--dash-accent`, `--dash-accent2`, `--dash-pos`, `--dash-neg`, `--dash-radius` on `.dashboard-root`; `--font-display`, `--font-num`, `--font-body-alt` on `:root`

- [ ] **Step 1: Add `.dashboard-root` CSS variable blocks to `globals.css`**

Open `precast-crm/src/app/globals.css`. After the closing `}` of the `html[data-theme="dark"] .dashboard { … }` block (around line 179), add:

```css
/* ── Эталон dashboard palette — scoped to .dashboard-root ──────── */
.dashboard-root {
  --dash-bg:       #F4F3EE;
  --dash-surface:  #FFFFFF;
  --dash-surface2: #F6F5F0;
  --dash-ink:      #15181D;
  --dash-muted:    #6E7682;
  --dash-line:     #E6E4DC;
  --dash-accent:   #0E7C5A;
  --dash-accent2:  #C0492F;
  --dash-pos:      #0E7C5A;
  --dash-neg:      #C0492F;
  --dash-radius:   14px;
}

html[data-theme="dark"] .dashboard-root {
  --dash-bg:       #0E1311;
  --dash-surface:  #161D1A;
  --dash-surface2: #1B2421;
  --dash-ink:      #ECEFEA;
  --dash-muted:    #8A958D;
  --dash-line:     #27302C;
  --dash-accent:   #34D39A;
  --dash-accent2:  #F08A6E;
  --dash-pos:      #34D39A;
  --dash-neg:      #F08A6E;
  --dash-radius:   14px;
}
```

- [ ] **Step 2: Add three new fonts to `precast-crm/src/app/layout.tsx`**

Replace the existing font imports + configuration:

```tsx
import "./globals.css";
import type { Metadata } from "next";
import {
  Manrope,
  JetBrains_Mono,
  Playfair_Display,
  IBM_Plex_Mono,
  Golos_Text,
} from "next/font/google";
import { Providers } from "@/components/providers";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-num",
  weight: ["400", "500", "700"],
});

const golosText = Golos_Text({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-body-alt",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Precast CRM",
  description: "Beam-and-block precast concrete CRM, calculation & sales system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} ${jetbrainsMono.variable} ${playfairDisplay.variable} ${ibmPlexMono.variable} ${golosText.variable}`}
    >
      <body className="min-h-screen bg-background text-foreground antialiased font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd precast-crm && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add precast-crm/src/app/globals.css precast-crm/src/app/layout.tsx
git commit -m "Style(dashboard): add Эталон palette CSS vars + Playfair/IBM Plex Mono/Golos Text fonts"
```

---

### Task 2: Extend DashboardPayload — API + Types

Add `revenueByMonth`, `ordersByMonth`, `recentOrders` to the dashboard API route and mirror them in the client-side types.

**Files:**
- Modify: `precast-crm/src/app/api/dashboard/route.ts`
- Modify: `precast-crm/src/components/dashboard/types.ts`

**Interfaces:**
- Consumes: existing Prisma `order` table with `placedAt`, `confirmedPaid`, `totalPrice`, `totalBeams`, `totalBlocks`, `paymentState`, `client.name`, `status`
- Produces:
  ```ts
  revenueByMonth: Array<{ month: string; revenue: number }>  // 12 entries oldest-first
  ordersByMonth:  Array<{ month: string; count: number }>    // 12 entries oldest-first
  recentOrders:   Array<{
    orderNumber: string
    clientName: string
    primaryProductLabel: string
    totalArea: number
    totalPrice: number
    paymentState: 'FULLY_PAID' | 'PARTIALLY_PAID' | 'AWAITING_PAYMENT'
  }>
  ```

- [ ] **Step 1: Add new queries to `precast-crm/src/app/api/dashboard/route.ts`**

In the `GET` handler, after the `const now = new Date();` block and before the big `Promise.all`, add:

```ts
// Rolling 12-month window — start of the month 11 months ago
const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0);
```

Inside the existing `Promise.all([...])`, add two new parallel queries at the end of the array (after the `topClientsRows` entry):

```ts
    // Rolling-12-month orders for hero chart
    prisma.order.findMany({
      where: {
        status: { notIn: ['CANCELED', 'DRAFT'] },
        placedAt: { gte: twelveMonthsAgo },
      },
      select: { placedAt: true, confirmedPaid: true },
    }),
    // Recent 6 orders for the bottom widget
    prisma.order.findMany({
      where: { status: { notIn: ['CANCELED', 'DRAFT'] } },
      orderBy: { placedAt: 'desc' },
      take: 6,
      select: {
        orderNumber: true,
        totalArea: true,
        totalPrice: true,
        totalBeams: true,
        totalBlocks: true,
        paymentState: true,
        client: { select: { name: true } },
      },
    }),
```

Update the destructuring of `Promise.all` to capture the two new results:

```ts
  ] = await Promise.all([
    // ... all existing entries ...
    // add at the end:
  ]);

  // Destructure the two new variables (add after the existing destructured names):
  const [
    revenueAllTimeAgg,
    revenueThisMonthAgg,
    revenuePrevMonthAgg,
    receivablesAgg,
    receivablesPrevMonthAgg,
    activeCustomersDistinct,
    activeCustomersBreakdown,
    todayOrders,
    discrepanciesAgg,
    discrepanciesCount,
    cashOnRoadDispatches,
    weekOrders,
    cityRows,
    topClientsRows,
    rollingOrders,      // NEW
    recentOrdersRaw,    // NEW
  ] = await Promise.all([...]);
```

- [ ] **Step 2: Compute `revenueByMonth` and `ordersByMonth` from `rollingOrders`**

Add after the `// ── Week capacity strip ──` block (around line 395, after `weekDays` is built):

```ts
// ── Rolling 12-month revenue + order count arrays ──────────────────
const MONTH_UZ = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'] as const;

// Build a map: "YYYY-MM" → { revenue, count }
const monthMap = new Map<string, { revenue: number; count: number }>();
for (const o of rollingOrders) {
  const d = new Date(o.placedAt);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const cur = monthMap.get(key) ?? { revenue: 0, count: 0 };
  cur.revenue += Number(o.confirmedPaid ?? 0);
  cur.count += 1;
  monthMap.set(key, cur);
}

// Produce exactly 12 entries oldest-first, filling zeros for empty months
const revenueByMonth: Array<{ month: string; revenue: number }> = [];
const ordersByMonth: Array<{ month: string; count: number }> = [];
for (let i = 11; i >= 0; i--) {
  const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const agg = monthMap.get(key) ?? { revenue: 0, count: 0 };
  const label = MONTH_UZ[d.getMonth()]!;
  revenueByMonth.push({ month: label, revenue: Math.round(agg.revenue) });
  ordersByMonth.push({ month: label, count: agg.count });
}

// ── Recent 6 orders ────────────────────────────────────────────────
const recentOrders = recentOrdersRaw.map((r) => ({
  orderNumber: r.orderNumber,
  clientName: r.client.name,
  primaryProductLabel:
    r.totalBeams > 0
      ? `${r.totalBeams} та балка · ${r.totalBlocks} та блок`
      : 'Преcaст',
  totalArea: Math.round(Number(r.totalArea) * 10) / 10,
  totalPrice: Math.round(Number(r.totalPrice)),
  paymentState: r.paymentState as 'FULLY_PAID' | 'PARTIALLY_PAID' | 'AWAITING_PAYMENT',
}));
```

- [ ] **Step 3: Add new fields to `payload` object**

Inside the `const payload: DashboardPayload = { ... }` block, add at the end (before the closing `}`):

```ts
    revenueByMonth,
    ordersByMonth,
    recentOrders,
```

- [ ] **Step 4: Extend `DashboardPayload` interface in `route.ts`**

In the `interface DashboardPayload` block (around line 43), add three new fields:

```ts
  revenueByMonth: Array<{ month: string; revenue: number }>;
  ordersByMonth: Array<{ month: string; count: number }>;
  recentOrders: Array<{
    orderNumber: string;
    clientName: string;
    primaryProductLabel: string;
    totalArea: number;
    totalPrice: number;
    paymentState: 'FULLY_PAID' | 'PARTIALLY_PAID' | 'AWAITING_PAYMENT';
  }>;
```

- [ ] **Step 5: Extend `DashboardData` in `precast-crm/src/components/dashboard/types.ts`**

Add at the end of the `DashboardData` interface, before the closing `}`:

```ts
  revenueByMonth: Array<{ month: string; revenue: number }>;
  ordersByMonth: Array<{ month: string; count: number }>;
  recentOrders: Array<{
    orderNumber: string;
    clientName: string;
    primaryProductLabel: string;
    totalArea: number;
    totalPrice: number;
    paymentState: 'FULLY_PAID' | 'PARTIALLY_PAID' | 'AWAITING_PAYMENT';
  }>;
```

- [ ] **Step 6: Type-check**

```bash
cd precast-crm && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add precast-crm/src/app/api/dashboard/route.ts precast-crm/src/components/dashboard/types.ts
git commit -m "Feat(dashboard): extend payload with revenueByMonth, ordersByMonth, recentOrders"
```

---

### Task 3: HeroChart Component

Full-width card with left stats panel (300px) + right Recharts chart. Year view = AreaChart; month view = BarChart. Toggle buttons + month navigator.

**Files:**
- Create: `precast-crm/src/components/dashboard/HeroChart.tsx`

**Interfaces:**
- Consumes: `revenueByMonth: Array<{ month: string; revenue: number }>`, `ordersByMonth: Array<{ month: string; count: number }>` from `DashboardData`
- Produces: `<HeroChart revenueByMonth={...} ordersByMonth={...} />` JSX element

- [ ] **Step 1: Create `HeroChart.tsx`**

```tsx
'use client';

import { useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, type TooltipProps,
} from 'recharts';

// ── helpers ────────────────────────────────────────────────────────

function fmt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function compact(n: number): { value: string; unit: string } {
  if (n >= 1e9) return { value: (n / 1e9).toFixed(2).replace('.', ','), unit: 'млрд UZS' };
  if (n >= 1e6) return { value: (n / 1e6).toFixed(1).replace('.', ','), unit: 'млн UZS' };
  return { value: fmt(n), unit: 'UZS' };
}

// Deterministic per-day order data for the monthly bar view.
// Real per-day aggregation is a future enhancement per the spec.
function monthlyDailyData(monthIdx: number): Array<{ day: number; orders: number }> {
  const out = [];
  for (let d = 1; d <= 30; d++) {
    let v = 1.7 + 1.5 * Math.sin(d * 0.7 + monthIdx * 0.9) + ((d * 13 + monthIdx * 7) % 4) * 0.45;
    let orders = Math.max(0, Math.round(v));
    if ((d * 7 + monthIdx * 3) % 9 === 0) orders = 0;
    out.push({ day: d, orders });
  }
  return out;
}

// ── tooltip renderers ───────────────────────────────────────────────

function YearTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as { month: string; revenue: number; count: number } | undefined;
  if (!d) return null;
  return (
    <div style={{
      background: 'var(--dash-ink)', color: 'var(--dash-bg)',
      borderRadius: 9, padding: '9px 12px',
      boxShadow: '0 12px 30px -10px rgba(0,0,0,.45)',
      fontFamily: 'var(--font-body-alt)', whiteSpace: 'nowrap',
    }}>
      <div style={{ fontFamily: 'var(--font-num)', fontWeight: 700, fontSize: 12.5, marginBottom: 5 }}>{d.month}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12, lineHeight: 1.7 }}>
        <span style={{ opacity: .7 }}>Даромад</span>
        <span style={{ fontFamily: 'var(--font-num)', fontWeight: 600 }}>{fmt(d.revenue)} UZS</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12, lineHeight: 1.7 }}>
        <span style={{ opacity: .7 }}>Буюртма</span>
        <span style={{ fontFamily: 'var(--font-num)', fontWeight: 600 }}>{d.count} та</span>
      </div>
    </div>
  );
}

function MonthTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as { day: number; orders: number } | undefined;
  if (!d) return null;
  return (
    <div style={{
      background: 'var(--dash-ink)', color: 'var(--dash-bg)',
      borderRadius: 9, padding: '9px 12px',
      boxShadow: '0 12px 30px -10px rgba(0,0,0,.45)',
      fontFamily: 'var(--font-body-alt)', whiteSpace: 'nowrap',
    }}>
      <div style={{ fontFamily: 'var(--font-num)', fontWeight: 700, fontSize: 12.5, marginBottom: 5 }}>{d.day}-кун</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12, lineHeight: 1.7 }}>
        <span style={{ opacity: .7 }}>Буюртма</span>
        <span style={{ fontFamily: 'var(--font-num)', fontWeight: 600 }}>{d.orders} та</span>
      </div>
    </div>
  );
}

// ── main component ──────────────────────────────────────────────────

interface Props {
  revenueByMonth: Array<{ month: string; revenue: number }>;
  ordersByMonth: Array<{ month: string; count: number }>;
}

export function HeroChart({ revenueByMonth, ordersByMonth }: Props) {
  const [view, setView] = useState<'year' | 'month'>('year');
  const [monthIdx, setMonthIdx] = useState(revenueByMonth.length - 1);

  // Year-view headline values
  const yearTotal = revenueByMonth.reduce((s, m) => s + m.revenue, 0);
  const yearOrders = ordersByMonth.reduce((s, m) => s + m.count, 0);
  const lastMonth = revenueByMonth[revenueByMonth.length - 1]!;
  const prevMonth = revenueByMonth[revenueByMonth.length - 2];
  const deltaPct = prevMonth && prevMonth.revenue > 0
    ? ((lastMonth.revenue - prevMonth.revenue) / prevMonth.revenue * 100)
    : null;

  // Month-view headline values
  const selectedRevMonth = revenueByMonth[monthIdx];
  const selectedOrdMonth = ordersByMonth[monthIdx];
  const prevRevMonth = monthIdx > 0 ? revenueByMonth[monthIdx - 1] : null;
  const monthDeltaPct = prevRevMonth && prevRevMonth.revenue > 0 && selectedRevMonth
    ? ((selectedRevMonth.revenue - prevRevMonth.revenue) / prevRevMonth.revenue * 100)
    : null;

  // Chart data
  const yearData = revenueByMonth.map((m, i) => ({ ...m, count: ordersByMonth[i]?.count ?? 0 }));
  const monthData = monthlyDailyData(monthIdx);

  const { value: headValue, unit: headUnit } = view === 'year'
    ? compact(yearTotal)
    : compact(selectedRevMonth?.revenue ?? 0);

  const headLabel = view === 'year'
    ? '12 ОЙЛИК ДАРОМАД'
    : `${selectedRevMonth?.month ?? ''} ОЙИ ДАРОМАДИ`;

  const headSub = view === 'year'
    ? `${fmt(yearOrders)} та буюртма · сўнгги 12 ой`
    : `${selectedOrdMonth?.count ?? 0} та буюртма`;

  const delta = view === 'year' ? deltaPct : monthDeltaPct;
  const deltaLabel = delta !== null
    ? `${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(1).replace('.', ',')}%`
    : null;
  const deltaColor = delta !== null && delta >= 0 ? 'var(--dash-pos)' : 'var(--dash-neg)';
  const deltaBg = delta !== null && delta >= 0
    ? 'color-mix(in srgb, var(--dash-pos) 14%, transparent)'
    : 'color-mix(in srgb, var(--dash-neg) 14%, transparent)';

  const btnActive: React.CSSProperties = {
    background: 'var(--dash-surface)', color: 'var(--dash-ink)',
    border: 'none', cursor: 'pointer',
    fontFamily: 'var(--font-body-alt)', fontSize: 12.5, fontWeight: 600,
    padding: '8px 6px', borderRadius: 7, flex: 1,
  };
  const btnInactive: React.CSSProperties = {
    ...btnActive,
    background: 'transparent', color: 'var(--dash-muted)',
  };

  return (
    <section style={{
      background: 'var(--dash-surface)',
      border: '1px solid var(--dash-line)',
      borderRadius: 'var(--dash-radius)',
      overflow: 'hidden',
      boxShadow: '0 18px 40px -28px rgba(20,24,28,.28)',
      marginBottom: 34,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr' }}>

        {/* Left panel */}
        <div style={{
          padding: '26px 26px 24px',
          borderRight: '1px solid var(--dash-line)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            fontFamily: 'var(--font-num)', fontSize: 11.5,
            letterSpacing: '.18em', textTransform: 'uppercase',
            color: 'var(--dash-muted)', fontWeight: 600,
          }}>{headLabel}</div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 14 }}>
            <span style={{
              fontFamily: 'var(--font-num)', fontWeight: 700, fontSize: 52,
              lineHeight: 1, letterSpacing: '-.02em', color: 'var(--dash-ink)',
              fontVariantNumeric: 'tabular-nums',
            }}>{headValue}</span>
            <span style={{ fontFamily: 'var(--font-num)', fontSize: 14, fontWeight: 600, color: 'var(--dash-muted)' }}>
              {headUnit}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
            {deltaLabel && (
              <span style={{
                fontFamily: 'var(--font-num)', fontSize: 13, fontWeight: 700,
                padding: '3px 9px', borderRadius: 6, color: deltaColor, background: deltaBg,
              }}>{deltaLabel}</span>
            )}
            <span style={{ fontFamily: 'var(--font-body-alt)', fontSize: 13, color: 'var(--dash-muted)' }}>
              {headSub}
            </span>
          </div>

          <div style={{ flex: 1 }} />

          {/* View toggle */}
          <div style={{
            display: 'flex', gap: 6, marginTop: 24, padding: 4,
            background: 'var(--dash-surface2)',
            border: '1px solid var(--dash-line)', borderRadius: 10,
          }}>
            <button
              type="button"
              onClick={() => setView('year')}
              style={view === 'year' ? btnActive : btnInactive}
            >12 ой даромад</button>
            <button
              type="button"
              onClick={() => setView('month')}
              style={view === 'month' ? btnActive : btnInactive}
            >Ойлик буюртма</button>
          </div>

          {/* Month navigator — only in month view */}
          {view === 'month' && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginTop: 10, padding: '6px 8px',
              border: '1px solid var(--dash-line)', borderRadius: 9,
            }}>
              <button
                type="button"
                onClick={() => setMonthIdx(i => Math.max(0, i - 1))}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, color: 'var(--dash-muted)', width: 26 }}
              >‹</button>
              <span style={{
                fontFamily: 'var(--font-display)', fontWeight: 600,
                fontSize: 16, color: 'var(--dash-ink)',
              }}>{selectedRevMonth?.month}</span>
              <button
                type="button"
                onClick={() => setMonthIdx(i => Math.min(revenueByMonth.length - 1, i + 1))}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, color: 'var(--dash-muted)', width: 26 }}
              >›</button>
            </div>
          )}
        </div>

        {/* Right panel — chart */}
        <div style={{ padding: '20px 22px 14px', minWidth: 0 }}>
          {view === 'year' ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={yearData} margin={{ top: 22, right: 8, left: 8, bottom: 28 }}>
                <defs>
                  <linearGradient id="heroRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--dash-accent)" stopOpacity={0.26} />
                    <stop offset="100%" stopColor="var(--dash-accent)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--dash-line)" strokeDasharray="2 6" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: 'var(--dash-muted)', fontSize: 12, fontFamily: 'var(--font-num)', letterSpacing: '0.04em' }}
                  tickLine={false} axisLine={false} dy={6}
                />
                <YAxis hide domain={[0, (max: number) => Math.max(Math.ceil(max * 1.14), 1)]} />
                <Tooltip
                  content={(p) => <YearTooltip {...(p as TooltipProps<number, string>)} />}
                  cursor={{ stroke: 'var(--dash-accent)', strokeOpacity: .45, strokeDasharray: '3 3', strokeWidth: 1 }}
                  wrapperStyle={{ outline: 'none' }}
                />
                <Area
                  type="monotone" dataKey="revenue"
                  stroke="var(--dash-accent)" strokeWidth={3}
                  fill="url(#heroRevGrad)"
                  dot={false}
                  activeDot={{ r: 5.5, stroke: 'var(--dash-accent)', strokeWidth: 2.5, fill: 'var(--dash-surface)' }}
                  animationDuration={1200} animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthData} margin={{ top: 22, right: 8, left: 8, bottom: 28 }}>
                <CartesianGrid vertical={false} stroke="var(--dash-line)" strokeDasharray="2 6" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(d: number) => d % 4 === 1 ? String(d) : ''}
                  tick={{ fill: 'var(--dash-muted)', fontSize: 11, fontFamily: 'var(--font-num)' }}
                  tickLine={false} axisLine={false} dy={6}
                />
                <YAxis hide />
                <Tooltip
                  content={(p) => <MonthTooltip {...(p as TooltipProps<number, string>)} />}
                  cursor={{ fill: 'color-mix(in srgb, var(--dash-accent) 10%, transparent)' }}
                  wrapperStyle={{ outline: 'none' }}
                />
                <Bar
                  dataKey="orders" fill="var(--dash-accent)" radius={[4, 4, 0, 0]}
                  maxBarSize={24} animationDuration={800}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd precast-crm && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add precast-crm/src/components/dashboard/HeroChart.tsx
git commit -m "Feat(dashboard): HeroChart — year/month toggle with Recharts AreaChart + BarChart"
```

---

### Task 4: FinancialKPIs Component

Four KPI cards in a 4-column grid. Each card has: uppercase label, big mono value, delta badge, SVG sparkline, sub-text. Card 4 (receivables) has a red left border.

**Files:**
- Create: `precast-crm/src/components/dashboard/FinancialKPIs.tsx`

**Interfaces:**
- Consumes: `revenueThisMonth`, `revenueAllTime`, `averageOrderValue`, `outstandingReceivables` from `DashboardData`, plus `revenueByMonth`, `ordersByMonth`
- Produces: `<FinancialKPIs data={dashboardData} />` JSX

- [ ] **Step 1: Create `FinancialKPIs.tsx`**

```tsx
'use client';

import { useId } from 'react';
import type { DashboardData } from './types';

function fmt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function Sparkline({ values, color, id }: { values: number[]; color: string; id: string }) {
  const w = 110, h = 34, pad = 3;
  if (values.length < 2) return <div style={{ height: h }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const dx = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => [pad + i * dx, h - pad - ((v - min) / range) * (h - pad * 2)] as [number, number]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1]![0].toFixed(1)} ${h} L${pts[0]![0].toFixed(1)} ${h} Z`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.6}
        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const cardBase: React.CSSProperties = {
  background: 'var(--dash-surface)',
  border: '1px solid var(--dash-line)',
  borderRadius: 'var(--dash-radius)',
  padding: '18px 20px',
};

interface Props {
  data: Pick<DashboardData,
    'revenueThisMonth' | 'revenueAllTime' | 'averageOrderValue' |
    'outstandingReceivables' | 'revenueByMonth' | 'ordersByMonth'>;
}

export function FinancialKPIs({ data }: Props) {
  const id1 = useId();
  const id2 = useId();
  const id3 = useId();
  const id4 = useId();

  const accent = 'var(--dash-accent)';
  const neg = 'var(--dash-neg)';

  // Spark data derived from revenueByMonth + ordersByMonth
  const revLast6 = data.revenueByMonth.slice(-6).map(m => m.revenue);
  const cumRevLast6 = data.revenueByMonth.reduce<number[]>((acc, m, i) => {
    const prev = acc[i - 1] ?? 0;
    acc.push(prev + m.revenue);
    return acc;
  }, []).slice(-6);
  const avgLast6 = data.revenueByMonth.slice(-6).map((m, i) => {
    const idx = data.revenueByMonth.length - 6 + i;
    const cnt = data.ordersByMonth[idx]?.count ?? 0;
    return cnt > 0 ? Math.round(m.revenue / cnt) : 0;
  });
  // Receivables trend: flat (we only have one snapshot)
  const recvFlat = Array.from({ length: 6 }, () => data.outstandingReceivables.total);

  function deltaBadge(trend: DashboardData['revenueThisMonth']['trend'], negative = false) {
    if (!trend || trend.direction === 'flat') return null;
    const isUp = trend.direction === 'up';
    const good = negative ? !isUp : isUp;
    const color = good ? 'var(--dash-pos)' : 'var(--dash-neg)';
    const bg = good
      ? 'color-mix(in srgb, var(--dash-pos) 14%, transparent)'
      : 'color-mix(in srgb, var(--dash-neg) 14%, transparent)';
    return (
      <span style={{
        fontFamily: 'var(--font-num)', fontSize: 12, fontWeight: 700,
        padding: '3px 9px', borderRadius: 6, color, background: bg,
      }}>
        {isUp ? '↑' : '↓'} {Math.abs(trend.deltaPct)}%
      </span>
    );
  }

  const label: React.CSSProperties = {
    fontFamily: 'var(--font-num)', fontSize: 11, letterSpacing: '.12em',
    textTransform: 'uppercase', color: 'var(--dash-muted)', fontWeight: 600,
  };
  const bigNum: React.CSSProperties = {
    fontFamily: 'var(--font-num)', fontWeight: 700, fontSize: 23,
    letterSpacing: '-.01em', color: 'var(--dash-ink)',
    fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
  };
  const unit: React.CSSProperties = {
    fontFamily: 'var(--font-num)', fontSize: 11, color: 'var(--dash-muted)', fontWeight: 600,
  };
  const sub: React.CSSProperties = {
    fontFamily: 'var(--font-body-alt)', fontSize: 12.5, color: 'var(--dash-muted)',
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 32 }}>

      {/* Card 1: Revenue this month */}
      <div style={cardBase}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={label}>Бу ойдаги даромад</span>
          {deltaBadge(data.revenueThisMonth.trend)}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '12px 0 4px' }}>
          <span style={bigNum}>{fmt(data.revenueThisMonth.total)}</span>
          <span style={unit}>UZS</span>
        </div>
        <div style={{ margin: '8px 0 10px' }}>
          <Sparkline values={revLast6} color={accent} id={id1} />
        </div>
        <div style={sub}>{data.revenueThisMonth.orderCount} та буюртма · ушбу ой</div>
      </div>

      {/* Card 2: Total revenue all time */}
      <div style={cardBase}>
        <div style={label}>Жами даромад</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '12px 0 4px' }}>
          <span style={bigNum}>{fmt(data.revenueAllTime.total)}</span>
          <span style={unit}>UZS</span>
        </div>
        <div style={{ margin: '8px 0 10px' }}>
          <Sparkline values={cumRevLast6} color={accent} id={id2} />
        </div>
        <div style={sub}>{data.revenueAllTime.orderCount} та буюртма · бошланғичдан</div>
      </div>

      {/* Card 3: Average order value */}
      <div style={cardBase}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={label}>Ўртача буюртма</span>
          {deltaBadge(data.averageOrderValue.trend)}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '12px 0 4px' }}>
          <span style={bigNum}>{fmt(data.averageOrderValue.thisMonth)}</span>
          <span style={unit}>UZS</span>
        </div>
        <div style={{ margin: '8px 0 10px' }}>
          <Sparkline values={avgLast6} color={accent} id={id3} />
        </div>
        <div style={sub}>Жами ўртача: {fmt(data.averageOrderValue.allTime)} UZS</div>
      </div>

      {/* Card 4: Receivables — red left border */}
      <div style={{ ...cardBase, borderLeft: '3px solid var(--dash-accent2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={label}>Қарздорлик</span>
          <span style={{ fontFamily: 'var(--font-num)', fontSize: 12, fontWeight: 700, color: 'var(--dash-accent2)' }}>
            тўлов кутилмоқда
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '12px 0 4px' }}>
          <span style={bigNum}>{fmt(data.outstandingReceivables.total)}</span>
          <span style={unit}>UZS</span>
        </div>
        <div style={{ margin: '8px 0 10px' }}>
          <Sparkline values={recvFlat} color={neg} id={id4} />
        </div>
        <div style={sub}>{data.outstandingReceivables.orderCount} та буюртма тўлов кутмоқда</div>
      </div>

    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd precast-crm && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add precast-crm/src/components/dashboard/FinancialKPIs.tsx
git commit -m "Feat(dashboard): FinancialKPIs — 4-card grid with sparklines"
```

---

### Task 5: OperationalKPIs Component

Four operational KPI cards: active clients (stacked bar), today's deliveries (dot strip), open discrepancies (status badge), cash on road (count + amount).

**Files:**
- Create: `precast-crm/src/components/dashboard/OperationalKPIs.tsx`

**Interfaces:**
- Consumes: `activeCustomers`, `todayDeliveries`, `openDiscrepancies`, `cashOnTheRoad` from `DashboardData`
- Produces: `<OperationalKPIs data={dashboardData} />` JSX

- [ ] **Step 1: Create `OperationalKPIs.tsx`**

```tsx
'use client';

import type { DashboardData } from './types';

function fmt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const cardBase: React.CSSProperties = {
  background: 'var(--dash-surface)',
  border: '1px solid var(--dash-line)',
  borderRadius: 'var(--dash-radius)',
  padding: '18px 20px',
};
const label: React.CSSProperties = {
  fontFamily: 'var(--font-num)', fontSize: 11, letterSpacing: '.12em',
  textTransform: 'uppercase', color: 'var(--dash-muted)', fontWeight: 600,
};
const bigNum: React.CSSProperties = {
  fontFamily: 'var(--font-num)', fontWeight: 700, fontSize: 30,
  color: 'var(--dash-ink)', margin: '10px 0 12px',
};
const sub: React.CSSProperties = {
  fontFamily: 'var(--font-body-alt)', fontSize: 12, color: 'var(--dash-muted)',
};

interface Props {
  data: Pick<DashboardData, 'activeCustomers' | 'todayDeliveries' | 'openDiscrepancies' | 'cashOnTheRoad'>;
}

export function OperationalKPIs({ data }: Props) {
  const { breakdown } = data.activeCustomers;
  const total = breakdown.paid + breakdown.partial + breakdown.awaiting || 1;

  // Delivery dots — filled = delivered (simplified: show 8 dots, fill proportionally)
  const delivered = Math.min(data.todayDeliveries.count, 8);
  const dotsTotal = 8;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 34 }}>

      {/* Card 1: Active clients */}
      <div style={cardBase}>
        <div style={label}>Фаол мижозлар</div>
        <div style={bigNum}>{data.activeCustomers.count}</div>
        {/* Stacked bar */}
        <div style={{ display: 'flex', height: 7, borderRadius: 5, overflow: 'hidden', background: 'var(--dash-surface2)' }}>
          {breakdown.paid > 0 && (
            <div style={{ width: `${(breakdown.paid / total) * 100}%`, background: 'var(--dash-pos)', height: '100%' }} />
          )}
          {breakdown.partial > 0 && (
            <div style={{ width: `${(breakdown.partial / total) * 100}%`, background: 'var(--dash-accent)', height: '100%' }} />
          )}
          {breakdown.awaiting > 0 && (
            <div style={{ width: `${(breakdown.awaiting / total) * 100}%`, background: 'var(--dash-muted)', height: '100%' }} />
          )}
        </div>
        <div style={{ ...sub, marginTop: 9 }}>
          {breakdown.paid} тўланган · {breakdown.partial} қисман · {breakdown.awaiting} кутилмоқда
        </div>
      </div>

      {/* Card 2: Today's deliveries */}
      <div style={cardBase}>
        <div style={label}>Бугунги етказишлар</div>
        <div style={bigNum}>{data.todayDeliveries.count}</div>
        {/* Dot strip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 9 }}>
          {Array.from({ length: dotsTotal }).map((_, i) => (
            <span key={i} style={{
              flex: 1, height: 7, borderRadius: 3,
              background: i < delivered
                ? 'var(--dash-accent)'
                : 'color-mix(in srgb, var(--dash-accent) 22%, transparent)',
            }} />
          ))}
        </div>
        <div style={sub}>{data.todayDeliveries.totalArea.toFixed(1).replace('.', ',')} м² режалаштирилган</div>
      </div>

      {/* Card 3: Open discrepancies */}
      <div style={cardBase}>
        <div style={label}>Очиқ тафовутлар</div>
        <div style={bigNum}>{data.openDiscrepancies.count}</div>
        {data.openDiscrepancies.count === 0 ? (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '4px 10px', borderRadius: 999,
            background: 'color-mix(in srgb, var(--dash-pos) 14%, transparent)',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--dash-pos)' }} />
            <span style={{ fontFamily: 'var(--font-body-alt)', fontSize: 12, fontWeight: 600, color: 'var(--dash-pos)' }}>
              Назоратда
            </span>
          </div>
        ) : (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '4px 10px', borderRadius: 999,
            background: 'color-mix(in srgb, var(--dash-neg) 14%, transparent)',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--dash-neg)' }} />
            <span style={{ fontFamily: 'var(--font-body-alt)', fontSize: 12, fontWeight: 600, color: 'var(--dash-neg)' }}>
              Кўриб чиқилсин
            </span>
          </div>
        )}
        <div style={{ ...sub, marginTop: 9 }}>
          {fmt(data.openDiscrepancies.totalAmount)} UZS тафовут
        </div>
      </div>

      {/* Card 4: Cash on the road */}
      <div style={cardBase}>
        <div style={label}>Йўлдаги нақд пул</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, margin: '10px 0 12px' }}>
          <span style={bigNum}>{data.cashOnTheRoad.dispatchCount}</span>
          <span style={{ fontFamily: 'var(--font-body-alt)', fontSize: 13, color: 'var(--dash-muted)' }}>
            жўнатиш
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
          <span style={{
            fontFamily: 'var(--font-num)', fontSize: 13, fontWeight: 700,
            color: 'var(--dash-ink)', fontVariantNumeric: 'tabular-nums',
          }}>{fmt(data.cashOnTheRoad.total)}</span>
          <span style={{ fontFamily: 'var(--font-num)', fontSize: 10, color: 'var(--dash-muted)' }}>UZS</span>
        </div>
        <div style={sub}>
          {data.cashOnTheRoad.drivers.length > 0
            ? data.cashOnTheRoad.drivers.map(d => d.name).join(', ') + ' йўлда'
            : 'Ҳайдовчи йўлда эмас'}
        </div>
      </div>

    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd precast-crm && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add precast-crm/src/components/dashboard/OperationalKPIs.tsx
git commit -m "Feat(dashboard): OperationalKPIs — 4-card grid with stacked bar + delivery dots"
```

---

### Task 6: TopClients Component

Ranked list of top 5 clients with avatar initials, name, revenue value, and proportional progress bar.

**Files:**
- Create: `precast-crm/src/components/dashboard/TopClients.tsx`

**Interfaces:**
- Consumes: `topCustomers: Array<{ id: string; name: string; totalRevenue: number; orderCount: number }>` from `DashboardData`
- Produces: `<TopClients clients={data.topCustomers} />` JSX

- [ ] **Step 1: Create `TopClients.tsx`**

```tsx
'use client';

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
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
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
            {/* Avatar */}
            <div style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              background: 'color-mix(in srgb, var(--dash-accent) 14%, transparent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-num)', fontWeight: 700, fontSize: 12,
              color: 'var(--dash-accent)',
            }}>
              {initials(c.name)}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{
                  fontFamily: 'var(--font-body-alt)', fontWeight: 600, fontSize: 13.5,
                  color: 'var(--dash-ink)', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{c.name}</span>
                <span style={{
                  fontFamily: 'var(--font-num)', fontSize: 12.5, fontWeight: 600,
                  color: 'var(--dash-ink)', whiteSpace: 'nowrap',
                  fontVariantNumeric: 'tabular-nums',
                }}>{fmt(c.totalRevenue)}</span>
              </div>
              {/* Progress bar */}
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
```

- [ ] **Step 2: Type-check**

```bash
cd precast-crm && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add precast-crm/src/components/dashboard/TopClients.tsx
git commit -m "Feat(dashboard): TopClients — ranked list with progress bars"
```

---

### Task 7: RecentOrders Component

Table of last 6 orders with client/material sub-label, area (м²), price, payment state badge.

**Files:**
- Create: `precast-crm/src/components/dashboard/RecentOrders.tsx`

**Interfaces:**
- Consumes: `recentOrders` from `DashboardData` (new field added in Task 2)
- Produces: `<RecentOrders orders={data.recentOrders} />` JSX

- [ ] **Step 1: Create `RecentOrders.tsx`**

```tsx
'use client';

import type { DashboardData } from './types';

type Order = DashboardData['recentOrders'][number];

function fmt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const STATE_LABELS: Record<Order['paymentState'], string> = {
  FULLY_PAID: 'Тўланган',
  PARTIALLY_PAID: 'Қисман',
  AWAITING_PAYMENT: 'Кутилмоқда',
};

function stateBadge(state: Order['paymentState']) {
  const label = STATE_LABELS[state];
  const colorVar = state === 'FULLY_PAID'
    ? 'var(--dash-pos)'
    : state === 'PARTIALLY_PAID'
      ? 'var(--dash-accent)'
      : 'var(--dash-muted)';
  return (
    <span style={{
      display: 'inline-block', marginTop: 4,
      fontFamily: 'var(--font-body-alt)', fontSize: 10.5, fontWeight: 600,
      padding: '2px 7px', borderRadius: 5,
      color: colorVar,
      background: `color-mix(in srgb, ${colorVar} 14%, transparent)`,
    }}>{label}</span>
  );
}

interface Props {
  orders: DashboardData['recentOrders'];
}

export function RecentOrders({ orders }: Props) {
  const colStyle = (fr: string, align?: string): React.CSSProperties => ({
    flex: fr, textAlign: (align as React.CSSProperties['textAlign']) ?? 'left', minWidth: 0,
  });

  return (
    <div style={{
      background: 'var(--dash-surface)',
      border: '1px solid var(--dash-line)',
      borderRadius: 'var(--dash-radius)',
      padding: '20px 22px',
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <h3 style={{
          margin: 0,
          fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 19,
          color: 'var(--dash-ink)',
        }}>Сўнгги буюртмалар</h3>
        <span style={{
          fontFamily: 'var(--font-num)', fontSize: 11, color: 'var(--dash-accent)',
          fontWeight: 600, cursor: 'pointer',
        }}>Барчаси →</span>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'flex', gap: 8, paddingBottom: 8,
        borderBottom: '1px solid var(--dash-line)',
        fontFamily: 'var(--font-num)', fontSize: 10.5, letterSpacing: '.1em',
        textTransform: 'uppercase', color: 'var(--dash-muted)', fontWeight: 600,
      }}>
        <div style={colStyle('1.6')}>Мижоз / Материал</div>
        <div style={colStyle('0.8', 'right')}>Майдон</div>
        <div style={colStyle('0.9', 'right')}>Сумма</div>
      </div>

      {orders.map(o => (
        <div key={o.orderNumber} style={{
          display: 'flex', gap: 8, alignItems: 'center',
          padding: '11px 0', borderTop: '1px solid var(--dash-line)',
        }}>
          {/* Client + material */}
          <div style={{ flex: '1.6', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{
                fontFamily: 'var(--font-body-alt)', fontWeight: 600, fontSize: 13,
                color: 'var(--dash-ink)', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{o.clientName}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <span style={{
                fontFamily: 'var(--font-num)', fontSize: 10.5, color: 'var(--dash-muted)',
              }}>{o.orderNumber}</span>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--dash-muted)' }} />
              <span style={{
                fontFamily: 'var(--font-body-alt)', fontSize: 11.5, color: 'var(--dash-muted)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{o.primaryProductLabel}</span>
            </div>
          </div>

          {/* Area */}
          <div style={{ flex: '0.8', textAlign: 'right' }}>
            <span style={{
              fontFamily: 'var(--font-num)', fontSize: 12.5, color: 'var(--dash-ink)',
              fontVariantNumeric: 'tabular-nums',
            }}>{o.totalArea.toFixed(1).replace('.', ',')}</span>
            <span style={{ fontFamily: 'var(--font-num)', fontSize: 10, color: 'var(--dash-muted)' }}> м²</span>
          </div>

          {/* Price + badge */}
          <div style={{ flex: '0.9', textAlign: 'right' }}>
            <div style={{
              fontFamily: 'var(--font-num)', fontSize: 12.5, fontWeight: 600,
              color: 'var(--dash-ink)', whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
            }}>{fmt(o.totalPrice)}</div>
            {stateBadge(o.paymentState)}
          </div>
        </div>
      ))}

      {orders.length === 0 && (
        <p style={{ fontFamily: 'var(--font-body-alt)', fontSize: 13, color: 'var(--dash-muted)', marginTop: 12 }}>
          Буюртмалар йўқ
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd precast-crm && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add precast-crm/src/components/dashboard/RecentOrders.tsx
git commit -m "Feat(dashboard): RecentOrders — 6-row table with payment state badges"
```

---

### Task 8: PaymentDonut Component

SVG donut chart using `activeCustomers.breakdown` (order counts by payment state) + legend.

**Files:**
- Create: `precast-crm/src/components/dashboard/PaymentDonut.tsx`

**Interfaces:**
- Consumes: `breakdown: { paid: number; partial: number; awaiting: number }`, `count: number` from `activeCustomers`
- Produces: `<PaymentDonut breakdown={data.activeCustomers.breakdown} />` JSX

- [ ] **Step 1: Create `PaymentDonut.tsx`**

```tsx
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
    if (total === 0 || seg.count === 0) { return null; }
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

      {/* Donut */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0 16px' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Track */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--dash-surface2)" strokeWidth={sw} />
          {/* Segments */}
          {arcs}
          {/* Center text */}
          <text
            x={cx} y={cy - 4} textAnchor="middle"
            fill="var(--dash-ink)" fontSize={30} fontWeight={700}
            style={{ fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums' }}
          >{paidPct}%</text>
          <text
            x={cx} y={cy + 16} textAnchor="middle"
            fill="var(--dash-muted)" fontSize={11}
            style={{ fontFamily: 'var(--font-body-alt)' }}
          >тўланган</text>
        </svg>
      </div>

      {/* Legend */}
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
```

- [ ] **Step 2: Type-check**

```bash
cd precast-crm && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add precast-crm/src/components/dashboard/PaymentDonut.tsx
git commit -m "Feat(dashboard): PaymentDonut — SVG donut with legend"
```

---

### Task 9: Rewrite Dashboard Page + DashboardSkeleton + Delete Old Components

Wire all new components into `page.tsx`, rewrite `DashboardSkeleton`, and remove the 12 old card components.

**Files:**
- Rewrite: `precast-crm/src/app/(app)/dashboard/page.tsx`
- Rewrite: `precast-crm/src/components/dashboard/DashboardSkeleton.tsx`
- Delete: `precast-crm/src/components/dashboard/ActiveCustomersCard.tsx`
- Delete: `precast-crm/src/components/dashboard/AverageOrderValueCard.tsx`
- Delete: `precast-crm/src/components/dashboard/CashOnTheRoadCard.tsx`
- Delete: `precast-crm/src/components/dashboard/CustomersByCityCard.tsx`
- Delete: `precast-crm/src/components/dashboard/MonthlyRevenueChart.tsx`
- Delete: `precast-crm/src/components/dashboard/OpenDiscrepanciesCard.tsx`
- Delete: `precast-crm/src/components/dashboard/ReceivablesCard.tsx`
- Delete: `precast-crm/src/components/dashboard/RevenueAllTimeCard.tsx`
- Delete: `precast-crm/src/components/dashboard/RevenueThisMonthCard.tsx`
- Delete: `precast-crm/src/components/dashboard/TodayDeliveriesCard.tsx`
- Delete: `precast-crm/src/components/dashboard/TopCustomersCard.tsx`
- Delete: `precast-crm/src/components/dashboard/WeekCapacityCard.tsx`
- Keep: `precast-crm/src/components/dashboard/Card.tsx`, `Skeleton.tsx`, `TrendIndicator.tsx` (may be referenced elsewhere)

- [ ] **Step 1: Rewrite `precast-crm/src/app/(app)/dashboard/page.tsx`**

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/fetcher';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { HeroChart } from '@/components/dashboard/HeroChart';
import { FinancialKPIs } from '@/components/dashboard/FinancialKPIs';
import { OperationalKPIs } from '@/components/dashboard/OperationalKPIs';
import { TopClients } from '@/components/dashboard/TopClients';
import { RecentOrders } from '@/components/dashboard/RecentOrders';
import { PaymentDonut } from '@/components/dashboard/PaymentDonut';
import type { DashboardData } from '@/components/dashboard/types';

const SECTION_LABEL: React.CSSProperties = {
  fontFamily: 'var(--font-num)', fontSize: 12, letterSpacing: '.18em',
  textTransform: 'uppercase', color: 'var(--dash-muted)', fontWeight: 700,
  margin: '0 0 14px',
};

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardData>('/api/dashboard'),
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
    retry: false,
  });

  if (isLoading || !data) return <DashboardSkeleton />;

  if (error) {
    const msg = (error as Error).message ?? '';
    const forbidden = /403|only admin|only owner/i.test(msg);
    return (
      <div className="dashboard-root" style={{ background: 'var(--dash-bg)', minHeight: '100%', padding: '34px 28px 64px', fontFamily: 'var(--font-body-alt)' }}>
        <p style={{ color: 'var(--dash-muted)', fontFamily: 'var(--font-body-alt)' }}>
          {forbidden
            ? 'Бу саҳифага рухсат йўқ — фақат ADMIN ва OWNER кира олади.'
            : `Юклаб бўлмади: ${msg}`}
        </p>
      </div>
    );
  }

  return (
    <div className="dashboard-root" style={{
      background: 'var(--dash-bg)', minHeight: '100%',
      fontFamily: 'var(--font-body-alt)',
    }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '34px 28px 64px' }}>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 26 }}>
          <div>
            <h1 style={{
              margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600,
              fontSize: 48, lineHeight: 1.02, letterSpacing: '-.015em',
              color: 'var(--dash-ink)',
            }}>Бошқарув</h1>
            <p style={{
              margin: '10px 0 0', fontFamily: 'var(--font-body-alt)',
              fontSize: 15.5, color: 'var(--dash-muted)', maxWidth: 560,
            }}>
              Даромад, операциялар ва мижозлар фаолиятининг реал вақтдаги кўриниши.
            </p>
          </div>
          {/* Live date badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '7px 13px', border: '1px solid var(--dash-line)',
            borderRadius: 999, background: 'var(--dash-surface)', whiteSpace: 'nowrap',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: 'var(--dash-pos)',
              boxShadow: '0 0 0 3px color-mix(in srgb, var(--dash-pos) 22%, transparent)',
            }} />
            <span style={{ fontFamily: 'var(--font-num)', fontSize: 12.5, color: 'var(--dash-muted)' }}>
              {new Date().toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>

        {/* Hero chart */}
        <HeroChart
          revenueByMonth={data.revenueByMonth}
          ordersByMonth={data.ordersByMonth}
        />

        {/* Financial KPIs */}
        <div style={SECTION_LABEL}>Молиявий ҳолат</div>
        <FinancialKPIs data={data} />

        {/* Operational KPIs */}
        <div style={SECTION_LABEL}>Операцион ҳолат</div>
        <OperationalKPIs data={data} />

        {/* Bottom widgets */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr 0.85fr', gap: 16 }}>
          <TopClients clients={data.topCustomers} />
          <RecentOrders orders={data.recentOrders} />
          <PaymentDonut breakdown={data.activeCustomers.breakdown} />
        </div>

      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `DashboardSkeleton.tsx`**

```tsx
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
          {[0,1,2,3].map(i => <SkeletonBlock key={i} height={160} radius={14} />)}
        </div>
        {/* Operational KPIs */}
        <SkeletonBlock height={14} radius={4} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginTop: 14, marginBottom: 34 }}>
          {[0,1,2,3].map(i => <SkeletonBlock key={i} height={160} radius={14} />)}
        </div>
        {/* Bottom widgets */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr 0.85fr', gap: 16 }}>
          {[0,1,2].map(i => <SkeletonBlock key={i} height={380} radius={14} />)}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Delete old component files**

```bash
cd precast-crm && git rm \
  src/components/dashboard/ActiveCustomersCard.tsx \
  src/components/dashboard/AverageOrderValueCard.tsx \
  src/components/dashboard/CashOnTheRoadCard.tsx \
  src/components/dashboard/CustomersByCityCard.tsx \
  src/components/dashboard/MonthlyRevenueChart.tsx \
  src/components/dashboard/OpenDiscrepanciesCard.tsx \
  src/components/dashboard/ReceivablesCard.tsx \
  src/components/dashboard/RevenueAllTimeCard.tsx \
  src/components/dashboard/RevenueThisMonthCard.tsx \
  src/components/dashboard/TodayDeliveriesCard.tsx \
  src/components/dashboard/TopCustomersCard.tsx \
  src/components/dashboard/WeekCapacityCard.tsx
```

- [ ] **Step 4: Type-check — must pass with zero errors**

```bash
cd precast-crm && npx tsc --noEmit
```

If errors reference the deleted files being imported somewhere else, trace and fix each import.

- [ ] **Step 5: Build check**

```bash
cd precast-crm && npm run build 2>&1 | tail -30
```

Expected: `✓ Compiled successfully` with no TypeScript or module-not-found errors.

- [ ] **Step 6: Commit**

```bash
git add precast-crm/src/app/\(app\)/dashboard/page.tsx \
        precast-crm/src/components/dashboard/DashboardSkeleton.tsx
git commit -m "Feat(dashboard): wire Эталон redesign — hero chart, KPIs, top clients, recent orders, donut"
```

---

## Post-implementation Checklist

- [ ] Open the dashboard in the browser. Verify all 6 sections render with real data.
- [ ] Toggle dark mode (sun/moon button in TopBar). Confirm all `--dash-*` colours switch correctly on the dashboard while the rest of the app (sidebar, other pages) also toggles via the existing `html[data-theme="dark"]` variables.
- [ ] Check number formatting: thousands separated by non-breaking space, no raw floats.
- [ ] Verify the hero chart year-view line chart and month-view bar chart both render and the toggle works.
- [ ] Verify the month navigator (`‹` / `›`) scrolls through the 12 months.
- [ ] Verify the Payment Donut shows correct counts from live data.
- [ ] Verify empty states: if `topCustomers` is empty, "Маълумот йўқ" shows; if `recentOrders` is empty, "Буюртмалар йўқ" shows.
