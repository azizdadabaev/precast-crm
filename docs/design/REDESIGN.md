# Etalon UI/UX Redesign — Map

This folder holds the Claude Design handoff for the Precast CRM
redesign (a complete visual reskin; no business-logic changes). The
handoff is **design intent expressed as React**, not drop-in code:

> "The files in this bundle (`*.html`, `*.jsx`) are design references,
> not production code to lift wholesale. They run in a browser via
> Babel-standalone, use inline-style React for portability, and
> intentionally have no build step — that's a prototyping convenience,
> not a recommendation. **Recreate these designs in the EtalonSlabs
> codebase's existing framework** using its established conventions
> for routing, state, and component structure. Lift the visual
> tokens, layout, and component anatomy, not the JSX literally."
>
> — `README.md`

The implementation lives on the `testui` branch, with one commit per
phase so any single piece can be reverted without losing the rest.

## Files in this folder

| File | Role |
|---|---|
| `README.md` | Design handoff README from Claude Design. Highest-signal — read first. |
| `etalon-ui.jsx` | Source of truth for design tokens (`getTokens(dark)`), Icon library, `Chip` / `KpiCard` / `SectionHead` / `PageTitle` / `Btn` / `SearchBar` primitives, `STATUS_MAP` / `PAY_MAP` enums. |
| `etalon-layout.jsx` | Sidebar (220/56px collapse, dark-always), TopBar (breadcrumb + search + theme toggle + avatar), `NAV` array. |
| `etalon-screens.jsx` | Dashboard, Orders + capacity calendar, Calculator, generic Placeholder. |
| `etalon-screens-2.jsx` | Projects, Payments, Discrepancies, Clients, Drivers, Production, Warehouse (= inventory), Sandbox, Users, Login. |
| `tweaks-panel.jsx` | Prototype-only dev tool. **Not ported to production.** |
| `EtalonSlabs CRM.html` | Standalone browser preview built from the JSX. Open it directly in a browser to navigate the prototype. |

## Production target — handoff piece → live file

| Handoff piece | Production file(s) |
|---|---|
| `getTokens(false)` (light palette) | `src/app/globals.css` `:root` + `tailwind.config.ts` |
| `getTokens(true)` (dark palette) | *Not implemented in this PR.* Light mode only per scope. |
| Manrope + JetBrains Mono | `src/app/layout.tsx` (Phase 0) |
| Sidebar | `src/components/sidebar.tsx` |
| TopBar | `src/components/TopBar.tsx` *(new)* |
| App shell composition | `src/app/(app)/layout.tsx` |
| Chip | `src/components/ui/chip.tsx` *(new)* |
| KpiCard | `src/components/ui/kpi-card.tsx` *(new)* |
| Button / Input / Card / Dialog / Select / Badge / Label | `src/components/ui/*.tsx` *(visual retoke, API unchanged)* |
| Dashboard screen | `src/app/(app)/dashboard/page.tsx` + `src/components/dashboard/*Card.tsx` |
| Orders screen + capacity calendar | `src/app/(app)/orders/page.tsx` |
| Projects screen | `src/app/(app)/projects/page.tsx` |
| Payments screen | `src/app/(app)/payments/page.tsx` |
| Discrepancies screen | `src/app/(app)/discrepancies/page.tsx` |
| Clients screen | `src/app/(app)/clients/page.tsx` + `[id]/page.tsx` |
| Drivers screen | `src/app/(app)/drivers/page.tsx` + `[id]/page.tsx` |
| Production screen | `src/app/(app)/production/page.tsx` |
| Warehouse screen | `src/app/(app)/inventory/page.tsx` *(URL stays `/inventory`)* |
| Sandbox screen | `src/app/(app)/sandbox/tapered/page.tsx` |
| Users screen | `src/app/(app)/users/page.tsx` + dialogs |
| Login screen | `src/app/login/page.tsx` |
| Order detail | `src/app/(app)/orders/[id]/page.tsx` + `/print/page.tsx` |
| Calculator (zone-banded) | `src/app/(app)/calculations/page.tsx` + `src/components/calculation/MultiRoomCalculator.tsx` |

## Light-mode token table (used in Phase 1)

| Etalon token | Hex | Maps to CSS variable |
|---|---|---|
| `bg` | `#f3f5fb` | `--background` |
| `bgSub` | `#eaecf5` | `--muted` |
| `surface` | `#ffffff` | `--card` |
| `surfaceHover` | `#f8f9fd` | `--surface-hover` *(new)* |
| `surfaceActive` | `#eef1fa` | `--surface-active` *(new)* |
| `border` | `#dde1f0` | `--border` |
| `borderStrong` | `#c4cadf` | `--border-strong` *(new)* |
| `text1` | `#0c0f1a` | `--foreground` |
| `text2` | `#5a6488` | `--muted-foreground` |
| `text3` | `#9aa3bf` | `--text-tertiary` *(new)* |
| `sidebarBg` | `#060810` | `--sidebar-bg` *(hardcoded — sidebar stays dark regardless of mode)* |
| `sidebarBorder` | `#0f1220` | `--sidebar-border` |
| `sidebarText` | `#3e4660` | `--sidebar-text` |
| `sidebarHover` | `#5a6580` | `--sidebar-hover` |
| `sidebarActive` | `#e4e8f4` | `--sidebar-active` |
| `sidebarActiveBg` | `rgba(78,128,255,0.14)` | `--sidebar-active-bg` |
| `accent` | `#4e80ff` | `--accent` *(electric blue — primary CTAs)* |
| `accentHover` | `#3d6fef` | `--accent-hover` |
| `accentDim` | `rgba(78,128,255,0.10)` | `--accent-dim` |
| `emerald` | `#059669` | `--success` *(paid, in-stock, confirmed)* |
| `gold` | `#b45309` | `--gold` *(production milestones, sandbox)* |
| `danger` | `#dc2626` | `--destructive` *(shortfall, OPEN discrepancy)* |
| `warning` | `#d97706` | `--warning` *(pending, drafts, blocks)* |
| `r` | `10px` | `--radius` *(rounded-lg)* |
| `rSm` | `6px` | `--radius-sm` *(rounded-md)* |
| `rXs` | `4px` | `--radius-xs` *(rounded-sm)* |

## Out of scope for this PR

- Dark mode (the README's primary, but skipped here per scope choice;
  the dark palette in `etalon-ui.jsx → getTokens(true)` stays as
  reference for a future PR).
- `tweaks-panel.jsx` (prototype dev tool, not production).
- Renaming `/calculations` → `/calculator` or `/inventory` →
  `/warehouse`. URLs unchanged; sidebar labels use the etalon
  bilingual names.
- Any business-logic, API, schema, permission, or engine change.

## How to preview the original prototype

1. Open `EtalonSlabs CRM.html` directly in a browser (no server needed
   — Babel-standalone compiles the JSX on load).
2. The gear icon (bottom-right) opens the tweaks panel: toggle dark
   mode, switch screens, expand/collapse sidebar.

When in doubt about a layout decision, compare side-by-side with the
production page on `http://localhost:3000`. The exact pixel values
should match.
