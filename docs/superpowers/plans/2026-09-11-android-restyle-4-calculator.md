# Android Restyle — Phase 4: Calculator (design 3a) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the calculator to the prototype's confirmed design 3a — one scrolling screen of room cards with inline inputs on the system keyboard, a fixed navy summary sheet, the rate sheet with its confirmation, and the place-order sheet that now carries discount, delivery and other costs — keeping every capability the phase-2b calculator has (engine parity, drafts, the offline place-order queue, the share image, the client lookup, the static tiers, the mandatory override reason).

**Architecture:** The docked keypad and the `BottomSheetScaffold` go. Room dimensions become text state per row (`RoomDraft`) parsed on every keystroke into the engine's `SlabRow` doubles inside `:core:calc` (ruling R2 of phase 2a: the only `Double` domain); every figure is rendered from `SlabResult.money()` / `OrderTotals.totalPriceMoney()` as today. The screen is a `LazyColumn` (header, client row/form, room cards, add button) under a fixed navy `SummarySheet` that sits above the nav pill through the new inset-aware clearance. Sheets: `RateSheet` → `RateConfirm` (navy), `PlaceOrderSheet` (white, with the relocated costs), `SummarySettingsSheet` (white, behind ⋯: grid, round-up, beam schedule, weight, clear). Rejected queued orders surface on Home's outbox sheet.

**Tech Stack:** Kotlin 2.4.10, Compose BOM 2026.08.00, Material3 1.4.0, Hilt, Room (drafts), Roborazzi 1.73.0 / Robolectric 4.16.1. No web change.

**Spec:** `docs/superpowers/specs/2026-09-10-android-restyle-design.md` §6 (calculator 3a, D4/D5/D10, kept/relocated, keyboard) and §8 (fixtures through the UI), argued from `docs/superpowers/specs/2026-09-10-etalon-mobile-design-system-v1.1.md` §3.4 (every dp and token of the card, the sheet, RateSheet, RateConfirm). **Visual oracle:** `docs/android/restyle-prototype/3a-calculator.png`. Where the .md and the capture differ, the .md wins; where either differs from the design doc, the design doc wins (the mandatory reason, the five-tab pill, D10).

## Global Constraints

- **The capture is the acceptance test** for the card, the summary sheet and the header; the .md §3.4 is the oracle for RateSheet, RateConfirm and the client form (the capture draws them closed). The reviewer opens the images beside the baselines.
- Light only; no raw hex outside `EtalonColors.kt`; no `MaterialTheme.*`, `LocalEtalonColors`, `EtalonType.mono*`, `SectionLabel`, `StatusStripeCard`, `Chip`/`ChipTone`, Material `Icons.*`, `OutlinedTextField` with default colours, `FilterChip`, `FloatingActionButton`, `DropdownMenu`, `BottomSheetScaffold` in any file this plan touches.
- 48 dp touch targets: every cell, chip, stepper and icon button reserves 48 dp (`minimumInteractiveComponentSize()`), painting the spec's smaller geometry inside it.
- **Money never leaves `Money`** outside `:core:calc`. `Double` appears only where it already does: `SlabRow`/`SlabResult`/`OrderTotals` fields and the `Boundary.kt` crossings (`tierPriceMoney`, `operatorAmountMoney`, `totalPriceMoney`, `SlabResult.money()`). Text → `Double` parsing for dimensions lives in ONE function (`parseDecimal`), tested for `,`, `.`, blank, partial («5,») and junk.
- The engine and its golden tests are untouched. The three §7 fixtures (`5,2×7,1 → 7 330 400`, `4,0×6,0 → 3 749 600`, `3,6×4,5 → 2 462 460`) are asserted THROUGH THE UI in the screen test (type the digits into the cells, read the footer).
- Uzbek Cyrillic strings; the footer formula uses the thin space; `k` in «140k» is the spec's own glyph (Latin `k`, a unit abbreviation — the one exception besides «ETALON», recorded here).
- Gaps and paddings from `EtalonSpace` tokens or the §3.4 named sizes (each declared as a named `private val` with the spec line in its KDoc).
- No new dependency. The keyboard is the system decimal keyboard (`KeyboardType.Decimal`); both `,` and `.` accepted, display uses `,`.
- **Every capability kept:** add/duplicate/delete/reorder rooms, per-room name, width/length/bearing/correction/extra beams/start beam/pattern override/rate override with mandatory reason, grid 5/10 and round-all-up, beam schedule and blocks total, weight, discount %/amount, delivery, other, drafts (save/update, restore across process death), «Тозалаш», place order online, queue offline, rejected-queue notice, the extras-only room rule, client lookup by phone with retry, region pickers, share image, `order.create` gating.
- Verification, from `android/` with `JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"`: `.\gradlew.bat testDebugUnitTest verifyRoborazziDebug assembleDebug --no-daemon --rerun-tasks`. Record per module with `--rerun-tasks`; look at every PNG.
- **Never `git stash`.** Captures go to the plan's workspace `captures/`.

## Rulings

- **R1 — Nav-pill clearance lands here, not in phase 3.** The fixed summary sheet must sit above the pill under every navigation mode, so the inset-aware clearance (`LocalNavPillInset`, `Modifier.navPillPadding()`, `navPillContentPadding()`, `StickyActionBar(clearNavPill)`) is Task 1 of THIS phase, migrating every phase-2 call site and deleting `EtalonSpace.underNav`/`underStickyBar`. Phase 3's Task 2 loses that part.
- **R2 — The auto-equal tier is not an override.** In `RateSheet`, picking «Авто» or the tier the engine would pick clears any override immediately (no reason needed — nothing changes on the quote); any other tier opens `RateConfirm`, whose reason is MANDATORY (D5): «Сабаб (мажбурий)», «Тасдиқлаш» disabled until non-blank, 200-character counter.
- **R3 — Duplicate and reorder stay.** The capture's ⋯ row holds +Б, Бош балка, delete. This app also has duplicate and move; the MoreRow gets a second line: «Нусха олиш» (compact secondary), ↑ / ↓ icon buttons (disabled at the ends). The drag handle goes.
- **R4 — The working-out rows stay, read-only, in the MoreRow** (Монолит узунлиги · Балка узунлиги · Қадам · Қатор · Гишт/қатор) under the controls, as `meta` pairs — the capture shows only the four-column ResultRow, and the .md says nothing; the numbers are what an operator checks against the desk.
- **R5 — Behind ⋯ on the summary sheet** (D10): a white «Созламалар» sheet with the grid chips, «Барча хоналарни юқорилаштириш», the beam schedule («Балка · 4,30 м — 12 дона», «Ғишт · жами»), the weight formula, and «Тозалаш» as a `DangerButton` (with the existing confirmation semantics: clearAll is immediate today — keep immediate, but place it last).
- **R6 — Rejected queued orders move to Home's outbox sheet** (D10): `HomeViewModel` observes `CalculatorRepository.observeRejectedOrders()`; the bell badge counts them; the sheet lists «{client} · {message}» rows with «Тушунарли» (`discardRejectedOrder`). The calculator's own banner goes.
- **R7 — The summary sheet's figures**: total via `MoneyHeroText`-style two runs (26/800 figure + «UZS» 12/600 at 70 % AFTER the figure, as the capture draws it — the one place the unit follows the number, recorded in phase 1's Task 4 carry); right column «**{area} м²** · {beams} балка · {blocks} ғишт» / «~{weight} кг».
- **R8 — Empty state**: with no rooms the list shows one empty room card («Хона 1», blank cells) rather than a text notice — the capture never shows an empty calculator, and a blank card is what the operator types into. `addRoom()` on first open when the draft is empty.
- **R9 — Client form**: `FormCard` with «Исм*», «Тел рақам*» (`+998 90 ___ __ __` mask display), «Вилоят» | «Туман» two-column `RegionField`s, «Манзил». Collapsed to the one-line `ClientRow` once phone AND name are set (today's rule), expanded when empty; the chevron toggles.

---

## File map

**Design system (Task 1):** `components/NavPill.kt` (new), `StickyActionBar.kt`, `EtalonDimens.kt`, `EtalonTextField.kt` (new: `EtalonTextFieldDefaults.colors()`, `EtalonTextField`), `EtalonIcons` (+ `Pencil` exists; + `ChevronDown` exists; + `ArrowUp`/`ArrowDown` new Lucide `arrow-up`/`arrow-down`; + `Copy` new Lucide `copy`; + `Settings2` new Lucide `settings-2` for the summary ⋯ — or reuse `Ellipsis`; use `Ellipsis`), `app/nav/EtalonNavHost.kt` (provide the inset), the phase-2 call sites.

**Calculator:** `CalculatorUiState.kt` (`RoomDraft`, no keypad), `CalculatorViewModel.kt` (text intents, pattern cycle, rate rules, draft persistence of the text), `CalculatorScreen.kt` (rewrite), `CalculatorRoute.kt`, `RoomCard.kt` (rewrite), `RoomExtras.kt` → `MoreRow.kt`, `ClientBar.kt` → `ClientRow.kt` + `ClientForm.kt`, `TotalsSheet.kt` → `SummarySheet.kt` + `SummarySettingsSheet.kt`, `RateOverrideSheet.kt` → `RateSheet.kt` + `RateConfirm.kt`, `PlaceOrderSheet.kt` (rewrite), `QuoteImage.kt` (restyle), `res/values/strings.xml`, tests: `CalculatorViewModelTest.kt` (keypad cases rewritten as text cases), `CalculatorScreenshotTest.kt` (rewrite), `TotalsSheetScreenshotTest.kt` → `SummarySheetScreenshotTest.kt`, `RateSheetTest.kt`, `PlaceOrderSheetStateTest.kt` (extended), `QuoteCardScreenshotTest.kt` (re-record), `ClientBarStateTest.kt`, `RoomExtrasStateTest.kt` → `MoreRowStateTest.kt`; delete the `*_dark.png` and `calculator_fab_keypad_*`.

**Home:** `HomeViewModel.kt` (+ rejected orders), `OutboxSheet.kt` (rows), strings, `HomeScreenshotTest` (+ a rejected row frame), `HomeViewModelTest`.

---

### Task 1: Design system — inset-aware nav-pill clearance, text field, three glyphs

(Identical to phase 3's Task 2 clearance half, moved here by R1.)

**Produces:**
```kotlin
// NavPill.kt
val LocalNavPillInset: ProvidableCompositionLocal<Dp>              // default 0.dp
private val NAV_PILL_BAND = 84.dp                                   // 12 + 60 + 12 (§4 bar + margins)
@Composable fun navPillInsetOf(): Dp = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + NAV_PILL_BAND
@Composable fun Modifier.navPillPadding(): Modifier = padding(bottom = LocalNavPillInset.current)
@Composable fun navPillContentPadding(start: Dp = 0.dp, top: Dp = 0.dp, end: Dp = 0.dp, extraBottom: Dp = 0.dp): PaddingValues
// StickyActionBar.kt
fun StickyActionBar(clearNavPill: Boolean = true, content: RowScope.() -> Unit)   // drops its own navigationBarsPadding when clearing (the inset contains it); bottomInset param removed
object StickyActionBarDefaults { val height: Dp = 88.dp }           // 16 scrim + 12 + 48 + 12
// EtalonTextField.kt
object EtalonTextFieldDefaults { @Composable fun colors(): TextFieldColors }
@Composable fun EtalonTextField(value: String, onValueChange: (String) -> Unit, modifier: Modifier = Modifier, placeholder: String? = null, singleLine: Boolean = true, keyboardOptions: KeyboardOptions = KeyboardOptions.Default, visualTransformation: VisualTransformation = VisualTransformation.None, textStyle: TextStyle = EtalonType.body, prefix: String? = null, isError: Boolean = false, supportingText: String? = null)
// EtalonIcons: ArrowUp, ArrowDown, Copy (Lucide arrow-up / arrow-down / copy, 24 dp, 2 dp stroke)
```
- `EtalonDimens.kt`: delete `underNav`, `underStickyBar` — the compile errors are the migration list: `HomeScreen`, `OrdersListScreen`, `OrderDetailScreen` (`bottomInset` → gone; list bottom `LocalNavPillInset.current + StickyActionBarDefaults.height`), `CalculatorScreen` (temporary: `navPillPadding()` on the scaffold until Task 4 replaces the scaffold), `ClientsScreen`, `ConfirmQueueScreen`, `RecordPaymentScreen`, `ClientDetailScreen`, `DiscrepanciesScreen`, the nine lifted logistics/payment screens (drop the `Box` lift; `StickyActionBar` clears by itself), `PhotoCapture`, `LogisticsScreenshotTest` previews.
- `EtalonNavHost.kt`: `CompositionLocalProvider(LocalNavPillInset provides if (locked) 0.dp else navPillInsetOf()) { NavDisplay(...) }`.
- Tests: `NavPillTest` (`navPillInsetOf()` = inset + 84 under fake insets of 24 and 48; default local 0; `StickyActionBar` bottom ≥ inset under a provided 132 dp), icon sheet re-record, `ds_kept` sample of `EtalonTextField` (idle, focused, error, prefix «+998 »).
- Re-record every baseline that moves (Robolectric's inset is 0, so the band is 84 vs the old 100: most lists move 16 dp — list them with the delta).
- Emulator: gesture nav AND three-button nav (`adb shell cmd overlay enable com.android.internal.systemui.navbar.threebutton`, then `…navbar.gestural` back): Orders, Order detail, Clients, Record payment — nothing covered; capture both modes.
- Commit: `Feat(designsystem) · inset-aware nav-pill clearance replaces underNav and the lifts` + `Feat(designsystem) · text-field colours and three glyphs`.

---

### Task 2: ViewModel — text-driven cells, pattern cycle, rate rules, no keypad

**Files:** `CalculatorUiState.kt`, `CalculatorViewModel.kt`, `CalculatorViewModelTest.kt`, `RoomExtrasStateTest.kt` → `MoreRowStateTest.kt` (if it tests state only), `core/calc` untouched; the Room draft entity gains the draft texts (migration 7→8: `calculator_draft` stores `rowDrafts` JSON beside the rows — or derive the text from the doubles on restore; ruling: DERIVE on restore with `formatDecimal(v, 2)` → «5,20», store nothing new; a room restored from a draft shows «5,20», typed text is kept only in memory).

**Produces:**
```kotlin
data class RoomDraft(val width: String = "", val length: String = "", val bearing: String = "0,15", val correction: String = "0")
// CalculatorUiState: keypad, keypadText REMOVED; + val drafts: Map<String, RoomDraft> = emptyMap()
//   + val clientFormOpen: Boolean (replaces clientBarCollapsed semantics: open when phone or name is blank; toggled by the chevron)
//   + val toast: String? (replaces saveMessage for the toast path; saveMessage kept for the queued notice text)
// ViewModel:
fun setWidthText(id: String, text: String)      // keeps the text verbatim (filtered to digits, one separator), parses with parseDecimal, applies innerWidth, recomputes
fun setLengthText(id: String, text: String)
fun setBearingText(id: String, text: String)
fun setCorrectionText(id: String, text: String)
fun cyclePattern(id: String)                     // null → GB → BGB → GBG → null
fun pickRate(id: String, price: Double?)         // null or the auto tier → clearRateOverride; else state.rateConfirm = RateConfirmState(id, price)
fun confirmRate(reason: String)                  // applyRateOverride(id, price, reason) when reason.isNotBlank(); closes rateConfirm
fun dismissRateConfirm()
fun toggleClientForm()
fun moveRoomUp(id: String) / moveRoomDown(id: String)   // over moveRoom
fun dismissToast()
// REMOVED: KeypadTarget, openKeypad, keypadDigit, keypadBackspace, setKeypadText, commitKeypad, nextField, closeKeypad
// KEPT: addRoom, duplicateRoom, deleteRoom, moveRoom, setName, bumpWidth, setExtraBeams, setBearing, setCorrection, setForceStartBeam, setPattern, applyRateOverride, clearRateOverride, discount/delivery/other setters, setGrid, roundAllWidthsUp, toggleExpanded, clearAll, saveDraft, placeOrder, queuePlaceOrder, consumePlacedOrder, discardRejectedOrder, the client-bar intents, retryClientLookup
```
`parseDecimal(text: String): Double?` in `CalculatorUiState.kt`: accepts `,` or `.`; blank/junk → null (the row keeps 0.0 and the draft text); a trailing separator («5,») → 5.0 while the text stays «5,».

- [ ] Tests (rewrite the keypad cases as text cases): typing «5,2» then «7,1» into a room yields `result.money().subtotal == Money.parse("7330400.00")` (fixture 1) and recomputes on every keystroke («5», «5,», «5,2»); «.» is accepted like «,»; blank → 0 and `canPersist == false`; `cyclePattern` order; `pickRate(auto tier)` clears an existing override; `pickRate(other)` sets `rateConfirm` and `confirmRate("")` does nothing; `confirmRate("Мижоз билан келишилди")` applies; restore from a draft yields drafts «5,20»/«7,10»; `moveRoomUp` at index 0 is a no-op; `clientFormOpen` is true on a blank client and false once phone + name are set.
- [ ] Commit: `Feat(android) · calculator state typed in the cells: text drafts, pattern cycle, rate rules`.

---

### Task 3: RoomCard 3a and MoreRow

**Files:** `RoomCard.kt` (rewrite), `RoomExtras.kt` → `MoreRow.kt`, strings, `CalculatorScreenshotTest.kt` (card frames).

**Oracle:** the capture's three cards + §3.4 RoomCard 1–5.

**Composition** (`Column(surface, xl, hairline, padding(horizontal = 14, top = 12, bottom = 10))`, cards `spacedBy(10)`):
1. Title row: `BasicTextField(name, textStyle = rowTitle.copy(W800, 14.sp), singleLine, weight 1)` (borderless, placeholder «Хона»); `PatternChip` h26 pill: label «Г-Б»/«Б-Г-Б»/«Г-Б-Г» 11/700 + « авто» 10/600 at 70 % when `patternOverride == null` (`lavenderBg`/`indigo`); override → `indigo`/`onDark`, no suffix; tap `cyclePattern`; extras-only row → chip hidden. `EtalonIconButton(Ellipsis, size 28, shape pill, tint ink)` with `lavenderBg` fill when expanded.
2. InputRow `Row(spacedBy(5))` weights 1 / 1 / 0.9 / 0.9 / 1.3:
   - `DimCell(caption «Эни»/«Бўйи», text, onText)`: `lavenderBg`, `md`, `padding(horizontal = 8, vertical = 6)`, caption 10/600 `indigo`, value `BasicTextField` 15/700 tabular `ink`, `KeyboardType.Decimal`, placeholder «0,00» `ink3`; `imeAction` Next → the next cell (Эни → Бўйи → next room's Эни; the last → Done).
   - `HairCell(caption «Таяниш»/«Корр.», text)`: `page` bg, hairline, `md`, `padding(horizontal = 7, vertical = 5)`, caption 10/600 `ink2`, value 13/600.
   - `RateCell`: same geometry as HairCell; caption row «Нарх/м²» + 10 dp `ChevronDown`; value «140k · авто» (13/700 + 10/600 at 70 %); overridden → `indigo` bg, `onDark` text, «140k · қўлда». `formatRateK(price: Double): String` = `tierPriceMoney(price)` in thousands: «140k» (a new formatter in the calculator module, tested: 140000 → «140k», 162500 → «162,5k»). Tap opens `RateSheet`.
   Each cell reserves 48 dp of height via `minimumInteractiveComponentSize()` on the cell, painting the spec's height inside.
3. `MoreRow` (when `expanded`): `Row(spacedBy(6), h40)`: `StepperCell(«+Б қўшимча», value, −/+)` (the existing `CountStepper` restyled: label left, value 15/700 right); `ToggleCell(«Бош балка», on)` (`page`/hairline; on → `navy` bg, `onDark`, 16 dp check box radius 5); delete `EtalonIconButton(Trash, shape md, tint red)` → `redBg` on press. Second line: `SecondaryButton(«Нусха олиш», compact, leadingIcon Copy)`, `EtalonIconButton(ArrowUp)`, `EtalonIconButton(ArrowDown)` (R3). Third block: the five working-out pairs as `meta` (R4).
4. `ResultRow`: top hairline, `padding(top = 10)`, four equal columns: caption 10/600 `ink3` + value 15/700 with 11/500 `ink2` unit: «Монолит Б x,xx м» · «Балка N та» · «Ғишт N та» · «Майдон x,xx м²» (right-aligned). Extras-only row: Монолит and Майдон «—».
5. Footer `Row(top = 8)`: left `meta` ink2 «{rate} × {billed} м²» + « + {extras} балка» when > 0 (from `SlabResult`: `tierPriceMoney(r.appliedRate)` × `formatArea(billedArea)`; extras cost = `r.money().subtotal − rate × billed`); right subtotal 16/800 tabular `formatMoney`.
6. Extras-only notice kept as `NoticeBanner` under the footer.

**Strings** (add/keep): `calc_pattern_auto_suffix` «авто», `calc_rate_manual_suffix` «қўлда», `calc_rate_cell` «Нарх/м²», `calc_more_extra_beams` «+Б қўшимча», `calc_more_start_beam` «Бош балка», `calc_out_monolith` «Монолит Б», `calc_out_beams` «Балка», `calc_out_blocks` «Ғишт», `calc_out_area` «Майдон», `calc_footer_formula` «%1$s × %2$s м²», `calc_footer_extras» « + %1$s балка», `calc_room_placeholder` «Хона».

**Baselines:** `calculator_room_light` (the capture's «Зал» card exactly: 5,2 × 7,1, Б-Г-Б авто, 180k · авто, 7,08 м · 13 та · 312 та · 38,94 м², «180 000 × 38,28 м² + 440 000 балка», 7 330 400), `calculator_room_more_light` (expanded), `calculator_room_override_light` (rate overridden, manual pattern), `calculator_room_font13`.

- [ ] Commit: `Feat(android) · RoomCard rebuilt to design 3a: inline cells, pattern chip, rate cell, more row`.

---

### Task 4: Screen, header, client row/form, add button, summary sheet

**Files:** `CalculatorScreen.kt` (rewrite), `CalculatorRoute.kt`, `ClientBar.kt` → `ClientRow.kt` + `ClientForm.kt`, `TotalsSheet.kt` → `SummarySheet.kt` + `SummarySettingsSheet.kt`, strings, `CalculatorScreenshotTest.kt` (screen frames), `SummarySheetScreenshotTest.kt`, `ClientBarStateTest.kt`.

**Oracle:** the capture (header, client row, cards, summary) + §3.4 Header/ClientRow/ClientForm/AddRoomButton/SummarySheet.

**Composition:** `Box(page, statusBarsPadding)`:
- `LazyColumn(contentPadding = navPillContentPadding(top = 0, extraBottom = SUMMARY_CLEARANCE) )` with `SUMMARY_CLEARANCE = 190.dp` (§3.4): item header (`Row(padding(horizontal = 16, vertical = 10))`: `EtalonIconButton(ArrowLeft, 40, pill)` → back; `Column`: «Калькулятор» `titleSm`, «N хона · нарх балка узунлигига қараб» 11 `ink2`; `SecondaryButton(«Чизиш», compact, leadingIcon Pencil, enabled = false)`); item `ClientRow` (white xl, `padding(horizontal = 12, vertical = 10)`, margin 12/16: 34 dp `lavenderBg` circle + `User` icon `indigo`; name 13/700 or «Мижоз танланмаган»; meta 11 `ink3` «phone · viloyat, tuman» or «Исм, телефон ва манзилни киритинг»; `ChevronDown` rotating 180° when open; tap `toggleClientForm`); item `ClientForm` when open (`FormCard`: «Исм*» `EtalonTextField`, «Тел рақам*» `EtalonTextField(prefix «+998 », keyboard Phone, visualTransformation = the mask «90 ___ __ __»)`, `Row` of two `RegionField`s «Вилоят» | «Туман», «Манзил» `EtalonTextField(placeholder «Кўча, маҳалла, бино, хонадон»)`; lookup error `ErrorBanner` with retry); banners (`error`, no-write-permission); `items(rows)` → `RoomCard`; item `AddRoomButton` (h46, dashed 1 dp `lavender`, `xl`, «+ Янги хона» 13/700 `indigo`; reuse `Modifier.dashedTileBorder` if its radius parameter allows, else a local dashed border reading `EtalonShapes.xl`).
- `SummarySheet` fixed: `Box(align BottomCenter).navPillPadding()`: gradient scrim above (`BottomNavScrim`-like, 24 dp), the navy sheet `margin(horizontal = 10, bottom = 10)`, `sheet` radius, `padding(horizontal = 16, top = 14, bottom = 12)`: left `Column`: «Жами» `tagPanel` `onDarkMuted`, figure `amountLg.copy(26.sp, W800)` + « UZS» 12/600 at 70 % after it (R7); right `Column(End)` 11 `onDarkMuted` line-height 1.5: «**{area} м²** · {beams} балка · {blocks} ғишт» (area in `onDark` W700) / «~{weight} кг». Action row `padding(top = 12)`, `spacedBy(8)`: `DarkButton(leadingIcon Save)` 46 dp pill → `saveDraft` (`loading = saving`); `DarkButton(leadingIcon Send)` → share (Task 6 wires); `DarkButton(leadingIcon Ellipsis)` → `SummarySettingsSheet` (R5); `InverseButton(«Буюртма бериш», weight 1)` → `PlaceOrderSheet` (Task 5); hidden entirely without `canWrite` except the share button.
- `EtalonToast` for `saveMessage`/`toast`; `error` as `ErrorBanner` item at the top of the list.
- `SummarySettingsSheet` (white `ModalBottomSheet`): `FormCard`: «Лабораторий ўлчам» → two `EtalonFilterChip`s «10 см»/«5 см»; «Барча хоналарни юқорилаштириш» `SecondaryButton`; «Балка + Ғишт» list rows «Балка · 4,30 м — 12 дона» + «Ғишт · жами N та» (or «Ҳозирча балка йўқ.»); «Жами маҳсулот оғирлиги» «{area} м² × 180 = {kg} кг»; `DangerButton(«Тозалаш»)` last.
- R8: on first composition with no rows and no draft, `addRoom()`.

**Strings** (add): `calc_title` «Калькулятор», `calc_subtitle` «%1$d хона · нарх балка узунлигига қараб», `calc_draw` «Чизиш», `calc_client_none` «Мижоз танланмаган», `calc_client_hint` «Исм, телефон ва манзилни киритинг», `calc_client_name_req` «Исм*», `calc_client_phone_req` «Тел рақам*», `calc_client_address` «Манзил», `calc_client_address_hint` «Кўча, маҳалла, бино, хонадон», `calc_add_room_new` «+ Янги хона», `calc_summary_total` «Жами», `calc_summary_line` «%1$s · %2$s балка · %3$s ғишт», `calc_summary_weight` «~%1$s кг», `calc_settings_title` «Созламалар`.

**Baselines:** `calculator_light` (the capture: Karimov LLC collapsed row, Зал / Хона 1 / Ошхона, summary 13 542 460 · 81,98 м² · 31 балка · 656 ғишт · ~14 757 кг — the engine gives these from the three fixtures; assert the subtotals through the UI per §8), `calculator_client_form_light` (form open, blank client), `calculator_font13`, `summary_settings_light`.

- [ ] Commit: `Feat(android) · Calculator screen rebuilt to design 3a: header, client row, fixed navy summary`.

---

### Task 5: RateSheet, RateConfirm, PlaceOrderSheet with the relocated costs

**Files:** `RateOverrideSheet.kt` → `RateSheet.kt` + `RateConfirm.kt`, `PlaceOrderSheet.kt` (rewrite), `CalculatorViewModel.kt` (place-order carries discount/delivery/other from the sheet — the state fields exist; the sheet edits them), strings, `RateSheetTest.kt` (new; from `RateOverrideSheetTest`), `PlaceOrderSheetStateTest.kt` (+ costs), screenshot frames.

**RateSheet** (white `ModalBottomSheet`, `sheet` radius 22, inset 10, `padding(horizontal = 16, top = 14, bottom = 14)`): caption «М² нархи · {room}» 11/600 `ink2`; title «Тарифни танланг» 16/800; six rows h46 `lg` gap 6: «Авто» (sub «{autoRate} · енг тарифи») then the five catalogue tiers («140 000» … sub «балка ≤ 4,30 м» from `M2_OVERRIDE_TIERS[i].maxBeamLength`); selected row `indigo`/`onDark`; the tier equal to auto carries an «авто» mini tag (`lavenderBg`/`indigo`). Tap → `pickRate(id, price)` (R2).

**RateConfirm** (navy 22 pad 10 → `indigoPanel` 18 pad 16×14 — the phase-1 `ConfirmSheet` nesting, but with a text field: build it on the same tokens as a `ModalBottomSheet` with navy container): caption «Нархни ўзгартириш · {room}», helper 12 `onDarkMuted` «Фақат шу хона учун. Авто-га қайтариш енг тарифини тиклайди.», two tiles: «Авто {rate}» (`indigoTile`) and «Танланган {rate} ↑ устама / ↓ чегирма» (white tile, direction `red`/`green`); reason `EtalonTextField`-like on dark (white 14 % bg, `md`, h42) labelled «Сабаб (мажбурий)» with «n / 200» counter; footer `DarkButton(«Бекор»)` + `InverseButton(«Тасдиқлаш», enabled = reason.isNotBlank())`.

**PlaceOrderSheet** (white): title «Буюртмани расмийлаштириш» `sectionTitle`; client tile (name, phone, address); `FormCard`: «Етказиб бериш санаси» value row → bounded `DatePickerDialog` (token colours); «Изоҳ» `EtalonTextField` + counter; **relocated (D10):** «Чегирма» with two chips «%» / «сўм» and an `EtalonTextField(keyboard Number)` parsed to `Double` through `parseDecimal` → `setDiscountPercent`/`setDiscountAmount`; «Етказиб бериш» and «Бошқа харажат» `EtalonTextField`s → `setDeliveryCost`/`setOtherCost` (`operatorAmountMoney` for display); summary rows «Хоналар N» · «Майдон» · «Хоналар жами» · «Чегирма −…» · «Етказиш» · «Бошқа» · «Жами» (`orderTotals.totalPriceMoney()`); unpersistable-rooms notice; error; `PrimaryButton(«Буюртма бериш»)` (+ «Навбатга қўйиш» when `queueOffered`). Toast «Буюртма № … қабул қилинди» on success is the existing navigation-to-detail (keep).

**Baselines:** `rate_sheet_light`, `rate_confirm_light`, `place_order_light` (with a discount and delivery), `place_order_queue_light`.

- [ ] Commit: `Feat(android) · rate sheet with its confirmation; place-order sheet carries discount, delivery and other`.

---

### Task 6: Share image, Home outbox for rejected orders, retire the keypad path

**Files:** `QuoteImage.kt` (restyle the card to the new room card + summary look, `BrandMark`-style header), `HomeViewModel.kt` + `OutboxSheet.kt` + strings (R6), `CalculatorRepository` unchanged, `QuoteCardScreenshotTest` re-record, `HomeScreenshotTest` (+ `home_outbox_rejected_light` via `captureScreenRoboImage`), `HomeViewModelTest` (+ rejected rows in the badge count), delete `calculator_fab_keypad_*`, `*_dark.png`, `totals_sheet_*`, the docked keypad branch, `KeypadTarget`, `ROOM_LIST_HEADER_OFFSET`, `RoomExtrasCallbacks` (replaced by explicit callbacks).

- [ ] Commit: `Feat(android) · quote card restyled; rejected queued orders surface on Home's outbox`.

---

### Task 7: Close the phase — sweep, verification, owner captures

- [ ] Orphan sweep (keypad names, `TotalsSheet`, `ClientBar`, `RoomExtras`, `RateOverrideSheet`, `calc_action_next`, `calc_extras`, `calc_action_reorder`, `calc_field_*` that the cells replaced, `calc_rooms_subtotal`… — delete only unused strings).
- [ ] Standard command with `--rerun-tasks`: all modules; report counts.
- [ ] Emulator captures to the workspace: calculator with three rooms (the capture's values typed by hand: 5,2×7,1 / 4,0×6,0 / 3,6×4,5 — the summary must read 13 542 460), the ⋯ more row, the rate sheet, the rate confirm, the place-order sheet, the settings sheet, Home's outbox with a rejected order if the dev server can produce one (do NOT place real orders against production — the debug build targets the local dev server only).
- [ ] Commit any sweep: `Chore(android) · retire the docked calculator keypad and the totals scaffold`.

---

## Carried for phase 3 (amend its plan)
- Phase 3 Task 2 loses the clearance and `EtalonTextField` (both land here); it keeps `OrderRow.trailing`, `SegmentedControl(fill)`, `TonalButton`, compact geometry, `BrandMark`, «Лойиҳа», grouped keypad echo.

## Self-review
- Spec §6 coverage: header/«Чизиш» (T4), client row+form (T4), room card rows 1–5 (T3), add button (T4), summary sheet + 190 dp (T4), settings behind ⋯ (T4, R5), RateSheet/RateConfirm with mandatory reason (T5, R2), place-order relocation (T5), rejected banner → Home (T6), share image restyle (T6), keyboard rule (T2/T3), kept list (T2 + every task's "kept" lines).
- §8: fixtures through the UI (T4's screen test), `verifyRoborazziDebug`, the hex lint, override requires confirm / auto does not (T2 tests), summary never covers the last card at 1.3 (T4 font13 frame with three rooms scrolled to the end).
- Type consistency: `RoomDraft`/`parseDecimal`/`setWidthText` (T2) used by `DimCell` (T3); `pickRate`/`confirmRate` (T2) used by T5's sheets; `LocalNavPillInset`/`navPillContentPadding` (T1) used by T4; `StickyActionBarDefaults.height` (T1) used by the migrated `OrderDetailScreen`; `formatRateK` (T3) used by T5's RateSheet subs.
