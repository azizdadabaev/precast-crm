# Dashboard Redesign — Эталон Theme

**Date:** 2026-07-01  
**Status:** Approved, pending implementation  
**Scope:** `src/app/(app)/dashboard/` + supporting files  

---

## 1. Overview

Replace the existing dashboard page with a new layout matching the approved `EtalonSlabs Dashboard.dc.html` design exactly. The redesign covers:

- Full-width hero chart (12-month revenue line / monthly orders bar, switchable)
- Two 4-column KPI rows: financial and operational
- Three-column bottom widget row: Top Clients, Recent Orders, Payment Donut

The **Эталон** visual theme applies: Playfair Display headings, IBM Plex Mono numerics, Golos Text body, green accent `#0E7C5A` (light) / `#34D39A` (dark). Colors are scoped to the dashboard container only — the rest of the app is unchanged.

Dark mode toggle is **app-wide**: a Sun/Moon button added to the existing TopBar sets `data-theme="dark"` on `<html>` and persists to `localStorage`.

The app shell (Sidebar + TopBar + MainContainer) is untouched. The mock's own header (logo, search, direction tabs) is not reproduced — those functions already exist in the app shell.

---

## 2. Data Layer

### 2.1 Extend `DashboardPayload` in `/api/dashboard/route.ts`

Five new fields added to the existing payload. All computed in the same Prisma query block, no new routes.

| Field | Type | Description |
|---|---|---|
| `revenueByMonth` | `{ month: string; revenue: number }[]` | 12 entries, the 12 calendar months ending with the current month (e.g. Aug 2025 → Jul 2026), oldest-first, sum of `totalPrice` for FULLY_PAID orders grouped by `placedAt` month. `month` is a 3-letter Uzbek abbreviation (Авг, Сен … Июл). |
| `ordersByMonth` | `{ month: string; count: number }[]` | Same 12-month window and ordering, total order count per month (all non-CANCELED, non-DRAFT orders). |
| `topClients` | `TopClientRow[]` | Top 5 clients by sum of `totalPrice` in the 12-month window |
| `recentOrders` | `RecentOrderRow[]` | Last 6 orders by `placedAt desc`, with client name, material label, area, price, paymentState |
| `paymentStateCounts` | `{ fullyPaid: number; partiallyPaid: number; awaitingPayment: number }` | Count of orders by `paymentState` (all-time, active orders only — exclude CANCELED/DRAFT) |

```ts
// TopClientRow
{
  clientId: string
  name: string
  ini: string          // first two word initials, uppercase
  totalRevenue: number // sum of totalPrice
  orderCount: number
  pct: number          // percentage of the top client's revenue (top = 100%)
}

// RecentOrderRow
{
  orderNumber: string
  clientName: string
  primaryProductLabel: string  // order.primaryCalculation exists → use its first room's beam type label; otherwise fall back to "Precast"
  totalArea: number            // totalArea in m²
  totalPrice: number
  paymentState: 'FULLY_PAID' | 'PARTIALLY_PAID' | 'AWAITING_PAYMENT'
}
```

### 2.2 Monthly-revenue sub-route

`/api/dashboard/monthly-revenue` is superseded by `revenueByMonth` in the main payload. The sub-route stays but the dashboard no longer fetches it separately. It can be removed in a future cleanup.

### 2.3 Permission gate

No change — existing `withPermissionAny(["dashboard.viewBasic", "dashboard.view"])` covers all new fields. `topClients` and `recentOrders` are gated behind the same permission since they contain financial detail.

---

## 3. Theme & Colors

### 3.1 Dashboard-scoped CSS variables

Added as a new block in `src/app/globals.css`. Does not override any existing global variables.

```css
/* Эталон dashboard palette — light */
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
  --dash-grid:     #E6E4DC;
  --dash-tip:      #15181D;
  --dash-tip-ink:  #FFFFFF;
  --dash-radius:   14px;
}

/* Эталон dashboard palette — dark */
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
  --dash-grid:     #222C28;
  --dash-tip:      #ECEFEA;
  --dash-tip-ink:  #0E1311;
}
```

Every dashboard component uses only `var(--dash-*)` variables. Global `var(--primary)`, `var(--background)` etc. are never referenced inside dashboard components.

### 3.2 Typography

Three fonts added to `src/app/layout.tsx` via `next/font/google`. Exposed as CSS variables on `:root`. Other pages continue using `var(--font-sans)` (Manrope).

```ts
const playfair = Playfair_Display({ subsets: ['latin'], weight: ['500','600','700'], variable: '--font-display' })
const ibmPlexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400','500','700'], variable: '--font-num' })
const golosText = Golos_Text({ subsets: ['latin', 'cyrillic'], weight: ['400','500','600','700'], variable: '--font-body-alt' })
```

The `<body>` className gains all three variables alongside the existing Manrope ones.

---

## 4. Dark Mode Toggle

### 4.1 Flash-prevention script

Inline `<script>` added to `<head>` in `src/app/layout.tsx` (before any stylesheets load):

```html
<script dangerouslySetInnerHTML={{ __html: `
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark') document.documentElement.dataset.theme = 'dark';
  } catch(e) {}
` }} />
```

### 4.2 `useTheme` hook

New file: `src/hooks/useTheme.ts`

```ts
'use client'
import { useState, useEffect } from 'react'

export function useTheme() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === 'dark')
  }, [])

  const toggle = () => {
    const next = !dark
    document.documentElement.dataset.theme = next ? 'dark' : ''
    try { localStorage.setItem('theme', next ? 'dark' : 'light') } catch {}
    setDark(next)
  }

  return { dark, toggle }
}
```

### 4.3 TopBar button

`src/components/TopBar.tsx` gains a `Sun`/`Moon` Lucide icon button (already uses Lucide) placed before the notification bell. Uses `useTheme()`. Button is `aria-label="Режимни алмаштириш"`.

---

## 5. Dashboard Page Structure

### 5.1 File: `src/app/(app)/dashboard/page.tsx`

Client component. Keeps existing React Query fetch from `/api/dashboard` (60s polling, 30s stale). Renders:

```tsx
<div className="dashboard-root" style={{ background: 'var(--dash-bg)', minHeight: '100%', fontFamily: 'var(--font-body-alt)' }}>
  <div style={{ maxWidth: 1320, margin: '0 auto', padding: '34px 28px 64px' }}>
    <PageHeader />       {/* H1 + subtitle + live date badge */}
    <HeroChart />        {/* full-width */}
    <SectionLabel>Молиявий ҳолат</SectionLabel>
    <FinancialKPIs />    {/* 4-col grid */}
    <SectionLabel>Операцион ҳолат</SectionLabel>
    <OperationalKPIs />  {/* 4-col grid */}
    <BottomWidgets />    {/* 3-col grid */}
  </div>
</div>
```

`SectionLabel` is an inline styled `<div>` (uppercase, `var(--font-num)`, `var(--dash-muted)`) — not a separate component file.

Loading state: `DashboardSkeleton` rendered while React Query is fetching initial data (replaces current skeleton).

---

## 6. Component Specifications

All components live in `src/components/dashboard/`.

### 6.1 `HeroChart.tsx`

**Layout:** Card with `display:grid; grid-template-columns: 300px 1fr`. Border-right divides left panel from chart area.

**Left panel (300px):**
- Section label: uppercase mono — `"12 ОЙЛИК ДАРОМАД"` (year) or `"{month} ОЙИ БУЮРТМАЛАРИ"` (month)
- Big value: `font-size:52px`, `var(--font-num)`, bold, with unit label beside it
- Delta badge + sub-label (e.g. `+34,6% · 633 буюртма`)
- `flex:1` spacer
- Toggle pill: two buttons (`12 ой даромад` / `Ойлик буюртма`) in a rounded pill container
- Month navigator: `←` month name `→` — visible only when monthly view is active

**Right panel:**
- Year view: Recharts `AreaChart` — smooth area with gradient fill, accent stroke, hover `ReferenceLine` + custom `Tooltip` showing month, revenue (UZS), order count
- Month view: Recharts `BarChart` — one bar per day, hover tooltip showing day, order count, area (м²), revenue
- Both use `ResponsiveContainer width="100%" height={300}`
- Chart state: `{ view: 'year' | 'month', month: 0–11 }` in component-local `useState`
- No remount on view switch — conditional render of chart type inside one component

**Data props:** `revenueByMonth`, `ordersByMonth` from DashboardPayload. Monthly daily data is derived client-side (same deterministic formula as the mock) — real per-day data is a future enhancement.

### 6.2 `FinancialKPIs.tsx`

4-column grid (`grid-template-columns: repeat(4,1fr); gap:16px`).

Shared `KPICard` primitive (inline, not exported separately — used only here and in OperationalKPIs):

```
┌──────────────────────────┐
│ LABEL           DELTA    │  ← uppercase mono label, colored delta badge
│                          │
│ VALUE           unit     │  ← big mono value, small unit label
│ [sparkline]              │  ← 34px tall SVG sparkline
│ sub-text                 │  ← body-alt, muted
└──────────────────────────┘
```

Cards:
1. **Бу ойдаги даромад** — `thisMonthRevenue`, delta vs prev month, 6-point sparkline from last 6 months
2. **Жами даромад** — `totalRevenue`, no delta, cumulative sparkline
3. **Ўртача буюртма** — `avgOrderValue`, delta, sparkline
4. **Қарздорлик** — `receivables`, red left-border variant (`border-left: 3px solid var(--dash-accent2)`), "тўлов кутилмоқда" label instead of delta, receivables-trend sparkline

Sparklines: pure SVG, ~30 lines each, no Recharts (overhead not justified for 6-point lines). Same `spark()` approach as the mock.

### 6.3 `OperationalKPIs.tsx`

Same 4-column grid.

Cards:
1. **Фаол мижозлар** — `activeClients` count, stacked mini bar (3 segments: FULLY_PAID / PARTIALLY_PAID / AWAITING_PAYMENT proportions from `paymentStateCounts`), sub-text with breakdown
2. **Бугунги етказишлар** — `todayDeliveries` count, delivery dots (filled = completed, outline = pending), sub-text with scheduled m²
3. **Очиқ тафовутлар** — `openDiscrepancies` count, green "Назоратда" pill if 0, red count if >0, sub-text
4. **Йўлдаги нақд пул** — `cashInTransit` count (shipments) + amount (UZS), sub-text with area on road

### 6.4 `TopClients.tsx`

Card with title "Энг тўрти мижозлар" + "12 ой" label. Renders 5 rows from `topClients`:

```
[ini avatar] [name ···················] [value]
             [████████░░░░░░░░░░░░░░░] ← width = c.pct
             [sub-text: type · N буюртма]
```

Avatar: 34×34px rounded square, accent background at 14% opacity, accent text, initials.

### 6.5 `RecentOrders.tsx`

Card with title "Сўнгги буюртмалар" + "Барчаси →" link. Column header row + 6 data rows.

Columns: `Мижоз / Материал` (1.6fr) | `Майдон` (0.8fr, right-align) | `Сумма` (0.9fr, right-align).

Payment state badges:
- `FULLY_PAID` → `Тўланган`, `var(--dash-pos)` bg tint
- `PARTIALLY_PAID` → `Қисман`, `var(--dash-accent)` bg tint
- `AWAITING_PAYMENT` → `Кутилмоқда`, `var(--dash-muted)` bg tint

### 6.6 `PaymentDonut.tsx`

Card with title "Тўлов ҳолати" + total order count sub-label.

SVG donut (size 148px, radius 54, stroke-width 18). Three arc segments drawn with `stroke-dasharray` from `paymentStateCounts`:
- FULLY_PAID → `var(--dash-pos)`
- PARTIALLY_PAID → `var(--dash-accent)`
- AWAITING_PAYMENT → `var(--dash-muted)`

Center text: paid percentage (`fullyPaid / total * 100`%, rounded) + "тўланган" label.

Legend below: three rows with colored 9×9px square, label, count.

### 6.7 `DashboardSkeleton.tsx`

Replaces current skeleton. Matches the new layout: one tall skeleton block (hero), two rows of 4 skeleton cards, three skeleton columns. Uses `var(--dash-surface2)` + pulse animation.

---

## 7. Files Changed / Created

| File | Change |
|---|---|
| `src/app/globals.css` | Add `.dashboard-root` and `html[data-theme="dark"] .dashboard-root` blocks |
| `src/app/layout.tsx` | Add 3 `next/font/google` fonts + flash-prevention inline script |
| `src/hooks/useTheme.ts` | **New** — 20-line dark mode hook |
| `src/components/TopBar.tsx` | Add Sun/Moon toggle button |
| `src/app/api/dashboard/route.ts` | Extend `DashboardPayload` with 5 new fields + Prisma queries |
| `src/app/(app)/dashboard/page.tsx` | **Rewrite** — new layout with `.dashboard-root` wrapper |
| `src/components/dashboard/HeroChart.tsx` | **New** |
| `src/components/dashboard/FinancialKPIs.tsx` | **New** |
| `src/components/dashboard/OperationalKPIs.tsx` | **New** |
| `src/components/dashboard/TopClients.tsx` | **New** |
| `src/components/dashboard/RecentOrders.tsx` | **New** |
| `src/components/dashboard/PaymentDonut.tsx` | **New** |
| `src/components/dashboard/DashboardSkeleton.tsx` | **Rewrite** |

Existing dashboard card components (`MonthlyRevenueChart.tsx`, individual KPI card files) are deleted in the same PR as the new components are introduced — not deferred.

---

## 8. Out of Scope

- Daily per-order data for the monthly bar chart (mock uses deterministic formula; real per-day aggregation is a future enhancement)
- The mock's direction tabs (Эталон / Контракт / Журнал) — user chose Эталон only
- Responsive/mobile layout — existing `MainContainer` handles mobile padding; dashboard cards will scroll horizontally on narrow viewports as they do today
- Customers-by-city card and Week Capacity card from the current dashboard — not in the new design; removed
