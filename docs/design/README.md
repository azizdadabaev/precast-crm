# Handoff: EtalonSlabs CRM — Premium Design Redesign

## Overview

This is a **complete visual redesign** of the EtalonSlabs precast-concrete CRM (an existing internal tool for a beam-and-block factory in Uzbekistan, used by Owner / Admin / Sales / Driver / Inventory / Accountant roles). The original app is functionally complete; this handoff covers the **visual / interaction layer only** — every data field, route, role, and business rule from the existing codebase stays exactly as it is.

The goal: lift the look-and-feel from the current "Bootstrap-y form table" baseline to a **6-figure-company tool** aesthetic — dense, precise, engineering-grade. Inspired by the Modo design system (precision-instrument typography, mono numerics, status-coded row borders, zone-banded form headers).

## About the Design Files

The files in this bundle (`*.html`, `*.jsx`) are **design references**, not production code to lift wholesale. They run in a browser via Babel-standalone, use inline-style React for portability, and intentionally have no build step — that's a prototyping convenience, not a recommendation. **Recreate these designs in the EtalonSlabs codebase's existing framework** (whatever it is — Django templates, Next.js, Rails + Hotwire, plain Flask + HTMX, etc.) using its established conventions for routing, state, and component structure. Lift the **visual tokens, layout, and component anatomy**, not the JSX literally.

If parts of the existing codebase use a CSS framework (Tailwind, Bootstrap, custom CSS), translate the inline styles to that framework's idioms.

## Fidelity

**High-fidelity.** Every screen is pixel-precise:
- Exact hex values for colors (both light and dark mode)
- Exact typography (family, size, weight, letter-spacing)
- Exact spacing, border-radii, status chip styles
- Exact column orders, labels (bilingual Uzbek + English), data formats
- Exact interaction patterns (filter tabs, capacity calendar, zone-banded calculator headers)

Match the prototypes closely. Where measurements aren't stated, read them from the inline-styled JSX — every value is in the source.

## Tech Stack of the Prototype (for reference, NOT prescriptive)

- React 18 + Babel-standalone (CDN), inline styles
- Manrope (UI), JetBrains Mono (all numeric / code data)
- No CSS framework — all design tokens defined in `getTokens(dark)` inside `etalon-ui.jsx`

You do NOT need to use React or these libraries. Use whatever the EtalonSlabs codebase already uses.

---

## Design Tokens

All tokens are defined in **`etalon-ui.jsx` → `getTokens(dark)`**. Two complete palettes — dark mode and light mode — must both work.

### Colors — Dark Mode (primary)

| Token | Hex | Usage |
|---|---|---|
| `bg` | `#0a0c11` | Main page background |
| `bgSub` | `#070910` | Subtle alt (table header rows) |
| `surface` | `#10141d` | Cards, table bodies |
| `surfaceHover` | `#161b27` | Row hover |
| `surfaceActive` | `#1c2235` | Pressed states |
| `border` | `#1c2133` | All borders, dividers |
| `borderStrong` | `#252c40` | Emphasized dividers |
| `text1` | `#e4e8f4` | Headings, primary text, table cell main values |
| `text2` | `#7d87a4` | Secondary text, sub-labels |
| `text3` | `#3e4660` | Tertiary / muted / em-dash placeholder |
| `sidebarBg` | `#060810` | Sidebar background (always dark, even in light mode) |
| `sidebarBorder` | `#0f1220` | Sidebar internal dividers |
| `sidebarText` | `#3e4660` | Inactive sidebar text |
| `sidebarHover` | `#5a6580` | Sidebar hover text |
| `sidebarActive` | `#e4e8f4` | Active sidebar text |
| `sidebarActiveBg` | `rgba(78,128,255,0.14)` | Active sidebar item pill |
| `accent` | `#4e80ff` | Electric blue — primary CTAs, links, active filters, numeric highlights |
| `accentHover` | `#3d6fef` | CTA hover |
| `emerald` | `#10b981` | Success CTAs ("Review" button, "Send to calculator") |
| `gold` | `#e8a020` | (reserved, currently unused) |
| `danger` | `#f87171` | Errors, shortfalls, deactivated, low-stock rows |
| `warning` | `#f59e0b` | Pending, drafts, blocks (production logs) |
| `success` | `#22c55e` | Active status, paid, in-stock |

### Colors — Light Mode

Same token names, different values:
- `bg: #f3f5fb`, `bgSub: #eaecf5`, `surface: #ffffff`
- `text1: #0c0f1a`, `text2: #5a6488`, `text3: #9aa3bf`
- Status colors slightly darker for AA contrast on white: `emerald: #059669`, `danger: #dc2626`, `warning: #d97706`, `success: #16a34a`
- Sidebar stays **dark** in both modes (same values as dark mode) — intentional anchor element.

### Typography

- **Headings + UI body**: `Manrope` — weights 400 / 500 / 600 / 700 / 800
  - Page titles: 20px / 800 / letter-spacing -0.02em
  - Section heads: 13–14px / 700, uppercase variants letter-spacing 0.06–0.08em
  - Body: 12–13px / 500–600
- **All numeric / code / data values**: `JetBrains Mono` — weights 400 / 600 / 700
  - Table cell numbers: 12px, `font-variant-numeric: tabular-nums` (critical — guarantees column alignment)
  - KPI values: 26–36px / 800
  - Status chips: 10–11px / 700, uppercase, letter-spacing 0.05–0.09em
- **Column header labels**: 10px / 700, uppercase, letter-spacing 0.09em, color = `text3`

### Spacing & Radius

| Token | Value | Usage |
|---|---|---|
| `r` | `10px` | Cards, large panels |
| `rSm` | `6px` | Buttons, inputs |
| `rXs` | `4px` | Chips, table cells, tight controls |

Page padding: `24px`. Card padding: `18–24px`. Row padding: `12px 18px`. Cell gap in grids: `10px`.

### Status Chip Style (used everywhere)

```css
display: inline-flex;
padding: 3px 10px;
border-radius: 20px;
font-size: 10px;
font-weight: 700;
font-family: JetBrains Mono;
letter-spacing: 0.06em;
text-transform: uppercase;
background: ${color}18;   /* 9% alpha of the status color */
color: ${color};
border: 1px solid ${color}30;
```

The leading `⏳` / `✓` / `●` glyph is part of the label.

### Table Row Anatomy (used on every list screen)

```
| 3px left-border (status-coded) | 12px 18px padding row | alternating zebra |

borderLeft: 3px solid ${statusColor};   // e.g. warning for pending, danger for shortfall
background: ${i % 2 === 0 ? surface : bgSub + '70'};
hover background: surfaceHover;
```

Color the left border by the row's most important status — pending payment → warning, open discrepancy → danger, active driver → success, draft → warning.

---

## Sidebar (NAV)

Defined in `etalon-layout.jsx → NAV` array. Always dark, 220px expanded / 56px rail when collapsed. Logo top, items middle, user + Logout pinned bottom.

Order (matches existing codebase, do not reorder):

1. **Бошқарув · Dashboard** (`dashboard`)
2. **Калькулятор · Calculator** (`calculator`)
3. **Буюртмалар · Orders** (`orders`)
4. **Лойиҳалар · Projects** (`projects`)
5. **Мижозлар · Clients** (`clients`)
6. **Тўловлар · Payments** (`payments`)
7. **Тафовутлар · Discrepancies** (`discrepancies`)
8. **Ҳайдовчилар · Drivers** (`drivers`)
9. **Ишлаб чиқариш · Production** (`production`)
10. **Омбор · Warehouse** (`warehouse`)
11. **Тажриба · Sandbox · Tapered** (`sandbox`)
12. **Фойдаланувчилар · Users** (`users`)

Every item label is **bilingual**: Uzbek (Cyrillic) on top in 13px/600, English subtitle in 10px/600/uppercase/letter-spacing-0.07em/muted. Keep both languages exactly as shown.

Active state: blue-tinted pill background (`sidebarActiveBg`), bright text (`sidebarActive`), 2px blue left accent strip.

Role-based visibility: hide items the user lacks permission for (existing role logic stays).

---

## Screens

For every screen, the data fields shown in the prototype match the existing codebase's columns exactly — do not add, remove, or reorder. Bilingual column headers like **`ИСМ · NAME`** are required.

### 1. Dashboard (`dashboard`)

**Layout**: 3 stacked sections, each with section header.

- **Section 1 — Financial Health** (4 KPI cards in a row):
  - Бугунги тушум · Today's Revenue (sum, UZS)
  - Ҳафталик тушум · Weekly Revenue
  - Қарзлар · Outstanding Debt (red if > 0)
  - Тафовутлар · Open Discrepancies (count)
- **Section 2 — Operational Status** (3 cards):
  - Бугунги етказиб бериш · Today's Deliveries
  - Активный буюртмалар · Active Orders
  - Омбор · Stock Levels (beams + blocks mini-bars)
- **Section 3 — Business Insights** (4 panels):
  - Top Clients (table, top 5 by revenue, name + revenue right-aligned mono)
  - City Distribution (horizontal bars by city)
  - 7-Day Capacity Calendar (mini version of Orders calendar)
  - Recent Activity feed

KPI card anatomy:
```
icon-chip (24px, status-color tinted) + label
[big value, 26–36px mono 800]
[trend arrow + delta]  [sub-label]
```

### 2. Calculator (`calculator`) — most distinctive screen

A wide 18-column grid for calculating block-and-beam orders per room. **Column groups are visually banded** with subtle background tints:

| Zone | Columns | Tint |
|---|---|---|
| **Input** | ХОНА (room name), ЭНИ (width), БЎЙИ (length), МИНИШ (minus), КОРР. (correction), ЙИГМА Б. (slab type) | warm `#f59e0b08` |
| **Beams (Балка)** | Қатор, Узун, Сони, Жами, %, ҳосил | none |
| **Blocks (Ғишт)** | Сони, Тахт, Жами | none |
| **Pricing** | Тариф, Сумма, Қалдиқ | cool `#4e80ff08` |

Zone headers span the column-group with a small uppercase label.

Top toolbar: rounding controls (chips: `1`, `5`, `10`, `100`), Save Project, Place Order CTAs.

Bottom: 3 summary panels side-by-side
- **Grand Total** — large sum with currency
- **Production List** — beam lengths grouped + counts
- **Materials** — slab area, block count, beam meters

Add Room button (dashed border, `+ Янги хона · Add room`).

Bilingual labels everywhere: header is `Ҳисоблаш · Calculate`, etc.

### 3. Orders (`orders`)

**Top section — Capacity Calendar** (the centerpiece):
- Month nav: `< May 2026 >`
- 7-column grid, Uzbek day abbreviations (Dsh / Sesh / Chor / Pay / Jum / Shan / Yak)
- Each day cell:
  - Date number top-left
  - **Capacity bar** (green if under, amber 70–95%, red over) — vertical fill from bottom
  - Order count badge top-right
  - Today: 2px blue border
- Legend below: `▮ Under capacity`, `▮ Near limit`, `▮ Over`, `▮ Today`

**Filter row**: tabs (ALL / DRAFT / CONFIRMED / IN-DELIVERY / DELIVERED / CANCELED) + search.

**Table** (all 10 columns from existing app, left to right):
1. # (order number, mono, accent color)
2. CLIENT (name + phone in sub-row)
3. МАНЗИЛ · ADDRESS
4. ITEMS (concise summary: `2 rooms · 14.75 m²`)
5. AMOUNT (right-aligned, mono, 700)
6. PAID (right-aligned, green if full)
7. STATUS (status chip)
8. DRIVER
9. SCHEDULED
10. ACTIONS (kebab menu)

Row left-border colored by status.

### 4. Projects (`projects`)

Saved calculations not yet placed as orders.

- Top: search bar + `DRAFTS / ALL` segmented control + `+ New Calculation` CTA
- Columns: МИЖОЗ·CLIENT, ТЕЛ·PHONE, МАНЗИЛ·ADDRESS, ХОНАЛАР·ROOMS, МАЙДОН·AREA (m²), СУММА·SUBTOTAL, STATUS (always ЛОЙИХА·DRAFT in amber chip), UPDATED

### 5. Payments (`payments`)

Maker-checker queue.

- Tabs: PENDING / CONFIRMED / REJECTED
- Columns: ORDER (mono, blue), CLIENT (name + phone sub), МАНЗИЛ·ADDRESS, AMOUNT, EXPECTED, METHOD, DRIVER, RECORDED, STATUS, [Review CTA]
- "Review" is a green emerald button with check icon
- Status chips: ⏳ PENDING (amber), ✓ CONFIRMED (success), ✕ REJECTED (danger)

### 6. Discrepancies (`discrepancies`)

Cash shortfalls.

- Tabs: OPEN / RESOLVED / DISPUTED
- Columns: ORDER #, CLIENT, DRIVER, EXPECTED, RECEIVED, SHORT (red, 800), STATUS, REPORTED (date + reporter name), RESOLVED, [Update btn]
- Row left-border `danger`

### 7. Clients (`clients`) — **important: columns reordered to match actual app**

- Top: search + `All languages / UZ / RU` dropdown + `+ New Client`
- Columns: ☐ checkbox, ИСМ·NAME, ТЕЛ·PHONE (mono, accent), МАНЗИЛ·ADDRESS (truncated with ellipsis), LANG (UZ/RU chip — UZ blue, RU red), SOURCE (Walk-in / Instagram / Referral / —), ORDERS (count), ADDED (date mono)

### 8. Drivers (`drivers`)

- Columns: ИСМ·NAME (name + italicized notes sub-row), ТЕЛ·PHONE, ACTIVE DISPATCHES, DISCREPANCIES (30D) — red bold if > 0, LAST DISPATCH (blue mono), STATUS (Active chip), [Deactivate btn]
- `+ Add Driver` top right

### 9. Production (`production`)

Two parts:

**A. Log form** (card):
- Header: `ЯНГИ МАҲСУЛОТ · LOG PRODUCTION` + helper "Each line increments stock."
- Row 1: САНА·DATE (date input) + ИЗОҲ·NOTES (text input)
- Sub-grid header band: KIND / BEAM LENGTH / QTY / ✕
  - KIND = select (Балка·Beam / Ғишт·Block)
  - BEAM LENGTH = number input (disabled when KIND=Block)
  - QTY = number input
- `+ Add line` (dashed-border button)
- `✓ Save Production Log` (right-aligned)

**B. Recent 14 Days timeline** (`СЎНГГИ 14 КУН · RECENT 14 DAYS`):
- Cards grouped by date (newest first)
- Each card: date + entry count + flex row of `{kind} {+qty}` (beams blue, blocks amber)
- Optional italic note line: `"Shift A · Monday casting batch" — Sales Manager`

### 10. Warehouse (`warehouse`)

- Top: 2 KPI cards
  - БАЛКА · BEAMS IN STOCK — big number, sub-label "3 SKUs"
  - ҒИШТ · BLOCKS IN STOCK — big number, sub-label "1 SKU"
- Section: **Балкалар · Beams** — table (LENGTH, QTY, LOW-STOCK AT, RECENT MOVEMENTS) — rows with qty ≤ low-stock get tinted danger background; movements column is a wrap of small pills like `+production +60`
- Section: **Ғиштлар · Blocks** — same structure, single row

### 11. Sandbox · Tapered (`sandbox`)

Engineering calculator for trapezoidal slabs.

**Two-column layout** (420px left + 1fr right):

- **Left card — Кирувчи маълумотлар · Inputs**:
  - 3-col grid: WIDTH 1 / WIDTH 2 / LENGTH
  - Checkbox: `Тўғри тўртбурчак эмас? · Irregular quadrilateral?`
  - BEAM SPACING input
  - `Ҳисоблаш · Calculate` blue CTA + `Show worked example` dropdown

- **Right column — 3 numbered result panels**:
  - **1. КИРИШ · INPUT** — 4-col KV grid (echo of inputs)
  - **2. ГЕОМЕТРИЯ · GEOMETRY** — 8 KVs (Δw, C_M, C_R, Pitches, Beams, L_effective, L_covered, Severity) + italic info line
  - **3. СТРАТЕГИЯ · BEAM STRATEGY** — segmented toggle `ҚАТОРМА-ҚАТОР·PER-ROW / ГУРУХЛАНГАН·GROUPED` + amber **HYBRID** badge top-right, then result table (ROW / INNER W / BEAM / BLOCKS) with TOTAL row (2px top-border, tinted blue), bullet list of strategy notes, green `✦ Калькуляторга юбориш · Send to calculator` CTA bottom-right

### 12. Users (`users`)

Staff management.

- Columns: ИСМ·NAME (with `(you)` blue badge if self), EMAIL (mono), ШАБЛОН·TEMPLATE (with `✏ Махсус` amber badge if customized), РУХСАТЛАР·PERMS (count), ҲОЛАТИ·STATUS (Фаол·Active green / Ўчирилган·Disabled muted), ОХИРГИ КИРИШ·LAST LOGIN (mono), [✏ Edit]
- **Disabled rows render in `text3` muted color** (every cell)
- `+ Янги фойдаланувчи · Add user` top right

### 13. Sign in (`login`) — full-screen, no sidebar

- Centered card, 420px wide, 12px radius, soft shadow
- Logo block (52×52 blue rounded square with 4-quadrant glyph)
- Heading: **EtalonSlabs** (20px / 800)
- Subtitle: "Sign in to your account"
- Email input → Password input → blue `Sign in` button (full width)
- Bottom helper line: `Default seed: admin@precast.local / admin123` (mono, muted, accent on the values)

---

## Interactions

- **Theme toggle** — sun/moon icon in topbar swaps `dark` flag; instant, no transition flash
- **Sidebar collapse** — chevron button toggles 220 ↔ 56px; labels animate to 0 opacity
- **Filter tabs** — underlined active state with 2px accent border slide, instant
- **Row hover** — background to `surfaceHover`, 100ms
- **Status chips** — non-interactive
- **Calendar day click** — should drill into that day's orders (existing behavior)
- **All keyboard nav** — Tab/Shift+Tab through interactive elements, Enter activates, Esc closes overlays

No fancy page transitions. Snappy. Engineering tools value latency over polish.

---

## Internationalization

**Every label is bilingual** in the format `Uzbek (Cyrillic) · English`. Use a middle-dot separator `·` (U+00B7), not hyphen or pipe.

Columns headers: `ИСМ · NAME`. CTAs: `Янги хона · Add room`. Section heads: `БАЛКА · BEAMS IN STOCK`.

In the existing i18n system, store both strings together OR split into separate keys and concat in the component. Numbers/dates/currency formatting follows existing locale logic.

---

## Files in This Bundle

| File | What's in it |
|---|---|
| `EtalonSlabs CRM.html` | Main shell: theme tokens consumption, sidebar + topbar mount, page routing, Tweaks panel |
| `etalon-ui.jsx` | Design system — `getTokens(dark)`, `Icon`, `Btn`, `SearchBar`, `Chip`, `SectionHead`, status-chip mappings |
| `etalon-layout.jsx` | `Sidebar`, `TopBar`, `NAV` array, `Logo` |
| `etalon-screens.jsx` | DashboardScreen, OrdersScreen (+ CapacityCalendar), CalculatorScreen, PlaceholderScreen |
| `etalon-screens-2.jsx` | ProjectsScreen, PaymentsScreen, DiscrepanciesScreen, ClientsScreen (current), DriversScreen, ProductionScreen, WarehouseScreen, SandboxScreen, UsersScreen, LoginScreen |
| `tweaks-panel.jsx` | (prototype-only — tweak controls; not part of the shipping app) |

**Reading order**: start with `etalon-ui.jsx` (tokens), then `etalon-layout.jsx` (chrome), then any screen file for the patterns. Numbers and copy in screen files are mock data — replace with the existing app's real data flows.

---

## Implementation Suggestions

1. **Lift tokens first**. Translate `getTokens(dark)` into the codebase's CSS-variable / theme system. Both modes must work.
2. **Build the shared atoms next**: status chip, table-row primitive, KPI card, section header, filter tabs. Reuse aggressively across screens.
3. **Then screen by screen**, in the NAV order. Dashboard, Calculator, Orders, Projects, Payments, Discrepancies, Clients, Drivers, Production, Warehouse, Sandbox, Users, Login.
4. **Don't ship inline-style React.** Use the codebase's component / CSS conventions. The inline styles in this bundle are for prototype portability only — they translate cleanly to CSS classes / Tailwind utilities / SCSS / styled-components.
5. **Preserve the existing routes, permissions, data shapes, and i18n strings.** This is a visual reskin — backend touchpoints don't change.
6. **Test both light and dark modes** on every screen before shipping.

Open `EtalonSlabs CRM.html` in a browser to interact with the live prototype — every screen is reachable via the sidebar or via the Tweaks dropdown (top-right gear icon).
