# Etalon Mobile — Android design system & specification (v1.1)

Single input for the Android build agent. Source of truth for visuals is `Etalon Mobile v2.dc.html` (prototype 2b, calculator 3a) and `finnova-system.md`; this file translates them into Compose-ready tokens, components, screens and calculation rules. Where this file and the prototype differ, this file wins. Backend contract is the existing `precast-crm` (Next.js) API — same entities, enums and Uzbek Cyrillic labels.

Stack assumptions: Kotlin, Jetpack Compose, Material 3 as base with a custom theme (do not use default M3 colors/shapes), Navigation Compose, single-activity. Fonts: Plus Jakarta Sans (400/500/600/700/800) bundled as resources.

---

## 1. Tokens

### 1.1 Color (`EtalonColors`)
| Token | Hex | Usage |
| --- | --- | --- |
| page | `#F8F8FA` | screen background |
| surface | `#FFFFFF` | cards, inputs, chips (idle) |
| surfaceBorder | `#ECEBF3` | 1dp hairline on every white surface |
| navy | `#1B2033` | list sheet, nav bar, dark panels, active filter chip, toast |
| navy2 | `#262B40` | chips / icon buttons / row hover on navy |
| indigo | `#5646EE` | primary button, progress, active dot, DISPATCHED tag, current step |
| indigoPressed | `#4A3AD9` | primary pressed |
| indigoPanel | `#625BB8` | detail header panel, confirm sheet body |
| indigoTile | `#7770CC` | tiles inside indigoPanel |
| indigoTint | `#8A82F1` | avatar palette, highlights |
| lavender | `#C2BCFF` | sparkline idle bars, dashed add border, chip pressed |
| lavenderBg | `#EDEBFF` | tinted icon squares, progress track, secondary button pressed, light tag bg |
| ink | `#0F0F17` | primary text |
| ink2 | `#5D5F70` | secondary text, labels |
| ink3 | `#A7A6AE` | placeholders, meta text, month captions |
| green | `#22B07D` | paid, positive delta, DELIVERED light tag fg, toast check |
| greenBg | `#E6F7F0` | green tinted bg |
| red | `#E5484D` | debt, overdue, rejected |
| redBg | `#FDECEC` | red tinted bg |
| onDark | `#FFFFFF` | text on navy/indigo |
| onDarkMuted | `rgba(255,255,255,.72)` | secondary text on dark |
| onDarkDivider | `rgba(255,255,255,.18)` | dividers on indigoPanel |
| debtOnDark | `#FF8A8E` | debt amount on navy |
| paidOnDark | `#5CD6A6` | paid label on navy |

Avatar palette (deterministic by hash of client name, sum of char codes mod 7): `#5646EE #8A82F1 #625BB8 #E5BBAD #22B07D #7770CC #F0A868`.

### 1.2 Typography (`EtalonType`) — Plus Jakarta Sans
| Style | Size/Weight | Tracking | Use |
| --- | --- | --- | --- |
| displayTitle | 28sp / 800 | −0.02em | screen titles |
| headline | 22sp / 800 | −0.01em | "# 0003" order id on panel |
| kpi | 24sp / 700 | −0.02em | KPI values (unit prefix 14sp/500 at 50% opacity) |
| amountLg | 30sp / 800 | −0.02em | confirm sheet amount |
| titleSm | 16sp / 800 | −0.01em | sub-screen titles |
| sectionTitle | 14sp / 700 | 0 | "Бугунги етказиш", "Рўйхат" |
| body | 13sp / 500 | 0 | body |
| rowTitle | 13sp / 700 | 0 | client name in rows |
| rowAmount | 13sp / 700 tabular | 0 | amounts in rows |
| label | 12sp / 600 | 0 | card labels, subtitles, chip text |
| meta | 11sp / 400 | 0 | row meta (№, m², date) |
| tag | 10sp / 600 | 0 | status tags in rows; 10.5sp on panels |
| caption | 10sp / 600 | 0 | tile captions on dark |

All numbers: `FontFeature "tnum"`. Thousands separator: thin space — **U+202F NARROW NO-BREAK SPACE** on Android (restyle ruling R5; U+2009 is breakable and costs a long figure its tail). Decimal comma for m² (`36,5 м²`). Currency: amounts shown without unit inside lists; `UZS` as small prefix only on KPI/hero numbers.

### 1.3 Shape (`EtalonShapes`)
| Token | dp | Use |
| --- | --- | --- |
| xs | 6 | status tags in rows |
| sm | 8 | tinted icon squares (22dp), chips on panel |
| md | 10 | square icon buttons, form inputs |
| lg | 12 | tiles inside panels, list row highlight, toast (14) |
| xl | 16 | white cards, KPI cards |
| xxl | 18 | indigoPanel inside navy |
| sheet | 22 | navy sheet / navy outer panels; list sheet uses 22 top corners only |
| pill | 50% | buttons, nav bar, avatars, search field, segmented control, progress |

Nesting rule: navy(22, pad 10) → indigoPanel(18, pad 16/14) → tile(12, pad 10/12).

### 1.4 Spacing
4-pt grid. Screen horizontal margin 20dp for headers, 16dp for cards/sheets. Card padding 14×16. Row padding 9–10 vertical, 8 horizontal, gap 10 between avatar / text / amount. Section gap 12–16. Bottom content padding = 100dp (space for floating nav), 150–170dp when a sticky action bar exists.

### 1.5 Elevation
Flat by default; hairline borders instead of shadows. Exceptions: primary button `0 6 16 rgba(86,70,238,.30)`, floating nav `0 10 30 rgba(27,32,51,.28)`, toast/confirm sheet `0 12 32 rgba(27,32,51,.30)`.

### 1.6 Icons
Lucide, 2dp stroke, round caps. Sizes: 20 nav, 18 header buttons, 16 inline, 12 inside tinted squares.

### 1.7 Motion
Standard M3 emphasized easing. Screen push 250ms slide+fade; sheet 300ms slide-up; toast in 200ms / out 200ms, auto-dismiss 2600ms; progress bar animate width 400ms.

---

## 2. Components

**PrimaryButton** — h46 (h36 compact in headers), pill, indigo bg, onDark 13sp/700, shadow. Pressed → indigoPressed. Disabled → lavender bg, indigo 50% text.
**SecondaryButton** — h46, pill, white bg, hairline border, ink 13sp/700. Pressed → lavenderBg.
**DarkButton** (on navy) — pill, navy2 bg, onDark. **InverseButton** (on navy) — pill, white bg, navy text.
**IconButton** — 36–40dp, radius md or pill, white + hairline (on light) / navy2 (on dark). Optional 7dp red badge dot top-right with 1.5dp white ring.
**Avatar** — 34–36dp circle, palette color, 12sp/700 initials (first letters of first two words, `&` ignored). On indigoPanel add 2dp `rgba(255,255,255,.35)` ring.
**SearchField** — h40, pill, white, hairline, 16dp search icon ink3, 13sp text, placeholder ink3 "Мижоз, № ёки телефон".
**FilterChip** — h32, pill, 12sp/600, count badge at 60% opacity. Idle: white/hairline/ink. Selected: navy/navy/onDark. Horizontal scroll, 6dp gap, edge-to-edge with 20dp inset.
**SegmentedControl** — navy2 track (on navy) or navy track (on light), pad 3–4, pill items h28–32 11sp/600; active = white bg + navy text; inactive = onDark 70%. Count badge 55% opacity.
**StatusTag** — radius xs, 10sp/600, pad 2×7. Three palettes by context (row-on-navy / row-on-light / panel-on-indigo):
| status | label / short | on navy (bg/fg) | on light | on indigoPanel |
| --- | --- | --- | --- | --- |
| PLACED | Қабул қилинган / Қабул | navy2 / white | `#EEEEF3` / ink2 | white 18% / white |
| IN_PRODUCTION | Ишлаб чиқилмоқда / Ишлаб чиқ. | navy2 / lavender | lavenderBg / indigo | white / indigo |
| DISPATCHED | Жўнатилган / Йўлда | indigo / white | indigo / white | navy / white |
| DELIVERED | Етказилган / Етказилган | navy2 / ink3 | greenBg / green | green / white |
**KpiCard** — w210 × auto, white, xl, pad 14×16. Header row: label 12/600 ink2 + 22dp tinted square icon (redBg/red, greenBg/green, lavenderBg/indigo). Value kpi style. Delta line 11/600 colored. Optional bar sparkline h44, 5dp gap, bars radius 4 top / 2 bottom, lavender idle, indigo current.
**OrderRow** — grid [36 avatar | text | trailing], h≈54, radius lg. Text: client rowTitle (ellipsis) / meta line = StatusTag + `№ 0003 · 78,7 м²` 11sp ink3. Trailing right-aligned: amount rowAmount / debt 10.5sp/600 (`қолди 7 350 000` red, or `тўланган` green). On navy: hover navy2, pressed indigo, text onDark, debt uses debtOnDark/paidOnDark.
**MonthHeader** — 10.5sp/600 ink3, label left ("Сентябрь 2026"), month sum right, pad 12/10/6.
**NavySheet** — navy, 22 top corners, fills to bottom, contains sticky header (section title + SegmentedControl) and scrolling rows with 10dp side padding.
**DetailPanel** — navy(22) wrapper with back + date + call IconButtons row; inner indigoPanel(18): caption "Буюртма", `# 0003` headline + StatusTag, Avatar+name+address row, 2-col grid of RoomTiles (indigoTile, area 15/700 + arrow-out icon, caption `Зал · 5,8 × 6,4`), dashed AddTile (1dp dashed white 40%, min-h58, "+ Хона қўшиш"), divider, 3-col totals (Майдон / Жами / Қолди, caption + 13/700).
**ProgressCard** — white xl: label + right pct (color red if debt, green if paid), 8dp pill track lavenderBg, indigo fill, footer "Тўланган X · Қолди Y".
**StepTimeline** — 4 columns, 5dp pill bars: done navy, current indigo, upcoming lavenderBg; 10/600 label; 10 ink3 date or ✓.
**BottomNav** — floating pill, navy, h60, 16dp side margin, 12dp bottom margin (respect gesture inset), 6dp inner pad, 4 equal cells. Active cell: white pill, navy icon, 6dp indigo dot + label 12/600; inactive: icon only, onDark 62%. Tabs: Бош / Буюртма / Тўлов / Мижоз. Page content gets a 40% white→page gradient scrim beneath nav.
**Toast** — navy, radius 14, 12.5/600 onDark, 20dp green check circle, positioned 96dp above bottom, 16dp side margins.
**ConfirmSheet** — modal scrim `rgba(27,32,51,.55)`, sheet inset 10dp all sides, navy(22, pad 10) → indigoPanel(18): caption `Тўловни тасдиқлаш · № 0003`, amountLg + `UZS`, meta, 2 tiles (Буюртма жами / Тасдиқдан кейин қолади). Footer: DarkButton "Рад этиш" + InverseButton "Тасдиқлаш" (weight 1).
**FormCard** — white xl, pad 6×14; fields stacked, each 10dp vertical pad, hairline divider between; label 11/600 ink2 above value 15/600 ink, borderless input. Numeric inputs in tables: h40, page bg, hairline, radius md.

---

## 3. Screens & navigation

Bottom tabs: `home`, `orders`, `pay`, `clients`. Stack routes on top: `orders/{id}` (detail), `calculator` (replaces the old 3-step "new order" flow — reached from Orders "+ Янги" and from Home), modal `payments/{id}/confirm`, sheets `calculator/rate/{roomIndex}` and `calculator/rate-confirm`.

### 3.1 Home (`Бошқарув`)
1. App bar row (20dp): gradient logo square 34/radius10 + "ETALON" 14/800 + "Beam & block flooring" 10 ink2; right: bell IconButton with red dot, 36dp avatar.
2. displayTitle "Бошқарув" + subtitle date line.
3. Horizontal KpiCard row (12dp gap): Қарздорлик (red icon, sum, `N буюртмада қолди`, sparkline) · Ҳафталик тушум (green, delta ↑ %, sparkline) · Ишлаб чиқаришда (indigo, `m²`, `N актив буюртма`).
4. NavySheet-style card (22, margin 16): "Бугунги етказиш" + count pill; OrderRows for orders scheduled today.
5. "Сўнгги буюртмалар" + "Барчаси" text button (indigo) → white xl card with 4 latest OrderRows (light variant).

### 3.2 Orders (`Буюртмалар`)
Header (20dp): title + `N буюртма · X м²`; right compact PrimaryButton "+ Янги". SearchField + filter IconButton row. FilterChips: Барчаси / Қабул / Ишлаб чиқариш / Йўлда / Етказилган (counts). Then NavySheet: "Рўйхат" + SegmentedControl Барчаси / Қарз / Тўланган; rows grouped by month (MonthHeader with monthly sum). Empty state 13sp ink3 "Буюртма топилмади." Search matches client, № and phone (spaces ignored).

### 3.3 Order detail
DetailPanel (see component) → ProgressCard (Тўлов ҳолати) → white card "Етказиш" with StepTimeline and `Сана · Ҳайдовчи` footer. Sticky action bar above nav (gradient scrim): SecondaryButton "Етказилди" (hidden when DELIVERED) + PrimaryButton "Тўлов қайд қилиш" (hidden when debt = 0). Call button dials `tel:`.

### 3.4 Calculator (`Калькулятор`) — confirmed design 3a
Replaces the old "new order" wizard. One scrolling screen + fixed summary sheet.

**Header** (pad 10/16): back IconButton (40, pill, white, hairline) · title block: "Калькулятор" titleSm + `N хона · нарх балка узунлигига қараб` 11 ink2 · right SecondaryButton compact h36 pill "Чизиш" with pencil icon (opens the room drawing tool; out of v1 scope, keep the button).

**ClientRow** (margin 12/16/0, white xl, pad 10×12): grid [34 | text | chevron]. 34dp lavenderBg circle with user icon in indigo; name 13/700 (or "Мижоз танланмаган"), meta 11 ink3 `phone · region, district` (or "Исм, телефон ва манзилни киритинг"); chevron rotates 180° when open. Tap toggles **ClientForm** (FormCard) with fields: Исм*, Тел рақам* (tel, mask `+998 90 ___ __ __`), Вилоят (select) | Туман (2-col), Манзил ("Кўча, маҳалла, бино, хонадон"). Collapsed by default when a client is already set, expanded when empty.

**RoomCard** (white xl, pad 12/14/10, gap 10 between cards):
1. Title row: room name — borderless editable text 14/800 (flex 1) · **PatternChip** h26 pill: label `Г-Б` / `Б-Г-Б` / `Г-Б-Г` 11/700 + mode suffix `авто` 10/600 at 70%; auto = lavenderBg/indigo, manual override = indigo/white, no suffix. Tap cycles auto → Г-Б → Б-Г-Б → Г-Б-Г → auto. · more button 28dp pill (⋯), lavenderBg when expanded.
2. **InputRow** — grid `1fr 1fr .9fr .9fr 1.3fr`, gap 5, margin-top 10:
   - Эни / Бўйи: lavenderBg cell radius md pad 6×8; caption 10/600 indigo; value 15/700 tabular, decimal keyboard, placeholder `0,00`.
   - Таяниш / Корр.: page-bg cell radius md hairline pad 5×7; caption 10/600 ink2; value 13/600. Defaults `0,15` and `0`.
   - **RateCell** (button): same geometry as Таяниш; caption row `Нарх/м²` + 10dp chevron; value `140k · авто` (13/700 + 10/600 at 70%). Auto = page-bg/hairline/ink; overridden = indigo bg, white text, `140k · қўлда`. Tap opens RateSheet.
3. **MoreRow** (only when ⋯ expanded) — grid `1fr 1fr auto`, gap 6, h40 each: `+Б қўшимча` numeric stepper cell (label left, value right 15/700) · `Бош балка` toggle (page bg/hairline; on = navy bg, white, checkbox 16dp radius 5 with check) · delete IconButton 40dp radius md, red icon, redBg on press.
4. **ResultRow** — 4 equal columns, margin-top 10, top hairline, pad-top 10: caption 10/600 ink3 + value 15/700 tabular with 11/500 ink2 unit: `Монолит Б  x,xx м` · `Балка  N та` · `Ғишт  N та` · `Майдон  x,xx м²` (right-aligned).
5. **Footer** — flex, gap 10, margin-top 8: left 11 ink2 `{rate} × {billed m²} м²` + ` + {extras} балка` when extras/BGB cost > 0 (wraps); right subtotal 16/800 tabular, `flex:none; nowrap`.

**AddRoomButton** — h46, dashed 1dp lavender, radius xl, indigo 13/700 "+ Янги хона"; new room = `Хона {n}`, empty W/L, bearing 0,15, corr 0.

**SummarySheet** (fixed bottom, margin 0/10/10, navy sheet radius 22, pad 14/16/12, gradient scrim above): left caption `Жами` 10.5/600 ink3-on-dark + total 26/800 tabular + `UZS` 12/600 70%; right 11 ink3-on-dark, 1.5 line-height: `**{area} м²** · {beams} балка · {blocks} ғишт` / `~{weight} кг`. Action row (margin-top 12, gap 8): DarkButton 46dp pill save icon (Лойиҳани сақлаш) · DarkButton 46dp pill send icon (Юбориш — share card) · InverseButton flex 1 "Буюртма бериш". Content bottom padding 190dp.

**RateSheet** (modal, scrim `rgba(27,32,51,.55)`, sheet inset 10, white radius 22, pad 16/14/14): caption `М² нархи · {room}` 11/600 ink2, title "Тарифни танланг" 16/800, list of 6 rows h46 radius lg gap 6: `Авто` (sub `{autoRate} · енг тарифи`) then the 5 catalog tiers `140 000 … 230 000` (sub `балка ≤ 4,30 м` etc.). Selected row = indigo/white; the tier equal to auto shows an `авто` mini tag (lavenderBg/indigo). Picking Авто or the auto tier applies immediately; any other tier opens RateConfirm.

**RateConfirm** (modal over RateSheet, navy(22, pad 10) → indigoPanel(18, pad 16×14)): caption `Нархни ўзгартириш · {room}`, helper 12 onDarkMuted "Фақат шу хона учун. Авто-га қайтариш енг тарифини тиклайди.", 2 tiles: `Авто {rate}` (indigoTile) and `Танланган {rate} ↑ устама|↓ чегирма` (white tile, direction red/green), reason field `Сабаб (ихтиёрий)` with `n / 200` counter (white 14% bg, radius md, h42). Footer: DarkButton "Бекор" + InverseButton "Тасдиқлаш". Confirm stores `{rate, reason}` on the room.

**Place order** — "Буюртма бериш" requires client name + phone + ≥1 valid room; creates PLACED order with rooms `{name, w, l, bearing, correction, extra_beams, force_start_beam, pattern?, rate_override?, reason?}`, navigates to detail, toast "Буюртма № … қабул қилинди". Save = draft project (Лойиҳа) with same payload.

### 3.5 Payments (`Тўловлар`)
Title + subtitle "Ходимлар қайд қилган тўловларни тасдиқлаш". SegmentedControl (navy track) Кутилмоқда / Тасдиқланган / Рад этилган with counts. Cards (white xl) per payment: Avatar, client, meta `№ · метод · ходим · сана`, amount 14/700; PENDING → pill "Кўриб чиқиш" (lavenderBg/indigo) opening ConfirmSheet; else tinted state tag (greenBg/green or redBg/red). Confirm adds amount to order.paid (cap at total); reject changes status only. Toasts: "{amount} UZS тасдиқланди" / "Тўлов рад этилди".

### 3.6 Clients (`Мижозлар`)
Title + `N мижоз · жами айланма бўйича`. White xl card of rows: Avatar, name, `phone · addr` meta, right total + `N буюртма`. Sorted by total desc.

---

## 4. Data & rules
- Order: `id, num (YYYY-MM-NNNN), date, sched, client, phone, addr, addrFull, total, area, paid, status ∈ {PLACED, IN_PRODUCTION, DISPATCHED, DELIVERED}, driver, rooms[{name,w,l}]`. Short id = `num.substring(5)` shown as `№ 0003` / `# 0003`.
- Payment: `id, orderId, amount, method ∈ {Нақд, Click, Payme, Банк}, by, date, status ∈ {PENDING, CONFIRMED, REJECTED}`. Maker-checker: staff record, owner confirms.
- debt = total − paid; debt > 0 → red everywhere, else green "тўланган".
- Rates come from the pricing config (owner-editable tiers, see §4.1); never hardcode the tier prices, do hardcode the geometry constants.
- Month grouping key = `num.substring(0,7)`; labels Январь…Декабрь + year.
- Locale: Uzbek Cyrillic UI strings verbatim from this doc; all in `strings.xml` (uz-Cyrl), keep Latin/Russian slots for later.

### 4.1 Calculation engine (port of `src/services/calculation-engine.ts`, pure Kotlin, unit-tested against the web)
Constants: `PITCH = 0.58`, `BEAM_WIDTH = 0.12`, `BLOCK_LENGTH = 0.20`, `BLOCK_VISIBLE = 0.45`, `TOPPING = 0.05`, `DEFAULT_BEARING = 0.15`. Remainder thresholds `0.20` (→ Б-Г-Б) and `0.45` (→ Г-Б-Г). Weight display: `area × 180 кг/м²`.

Price tiers by `beam_length` (≤ max → price; above last tier → last price), fetched from config, defaults:
| max beam L | м² price | extra-beam price / m |
| --- | --- | --- |
| 4,30 | 140 000 | 60 000 |
| 5,30 | 160 000 | 70 000 |
| 6,30 | 180 000 | 80 000 |
| 7,30 | 200 000 | 100 000 |
| 8,30 | 230 000 | 120 000 |

Inputs per room: `W` (inner width, m), `L` (inner length, m), `bearing`, `correction`, `extra_beams` (int ≥ 0), `force_start_beam`, optional `pattern` override, optional `rate_override`.

Pipeline (round3 = half-away-from-zero to 3 dp, round2 for money):
1. `beam_length = round3(W + 2·bearing)`; `blocks_per_row = ceil(W / 0.20)`.
2. `eff = round3(L + correction)`; `pitches = floor(eff / PITCH)`; `R = round3(eff − pitches·PITCH)`.
3. Auto pattern: `R ≤ 0 → GB`; `R ≤ 0.20 → BGB`; `R ≤ 0.45 → GBG`; else `GB` with `pitches += 1`. Explicit `pattern` override never bumps pitches.
4. Start beam: `GBG && (force_start_beam || extra_beams ≥ 1)` → `pitches += 1; pattern = GB;` and if not forced, `extra_beams −= 1`. `GB && force_start_beam → BGB`. BGB + start → no-op.
5. Counts: GB → beams `pitches`, block rows `pitches`, ext 0. BGB → beams `pitches+1`, rows `pitches`, ext 0.12. GBG → beams `pitches`, rows `pitches+1`, ext 0.45. `beam_count = base + extra_beams`; `total_blocks = blocks_per_row × rows`.
6. Lengths: `billed_length = pitches·PITCH (+0.45 if GBG)`; `slab_length = pitches·PITCH + ext`; `monolith_length = slab_length + extra_beams·0.12` (shown as **Монолит Б**).
7. Areas: `billed_area = beam_length × billed_length`; `monolith_area = beam_length × monolith_length` (shown as **Майдон** and summed into the sheet).
8. Money: `m2_price = rate_override ?? tier(beam_length)`; `m2_cost = round2(billed_area × m2_price)`; `pattern_extra = BGB ? beam_length × extraTier : 0`; `manual_extra = extra_beams × beam_length × extraTier`; `subtotal = m2_cost + pattern_extra + manual_extra`. Footer formula shows `m2_price × billed_area` and `+ (pattern_extra + manual_extra) балка`.
9. Extras-only mode: `L == 0 && extra_beams ≥ 1` → no pattern (chip shows `+Б`), `monolith_length = extra_beams × 0.12`, `subtotal = extra_beams × beam_length × extraTier`, м² fields shown as `—`.
10. Validation: W > 0 required; L > 0 unless extras-only; bearing ≥ 0; extra_beams integer ≥ 0. Invalid → results show `—`, row excluded from totals, subtotal `—`.
11. Project total = Σ subtotal (discount % or amount applied at order placement, capped at subtotal).

Pattern labels: `GB = Г-Б`, `BGB = Б-Г-Б`, `GBG = Г-Б-Г`. Number input accepts both `,` and `.` as decimal separator; display uses `,`.

## 5. Accessibility & quality bar
- Min touch target 44dp (rows are full-width buttons; icon buttons ≥36dp visual inside 44dp hit area).
- Contrast: never alpha-mute body text on light; onDarkMuted only for captions ≥10sp/600.
- Tabular numerals everywhere numbers align vertically.
- Support dynamic type up to 130% without truncating amounts (ellipsize client names first).
- Dark mode: out of scope for v1 (navy sheets already provide dark surfaces).
- Do not introduce Material default colors, elevation overlays, ripple color other than `indigo 12%` on light / `white 12%` on dark.

## 6. Reference files
- `Etalon Mobile v2.dc.html` — interactive reference: prototype (2b), token sheet (2a), calculator (3a — confirmed; 3b table view is NOT to be built).
- `finnova-system.md` — raw extraction notes from the web CRM screenshot.
- `BottomNav.dc.html` — reference implementation of the nav bar.
- Repo: `azizdadabaev/precast-crm` — API, enums, labels (`src/app/(app)/orders`, `payments`), engine `src/services/calculation-engine.ts`, rate override UX `src/components/calculation/RateOverrideDialog.tsx`.

## 7. Acceptance checklist
- Every color/radius/type value in the app resolves to a token in §1; no raw hex outside the theme file.
- Calculator reproduces these fixtures from the web engine (bearing 0,15, corr 0, auto): `5,2×7,1 → Б-Г-Б, 13 балка, 312 ғишт, монолит 7,08 м, майдон 38,94 м², нарх 180 000, сумма 7 330 400` · `4,0×6,0 → Б-Г-Б, 11 балка, 200 ғишт, 5,92 м, 25,46 м², 140 000, 3 749 600` · `3,6×4,5 → Г-Б-Г, 7 балка, 144 ғишт, 4,51 м, 17,59 м², 140 000, 2 462 460`.
- Rate override requires the confirm sheet; reverting to Авто does not.
- Fixed SummarySheet never covers the last room card (190dp content padding).
- Cold start to Home < 1 s on a mid-range device; calculator recomputes synchronously on every keystroke.
