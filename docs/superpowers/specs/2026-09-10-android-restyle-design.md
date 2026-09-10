# EtalonSlabs CRM — Android restyle to the "Etalon Mobile" design system

**Status:** approved by the owner on 2026-09-10, section by section, in conversation. This document records that design so a plan can be written from it.

**Sources, in order of precedence**
1. This document — it records the owner's overrides and settles what the two sources below leave open.
2. `ANDROID_DESIGN_SPEC (1).md` v1.1 (owner's Downloads) — "Etalon Mobile — Android design system & specification". Its own rule: where it and the prototype differ, it wins.
3. `Etalon Mobile v2 (standalone).html` — the design canvas: token sheet (2a), interactive prototype (2b), calculator room-cards (3a, confirmed) and sliding table (3b, **not to be built**). Rendered and captured on 2026-09-10; the prototype's «+ Янги» still opens a v1 three-step wizard that v1.1 replaced with the calculator.

The backend contract is unchanged: the same `precast-crm` API, entities, enums, permissions and Uzbek Cyrillic labels.

---

## 0. Decisions log (owner, 2026-09-10)

| # | Decision | Supersedes |
|---|---|---|
| D1 | The restyle comes **before** the field-readiness slice. | Roadmap order of 2026-09-09. |
| D2 | The design system is applied to **all 18 screens**; the six the spec draws are precedent for the twelve it does not. Every extrapolated screen is shown to the owner as a rendered baseline before it is built. | — |
| D3 | The bottom nav keeps **Ҳисоб as a fifth cell**: Бош · Буюртма · Ҳисоб · Тўлов · Мижоз. | The spec's four-cell pill. |
| D4 | The calculator is **3a exactly**: inline input cells, the phone's decimal keyboard. The docked `NumericKeypad` and the «Кейинги» walk are retired from the calculator. | Phase 2b's entry design. |
| D5 | The rate-override **reason stays mandatory**. | Spec §3.4 «Сабаб (ихтиёрий)». |
| D6 | **Light only.** Dark mode is out of scope for this restyle. | Architecture spec §6.1 light+dark. |
| D7 | Touch targets stay **48 dp**; visual sizes follow the spec. | Spec §5 44 dp. |
| D8 | Numbers use the spec's format: **thin-space (U+2009) thousands**, «UZS» only as the small prefix on KPI/hero figures, none inside lists. | Architecture spec §6.5 and the project rule (NBSP + «UZS» everywhere). |
| D9 | **No logistics cell** in the nav for any role. Dispatch, load truck, shipments, delivery proof are reached from the order detail's sticky action bar. | Phase 1b's logistics tab. |
| D10 | Discount (%/amount), delivery and other cost move **into the place-order sheet** (spec §4.11: the discount is applied at placement). The rounding grid, «round all up» and the beam schedule open from a **⋯ on the summary sheet**. Rejected offline orders surface on **Home's outbox banner**. | Phase 2b's expandable totals sheet. |

Earlier decisions that still stand and that this restyle must not disturb: no CAD canvas on mobile (2026-09-09); the override tiers offered are the static catalogue (`M2_OVERRIDE_TIERS`), not live pricing, because the server validates against the static table; phone is the unique client identity; the outbox ⇔ idempotency rule; owner-stamped outbox rows; Room migrations only (no destructive fallback); `Boundary.kt` as the only `Double`→`Money` crossing.

---

## 1. Goal and non-goals

**Goal.** Re-skin the existing Android client to the Etalon Mobile system so that what staff install looks like the prototype the owner signed off — same tokens, same components, same screen compositions — without changing what the app does.

**Non-goals.** No change to ViewModels, repositories, the calculation engines, the outbox, database schemas, permissions, API calls, or the *content* of any Uzbek string. No dark mode, no Latin-script variant, no CAD, no new features. The readiness slice (signing, CI, install, push) follows this work unchanged.

---

## 2. Foundation (`:core:designsystem`)

### 2.1 Colour — `EtalonColors`, light only
Exactly spec §1.1: `page #F8F8FA`, `surface #FFFFFF`, `surfaceBorder #ECEBF3` (1 dp hairline on every white surface), `navy #1B2033`, `navy2 #262B40`, `indigo #5646EE`, `indigoPressed #4A3AD9`, `indigoPanel #625BB8`, `indigoTile #7770CC`, `indigoTint #8A82F1`, `lavender #C2BCFF`, `lavenderBg #EDEBFF`, `ink #0F0F17`, `ink2 #5D5F70`, `ink3 #A7A6AE`, `green #22B07D`, `greenBg #E6F7F0`, `red #E5484D`, `redBg #FDECEC`, `onDark #FFFFFF`, `onDarkMuted` white 72 %, `onDarkDivider` white 18 %, `debtOnDark #FF8A8E`, `paidOnDark #5CD6A6`. Avatar palette, deterministic by client name (sum of char codes mod 7): `#5646EE #8A82F1 #625BB8 #E5BBAD #22B07D #7770CC #F0A868`.

Exposed as a composition-local `EtalonColors` object; `MaterialTheme.colorScheme` is mapped onto it (primary = indigo, surface = surface, background = page, error = red, outline = surfaceBorder) so M3 components inherit sensibly, but **every Etalon component reads `EtalonColors` directly**. Material default colours, elevation overlays and the default ripple are not used; ripple = indigo 12 % on light, white 12 % on dark. No raw hex outside `EtalonColors.kt`.

Payment semantics carry over onto the new palette: paid = green, debt/overdue/rejected = red, awaiting confirmation = the lavender/indigo tag, order-level "pending" = the neutral light tag.

### 2.2 Typography — `EtalonType`, Plus Jakarta Sans
Bundled 400/500/600/700/800 (OFL). Scale exactly spec §1.2: displayTitle 28/800 −0.02em · headline 22/800 · kpi 24/700 (unit prefix 14/500 at 50 %) · amountLg 30/800 · titleSm 16/800 · sectionTitle 14/700 · body 13/500 · rowTitle 13/700 · rowAmount 13/700 tabular · label 12/600 · meta 11/400 · tag 10/600 (10.5 on panels) · caption 10/600. `FontFeature "tnum"` on every numeric style. Manrope and JetBrains Mono are removed from the bundle.

### 2.3 Shape, spacing, elevation, icons, motion
Shapes per §1.3 (xs 6 · sm 8 · md 10 · lg 12 · xl 16 · xxl 18 · sheet 22 · pill) with the nesting rule navy(22, pad 10) → indigoPanel(18, pad 16/14) → tile(12, pad 10/12). Spacing per §1.4 (4-pt grid; 20 dp header margin, 16 dp card margin; bottom content padding 100 dp under the floating nav, 150–170 dp above a sticky action bar). Elevation per §1.5: flat with hairlines; shadows only on the primary button, the floating nav and toast/confirm sheet. Icons: **Lucide**, 2 dp stroke, round caps, imported as ~30 XML vector drawables (ISC licence, no dependency) replacing the 30 Material icons in use. Motion per §1.7.

---

## 3. Components (`:core:designsystem`)

Built or rebuilt exactly to spec §2; the current 17 map as follows.

| Spec component | Replaces / relates to |
|---|---|
| PrimaryButton, SecondaryButton, DarkButton, InverseButton | `EtalonButtons` |
| IconButton (36–40, optional red badge dot) | new |
| Avatar (34–36, palette, initials, ring on indigoPanel) | new |
| SearchField (h40 pill) | `SearchTopBar` |
| FilterChip (h32 pill, count badge) | `FilterChipRow` |
| SegmentedControl (navy/navy2 track, white active) | new |
| StatusTag — three palettes: row-on-navy, row-on-light, panel-on-indigo | `StatusChip` (tone mapping kept, colours re-sourced) |
| KpiCard with bar sparkline | `KpiTile` |
| OrderRow (avatar · title/meta · amount/debt) | order card |
| MonthHeader | new |
| NavySheet (22 top corners, sticky header, rows) | new |
| DetailPanel, RoomTile, AddTile | new (order detail) |
| ProgressCard | new |
| StepTimeline | `TimelineStepper` |
| BottomNav (floating pill, **5 cells**, indigo dot, gradient scrim) | shell bar |
| Toast | snackbar use |
| ConfirmSheet | payment approve sheet |
| FormCard (stacked fields, hairline dividers, borderless inputs) | client edit / login forms |
| RateSheet, RateConfirm | `RateOverrideSheet` |
| `MoneyText`, `AreaText`, `CountText` | kept, on the new type and number format |
| `EmptyState`, `ErrorBanner`, `NoticeBanner`, `OutboxBanner`, `PhotoStrip`, `Lightbox`, `CountStepper`, `CustodyChain`, `DriverPicker`, `StickyActionBar` | kept, restyled |
| `NumericKeypadSheet` / `NumericKeypad` | kept and restyled for payments and logistics; **not used by the calculator** (D4) |

Hit areas ≥ 48 dp on every interactive element (D7); visual heights as the spec states.

---

## 4. Navigation and shell

Floating pill, navy, h60, 16 dp side margin, 12 dp above the gesture inset, five equal cells (D3): **Бош · Буюртма · Ҳисоб · Тўлов · Мижоз**. Active cell = white pill, navy icon, 6 dp indigo dot + label; inactive = icon only at 62 %. The bar is permission-filtered exactly as today, so a role lacking `calculator.use` or `client.view` sees fewer cells. Page content carries the 40 % white→page gradient scrim beneath the nav.

**Logistics (D9).** No logistics cell. A driver's screens — Dispatch, LoadTruck, ShipmentLoad, Shipments, DeliveryProof, DeliveryLocation, Drivers — are reached from the order detail's sticky action bar («Юклаш», «Жўнатиш», «Етказилди», and their sub-flows) and from Home's «Бугунги етказиш» rows. Every route, ViewModel and permission stays as it is; only the entry point moves.

**Calculator entry.** The Ҳисоб cell, Orders «+ Янги», and Home.

**Owner tools (thin).** With no «Яна» cell, the screens that were behind it move under the Home app bar's avatar: tapping it opens a small white sheet with the signed-in name and role, «Ҳайдовчилар» (Drivers, shown only with `driver.manage`), «PIN-ни ўзгартириш», and «Чиқиш». Nothing else lives there.

**Shipments are per order.** The global shipments list goes; each order's shipments render as a NavySheet section inside its detail screen, with the load / dispatch / deliver actions on the rows and in the sticky bar.

Stack routes and modals otherwise as today.

---

## 5. Screens

### 5.1 The six the spec draws — build as spec §3
Home §3.1 · Orders §3.2 · Order detail §3.3 · Calculator §3.4 (see §6 here) · Payments §3.5 · Clients §3.6. Where the spec's data model is simpler than the app's (four order statuses, four payment methods, `debt = total − paid`), **the app's real model stands**: all seven order statuses get a StatusTag palette entry (DRAFT/PLACED neutral, IN_PRODUCTION/LOADED lavender-indigo, DISPATCHED indigo, DELIVERED green, CANCELED red), all five payment methods appear, and debt is the server's `remaining`, which counts write-offs.

### 5.2 The twelve extrapolated — mapping rules (D2)
| Screen | Composition |
|---|---|
| Login | page bg, logo block, FormCard (phone, PIN), PrimaryButton; error as ErrorBanner |
| ChangePin | FormCard + PrimaryButton |
| ClientDetail | DetailPanel variant (navy → indigo panel: avatar, name, phone, address, totals tiles) over the client's OrderRows in a white card; edit via IconButton |
| ClientEdit | FormCard (name, phone mask, viloyat/tuman, street) + sticky PrimaryButton |
| RecordPayment | FormCard; amount in `amountLg`; method as FilterChips; receipt PhotoStrip; ConfirmSheet-style summary before submit |
| ConfirmQueue | spec §3.5 |
| Discrepancies | NavySheet rows with StatusTag; resolve via ConfirmSheet |
| Dispatch | white card list of OrderRows with StepTimeline; DriverPicker restyled |
| Drivers | Clients-style avatar rows |
| LoadTruck, ShipmentLoad, DeliveryProof | camera-first, unchanged flow; header IconButtons, CountStepper and PrimaryButton restyled; result summaries as indigoTile grids |
| Shipments | NavySheet rows, StatusTag on navy |
| DeliveryLocation | map unchanged; controls restyled |

Each is rendered as a Roborazzi baseline and shown to the owner before its task is considered done.

---

## 6. Calculator — 3a exactly (D4, D5, D10)

Composition per spec §3.4: header with «Чизиш» kept as a disabled placeholder; ClientRow collapsing to one line with FormCard beneath; RoomCard = title row (editable name, PatternChip cycling авто → Г-Б → Б-Г-Б → Г-Б-Г, ⋯ button), InputRow grid `1fr 1fr .9fr .9fr 1.3fr` (Эни/Бўйи lavender cells with the system decimal keyboard, Таяниш/Корр. hairline cells, RateCell), MoreRow behind ⋯ (+Б stepper, Бош балка toggle, delete), ResultRow (Монолит Б · Балка · Ғишт · Майдон), formula footer; dashed AddRoomButton; fixed navy SummarySheet (Жами · UZS · `area · beams · blocks / ~weight` · save · share · «Буюртма бериш»), 190 dp content padding so it never covers the last card.

**Kept from Phase 2b beneath the new skin:** the row layer, `computeOrderTotals` as the headline, drafts, the place-order queue, the share image (restyled to the new card), the static override tiers, the extras-only room rule (notice as a Toast + inline warning), the client-bar lookup.

**Relocated (D10):** discount %/amount, delivery and other → the place-order sheet (`PlaceOrderSheet`, restyled as a ConfirmSheet-style panel); grid 5/10 cm, «round all up», beam schedule → a small white sheet opened from a ⋯ IconButton on the SummarySheet; the rejected-order banner → Home's OutboxBanner. The live headline still includes delivery/other once entered in the place-order sheet.

**RateSheet / RateConfirm** per spec, with the reason field required (D5); the «авто» mini-tag marks the static tier equal to the live auto rate.

**Keyboard.** `KeyboardType.Decimal`; both `,` and `.` accepted, display uses `,`. Every keystroke recomputes synchronously (engine is pure Kotlin).

---

## 7. Numbers and formatting (D8)
`Formatters.kt`: thousands grouped with U+2009; money in lists without a unit; KPI/hero figures with a small «UZS» prefix (14/500 at 50 %); `м²` with decimal comma; counts `та`; dates as today. Tabular figures everywhere. The architecture spec §6.5 and CLAUDE.md §3's "currency labelled UZS" are amended by this decision for the Android client only.

---

## 8. Testing and acceptance
- Roborazzi, light only; every baseline re-recorded as its screen lands; `verifyRoborazziDebug` in the standard command.
- Spec §7 fixtures (`5,2×7,1 → 7 330 400`, `4,0×6,0 → 3 749 600`, `3,6×4,5 → 2 462 460`) are already pinned by the engine's golden tests; the calculator screen test asserts the same three through the UI.
- No raw hex outside `EtalonColors.kt` — a lint-style unit test greps the source tree.
- Rate override requires RateConfirm; reverting to Авто does not.
- The SummarySheet never covers the last room card at font scale 1.3.
- Existing unit tests (987 Android) stay green untouched except where a test names a component that was renamed.

---

## 9. Phasing (the plan details the tasks)
1. **Foundation** — tokens, fonts, Lucide vectors, `EtalonTheme`; the four buttons, tags, avatar, chips, segmented control, sheets, nav pill (5 cells). Screenshot tests per component.
2. **Shell + Home + Orders + Order detail** — nav, D9 entry points, the three most-used screens.
3. **Payments + Clients + auth** — queue, record payment, discrepancies, clients, client detail/edit, login, change-PIN.
4. **Calculator 3a** — the card, sheets, D10 relocations, keypad retirement, share image restyle.
5. **Logistics extrapolation** — the seven driver screens, each shown before merge.
6. Whole-branch review, one fix wave, then the readiness slice.

---

## 10. Risks
- **Font metrics vs baselines**: Plus Jakarta Sans renders differently from Manrope; every baseline moves once — expected, recorded per phase.
- **Five cells at 360 dp**: label + dot must fit the active cell; measured in phase 1 with the longest label «Буюртма».
- **Lucide fidelity**: hand-imported vectors must keep 2 dp stroke at 20/18/16/12 dp; a component screenshot per icon size.
- **System keyboard on the calculator**: decimal-comma keyboards vary by locale; both separators accepted (§6).
- **Logistics discoverability (D9)**: drivers lose a dedicated cell; Home's «Бугунги етказиш» and the order action bar carry the load — reviewed with the owner on the phase-2 baselines.

## 11. Later, not now
Dark mode; a Latin-script variant; the driver delivery screen the prototype suggests; Play/App Distribution; the parked 2c list.
