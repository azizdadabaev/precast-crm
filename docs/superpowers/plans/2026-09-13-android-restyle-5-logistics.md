# Android Restyle — Phase 5: Logistics (the driver's screens) + shim retirement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the seven driver screens — LoadTruck, ShipmentLoad, DeliveryProof (camera-first), Shipments, Dispatch, Drivers, DeliveryLocation — and the shared `PhotoCapture` flow to the design system, exactly as every other screen was in phases 2–4, then retire the phase-1 `LegacyTokens` shim, the `EtalonType.mono*` aliases and the legacy chip/card/label components so no Material default survives anywhere in app code.

**Architecture:** Every screen is recomposed from the design-system components (`DetailPanel`/`NavySheet`/`OrderRow`/`FormCard`/`FormField`/`EtalonTextField`/`MoneyHeroText`/`NumericKeypadSheet`/`CountStepper`/`PhotoStrip`/`Lightbox`/`DriverPicker`/`StatusTag`/`ConfirmSheet`/`StickyActionBar`/`EtalonToast`) with the phase-2/3 screens as the idiom precedent. Every route, ViewModel, permission and offline/outbox rule stays as it is (design D9): only the composition changes. The last task deletes the shim and adds a lint so the legacy APIs cannot come back.

**Tech Stack:** Kotlin 2.4.10, Compose BOM 2026.08.00, Material3 1.4.0, Navigation 3, Hilt, CameraX (existing), Google Maps Compose (existing, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`-gated tile), Roborazzi 1.73.0 / Robolectric 4.16.1.

**Spec:** `docs/superpowers/specs/2026-09-10-android-restyle-design.md` — D9 (no logistics cell; entry points from the order detail and Home), §4 shell, §5.1a (the driver's jobs: Load / Deliver), §5.2 mapping rows (Dispatch, Drivers, LoadTruck/ShipmentLoad/DeliveryProof, Shipments, DeliveryLocation), §7 numbers, §8 testing; the design system `docs/superpowers/specs/2026-09-10-etalon-mobile-design-system-v1.1.md` §2–§3. **There is no prototype frame for these seven** (D2 extrapolation): the oracle is the mapping row plus the phase-2/3 baselines named per task; every screen is shown to the owner on the emulator before its task closes.

## Global Constraints

- **The mapping row + the named idiom baselines are the acceptance test**; the reviewer opens the images side by side.
- Light only: new frames `_light` + `_font13`; every `*_dark.png` of a rebuilt screen is deleted with its test rewrite.
- No raw hex outside `EtalonColors.kt`; no `MaterialTheme.*`, `LocalEtalonColors`, `EtalonType.mono*`, `LegacyTokens`, `StatusStripeCard`, `SectionLabel`, `StatusChip`/`PaymentStatusChip`/`DiscrepancyStatusChip`/`ShipmentStatusChip`/`DriverStatusChip`, Material `Icons.*`, `Scaffold`/`TopAppBar`, `OutlinedTextField` with default colours in any file this plan touches. After Task 6 these are gone from the whole tree and a lint keeps them out.
- 48 dp touch targets; the camera shutter and retake/use controls ≥ 56 dp.
- Numbers per D8 (`formatMoney` bare in rows, `MoneyHeroText` for the amount hero, `formatArea`, thin space U+202F, `Money` end to end — the collected cash amount is `Money`; no `Double`/`Long`).
- Uzbek Cyrillic strings, module-prefixed (`logistics_*`, `capture_*`), no cross-module name collision; the wordmark «ETALON» is the only Latin.
- Every existing capability kept, per task's "Kept" list: the offline outbox for photos (queued loads/proofs, retry/cancel rows), the beam allowance and `beamLengthKey` on ShipmentLoad, the cash-shortfall rule on DeliveryProof, the driver-returned toggle, the delivery-location link/manual/GPS paths, driver create/activate with `driver.manage`, every permission gate, every `isOffline` refusal.
- IME rule R13: every rebuilt root with a text field gets `imePadding()`; a sticky bar hides while `WindowInsets.isImeVisible` (the `barVisible` seam defaulting to production); the pill inset already nets the IME.
- Gate rule (phases 3–4): where a navy `ConfirmSheet` gate is added, it opens only when the ViewModel would accept the submit; otherwise the tap reaches the VM so the Uzbek reason lands in the banner; every gate has a behaviour test with the negative cases incl. offline.
- Nav-pill clearance: these screens are pushed over the shell (the pill is drawn); every list uses `navPillContentPadding`, every sticky bar `StickyActionBar` (clears the pill by default).
- Verification, from `android/` with `JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"`: `.\gradlew.bat testDebugUnitTest verifyRoborazziDebug assembleDebug --no-daemon --rerun-tasks` (`--rerun-tasks` mandatory), builds in the FOREGROUND, one at a time, never while capturing on the emulator. Record with `:feature:<module>:recordRoborazziDebug --rerun-tasks` and look at every PNG.
- **Never `git stash`.** Captures to the plan's workspace `captures/`. The debug build targets the LOCAL dev server only; walking a dev order through load → dispatch → deliver on the local server is fine and expected; never production.

## Rulings

- **R1 — Entry points unchanged (D9).** LoadTruck/DeliveryProof/Shipments/DeliveryLocation stay reached from the order detail's action bar and cards; ShipmentLoad and Dispatch from the per-order Shipments screen; Drivers from Home's avatar sheet. No new nav keys, none removed.
- **R2 — Shipments stays a per-order screen.** The design's "render inside the detail" was implemented in phase 2 as a per-order route reached from the detail («Юклар»); embedding is not done here — the screen is restyled as `NavySheet` rows per its mapping row.
- **R3 — Camera flow untouched.** `PhotoCapture` keeps CameraX, the permission flow, `CaptureState`, the prepared-image pipeline (`ImagePrep`) and the outbox hand-off; only its chrome is restyled (Task 1).
- **R4 — Money on the driver's screens.** DeliveryProof's collected amount = `MoneyHeroText` tappable → `NumericKeypadSheet` (grouped echo), «Кутилган» / «Камомад» / «Ортиқча» metas in `Money`; Dispatch's cash-to-collect the same; no `OutlinedTextField` for money.
- **R5 — Result summaries as indigo tile grids** (mapping row): after a load/proof is submitted or queued, the screen's "done" state shows a 2-column grid of `indigoTile`s (`ConfirmTile` geometry: caption + value) — «Балка», «Ғишт», «Расм», «Навбатда»/«Юборилди» — before popping back.
- **R6 — StatusTag replaces the two remaining chips.** `ShipmentStatusChip` → `StatusTag` gains a `ShipmentStatus` overload (families: PENDING neutral, LOADED accent, DISPATCHED accent, DELIVERED positive); `DriverStatusChip` → a two-value `StatusTag` overload (`Boolean active`: «Фаол» positive / «Нофаол» neutral). Palettes ROW_ON_LIGHT / ROW_ON_NAVY as the existing overloads.
- **R7 — The load screens carry the job (§5.1a Load).** ShipmentLoad shows the order's load list (beam lengths × counts from `allowance`, «Ғишт» total) as the stepper rows — the driver reads what goes on the truck on the same screen he counts it; LoadTruck (whole-order photo) shows the order's load list read-only above the camera.
- **R8 — DeliveryLocation has no in-app map (corrected 2026-09-14).** The screen hands the pin to the phone's maps app through an `ACTION_VIEW geo:` intent; `DeviceLocation` (GPS) is untouched. The pin state is a white card: coordinates in tabular figures, the label, and a `TonalButton(«Харитада очиш», MapPin)` → the intent; the controls (link field + «Топиш», coordinates field + «Қўллаш», label, «Менинг жойим», sticky Save/Clear) become `FormCard` fields. No API key is involved.
- **R9 — Shim retirement is the last task's job** and must leave zero hits for `LegacyTokens`, `EtalonType.mono`, `MaterialTheme.colorScheme`/`typography`, `LocalEtalonColors` (outside `EtalonTheme`), `androidx.compose.material.icons`, and the six legacy components — including `NumericKeypadSheet.kt` and `RegionPicker.kt`, which still read `MaterialTheme.*` today. A `NoLegacyApiTest` beside `NoRawHexTest` walks `src/main` and fails on any of them.
- **R10 — Deleted dark frames are not lost coverage**: phase 3's review proved the `_dark` frames were byte-identical to `_light` (the theme never had a dark palette).

---

## File map

**Design system**: `StatusTag.kt` (+`ShipmentStatus` and driver-active overloads), `CountStepper.kt` (verify restyled in phase 1; add `onDark` if Shipments needs it), `DriverPicker.kt` (verify), `ConfirmSheet.kt` (`ConfirmTile` reused for the result grids), `NumericKeypadSheet.kt` + `RegionPicker.kt` (last `MaterialTheme.*` reads → tokens, Task 6), `LegacyTokens.kt` DELETED, `EtalonTypography.kt` (`mono*` aliases deleted), `StatusStripeCard.kt`/`SectionLabel.kt`/`StatusChip.kt` DELETED (Task 6), `EtalonIcons` (+`Camera`, `RefreshCw`, `MapPin`, `Navigation`, `Phone` if missing — check), tests `NoLegacyApiTest.kt` (new).

**Feature capture**: `PhotoCapture.kt` (chrome), `CaptureState.kt` (unchanged), `feature/capture/src/test/.../PhotoCaptureScreenshotTest.kt` (new: preview placeholder, captured state, permission-denied state — light + font13; the camera preview itself is a Robolectric placeholder box).

**Feature logistics**: `loadtruck/LoadTruckScreen.kt`, `shipments/ShipmentLoadScreen.kt`, `delivery/DeliveryProofScreen.kt`, `shipments/ShipmentsScreen.kt`, `dispatch/DispatchScreen.kt`, `drivers/DriversScreen.kt`, `location/DeliveryLocationScreen.kt` (rewrites; ViewModels untouched unless a "done" field for R5 is needed), strings, `LogisticsScreenshotTest.kt` (rewritten per screen: light + font13, `*_dark` deleted), gate tests where a gate is added (`DeliveryProofGateTest`, `DispatchGateTest`).

**App**: nothing (R1) except `EtalonNavHost.kt` if a route signature gains a `now`/`today` param for deterministic frames.

---

### Task 1: `PhotoCapture` chrome + capture glyphs + the two StatusTag overloads

**Files:** `feature/capture/.../PhotoCapture.kt`, `core/designsystem/.../icon/EtalonIcons.kt` (+ Lucide `camera`, `refresh-cw`, `check`, `x` already), `core/designsystem/.../components/StatusTag.kt` (+ overloads, R6), designsystem strings (`ds_status_shipment_pending/loaded/dispatched/delivered` «Кутилмоқда/Юкланди/Йўлда/Етказилди», `ds_driver_active/inactive` «Фаол/Нофаол»), `feature/capture/.../strings.xml` (`capture_*`), tests: `PhotoCaptureScreenshotTest` (new), `StatusTagScreenshotTest` (+ the new overloads on light and navy; `ds_status_tag_light` moves), `StatusChipMappingTest` extended.

**Composition (R3):** root `Box(page)` `statusBarsPadding()`: top bar row — `EtalonIconButton(X, «Ёпиш»)` left, title `headline` («Юк расми» / «Етказиш расми» — passed in), nothing right; the preview fills the middle in a `EtalonShapes.xl` clipped surface with a hairline; the permission-denied state = `NoticeBanner` + `SecondaryButton(«Рухсат бериш»)`; bottom controls in a `StickyActionBar`: `EtalonIconButton(RefreshCw, «Қайта олиш», 56 dp)` (captured state) + `PrimaryButton(«Расмни олиш» / «Фойдаланиш»)`; the shutter = a 72 dp `indigo` circle with a white ring (`Role.Button`, «Суратга олиш»). `CaptureState` machine unchanged.
- [ ] Failing frames (`capture_preview_light`, `capture_captured_light`, `capture_denied_light`, `capture_font13`) → implement → record/look → verify → commit `Feat(android) · photo capture on the design chrome; shipment and driver status tags`.

---

### Task 2: The camera-first trio — LoadTruck, ShipmentLoad, DeliveryProof

**Files:** the three screens, strings, `LogisticsScreenshotTest.kt` (trio part), `DeliveryProofGateTest.kt` (new), ViewModels: `DeliveryProofViewModel` unchanged; `ShipmentLoadViewModel`/`LoadTruckViewModel` unchanged except an optional `submitted` summary for R5 (if `done` alone cannot carry the counts, add `DoneSummary(beams, blocks, queued)`).

**Oracle:** mapping row «camera-first, unchanged flow; header IconButtons, CountStepper and PrimaryButton restyled; result summaries as indigoTile grids»; idiom baselines `record_light` (header + FormCard + hero + sticky bar), `approve_sheet_light` (hero + metas), `order_detail_light` (load list card).

**LoadTruck:** header row (back circle + «Юк расми» `headline` + order № `meta`); white card «Юклаш рўйхати» = the order's load list (R7: `formatMeters` × count rows + «Ғишт» pill, the same composable the order detail draws — extract `LoadListCard` to the design system if it is private to the detail today); the photo area: `PhotoCapture` entry (a 56 dp `PrimaryButton(«Суратга олиш»)` when no photo; the `PhotoStrip` thumbnail + «Қайта олиш» when taken); `ErrorBanner`; sticky `PrimaryButton(«Юкланди деб белгилаш», loading = submitting)` — **the phase-2 carry: this label ellipsizes at 1.3** → allow two lines (`maxLines = 2`) in `PrimaryButton` for long labels or shorten to «Юкланди» — decide, test at 1.3; done → R5 grid («Балка N», «Ғишт N», «Расм 1», «Навбатда»/«Юборилди») then pop.
**ShipmentLoad:** as LoadTruck, but the load list rows are `CountStepper`s bound to `beams[lengthKey]`/`blocks` with the allowance ceiling («Кўпи билан N» — kept), the photo required before submit (kept rule).
**DeliveryProof:** header; white card: `MoneyHeroText(amount, amountLg)` tappable → `NumericKeypadSheet`; metas «Кутилган <expected>», «Камомад <shortfall>» red / «Ортиқча <over>» red (R4); `FormCard`: `FormField(«Нақд пул олинмади»)` token `Switch`, `FormField(«Ҳайдовчи қайтди»)` `Switch`, `FormField(«Изоҳ», divider = false)` `EtalonTextField`; the photo block as LoadTruck; sticky `PrimaryButton(«Етказилди», loading)` → the navy `ConfirmSheet` gate (caption «Етказилди», amount, meta «№ · client», tiles «Кутилган» + «Камомад»/«Ортиқча» when non-zero; confirm «Тасдиқлаш») → `submit()`; the gate opens only when the VM would accept (photo present, `!isOffline` if the VM refuses offline — read it); `DeliveryProofGateTest` mirrors `RecordGateTest`.
**Kept:** offline queueing of the photo (the load/proof routes ARE `withIdempotency`-wrapped — verify in `OutboxWorker`/repository before assuming), the allowance, `beamLengthKey`, the shortfall rule, `driverReturned`, `noCashCollected` clearing the amount.
**Baselines:** `load_truck_light`, `load_truck_done_light`, `shipment_load_light`, `shipment_load_font13`, `delivery_proof_light`, `delivery_proof_gate_light`, `delivery_proof_font13`; delete `shipment_load_{dark}`, `delivery_proof_{dark}`.
- [ ] Steps as phase 3's Task 4 → emulator: walk a dev order: LoadTruck photo → ShipmentLoad counts → captures `load-truck-emulator.png`, `shipment-load-emulator.png`, `delivery-proof-emulator.png`, `delivery-proof-gate-emulator.png` (dev order only) → commit `Feat(android) · the camera-first screens: load truck, shipment load, delivery proof`.

---

### Task 3: Shipments (per order) + Dispatch

**Files:** `shipments/ShipmentsScreen.kt`, `dispatch/DispatchScreen.kt`, strings, `LogisticsScreenshotTest.kt` (parts), `DispatchGateTest.kt` (new); ViewModels unchanged.

**Oracle:** «Shipments: NavySheet rows, StatusTag on navy» → idiom `discrepancies_light`; «Dispatch: white card list of OrderRows with StepTimeline; DriverPicker restyled» → idiom `order_detail_light` (timeline) + `record_light` (FormCard).

**Shipments:** header row (back + «Юклар» `headline` + «№ · client» `meta`); `NavySheet(«Рўйхат»)` rows: «Юк N» `rowTitle` onDark + `StatusTag(ShipmentStatus, ROW_ON_NAVY)`, meta «loadedAt · driver · truck» `onDarkMuted`, trailing `TonalButton(onDark)` per state: PENDING → «Юклаш» (→ `onLoadShipment`), LOADED → «Жўнатиш» (→ `onDispatch`), DISPATCHED → «Етказилди» (→ `deliverShipment` behind a navy `ConfirmSheet` gate); a queued/failed upload line under the row (`pendingUploads`: «Юборилмоқда» / «Юборилмади» red + `TonalButton(«Қайта»)`/`«Бекор»`); `canAddShipment` → sticky `PrimaryButton(«Юк қўшиш»)`; delete via a long-press `ConfirmSheet` (kept rule: only PENDING); empty «Юк йўқ» onDarkMuted; banners; pull-to-refresh.
**Dispatch:** header (back + «Жўнатиш» + «Юк N · № order»); the order's three-step `StepTimeline` (the detail's composable) in a white card; `FormCard`: `FormField(«Ҳайдовчи»)` value row + chevron → `DriverPicker` (kept), `FormField(«Машина»)` `EtalonTextField(truck)`, `FormField(«Нақд пул йиғади»)` token `Switch`, `FormField(«Сумма», divider = false)` → `MoneyHeroText` tappable → keypad (only when `willCollectCash`); `ErrorBanner`; sticky `PrimaryButton(«Жўнатиш», loading)` → navy gate (caption «Жўнатиш», amount when cash, tiles «Ҳайдовчи» + «Машина») → `submit()`; `DispatchGateTest` (no driver → no gate + one submit; offline → same; valid → gate; confirm → submit).
**Baselines:** `shipments_light` (three rows in three states + one failed upload), `shipments_font13`, `dispatch_light`, `dispatch_gate_light`; delete `shipments_list_*`.
- [ ] Steps as Task 2 → emulator captures `shipments-emulator.png`, `dispatch-emulator.png` (continue the dev order) → commit `Feat(android) · shipments on a navy list; dispatch on form cards with a gate`.

---

### Task 4: Drivers + DeliveryLocation

**Files:** `drivers/DriversScreen.kt`, `location/DeliveryLocationScreen.kt`, strings, `LogisticsScreenshotTest.kt` (parts); ViewModels unchanged (the `enabled = !x, loading = x` pairs were fixed in phase 3).

**Oracle:** «Drivers: Clients-style avatar rows» → idiom `clients_light` + `client_edit_light` (create sheet); «DeliveryLocation: map unchanged; controls restyled» → idiom `record_light` (FormCard) + `order_detail_light` (address line).

**Drivers:** header («Ҳайдовчилар» `displayTitle` + «N ҳайдовчи» `meta`; «Фаол» `EtalonFilterChip` toggle for `activeOnly`); white `xl` card of `OrderRow(clientName = name, status = null, metaLine = formatPhone(phone) · notes, total = —?` → NO: drivers have no money — use a plain avatar row: `Avatar` + name `rowTitle` + meta `formatPhone` + `StatusTag(active)` + a trailing token `Switch` (with `driver.manage`) → `setActive`; empty «Ҳайдовчи йўқ»; `StickyActionBar { PrimaryButton(«Ҳайдовчи қўшиш») }` with `canManage` → the create sheet (white `ModalBottomSheet`, `FormCard`: name, phone with the shared `PhoneDigitsMask` + ASCII filter, notes; `PrimaryButton(«Сақлаш», loading)`).
**DeliveryLocation:** header (back + «Етказиш жойи» + «№ · client»); the pin card (`xl`, white: coordinates in tabular figures + the label + `TonalButton(«Харитада очиш», leading = MapPin)` → the existing `geo:` intent; empty → «Жой белгиланмаган» in the same card — R8 as corrected); `FormCard`: `FormField(«Xarita ҳаволаси» → «Харита ҳаволаси»)` `EtalonTextField(linkInput)` + `TonalButton(«Топиш»)`, `FormField(«Координаталар»)` `EtalonTextField(manualInput)` + `TonalButton(«Қўллаш»)`, `FormField(«Белги», divider = false)` `EtalonTextField(label)`; `SecondaryButton(«Менинг жойим», leading = MapPin)`; banners; sticky bar: `SecondaryButton(«Тозалаш»)` (`canClear`) + `PrimaryButton(«Сақлаш», enabled = canSave, loading = busy)` (the phase-3 fix kept); `imePadding` + the bar hides while the IME is up (R13).
**Baselines:** `drivers_light`, `drivers_font13`, `driver_create_light`, `delivery_location_light` (pin set), `delivery_location_empty_light`, `delivery_location_font13`.
- [ ] Steps → emulator captures `drivers-emulator.png`, `delivery-location-emulator.png` → commit `Feat(android) · drivers on avatar rows; delivery location on form cards over the map`.

---

### Task 5: Home «Бугунги етказиш» + order-detail hand-offs — verify, then the driver's job walk

**Files:** none expected; if a hand-off passes a stale parameter (a route gained `now`), `EtalonNavHost.kt`; `feature/home` unchanged.
- [ ] Walk the DRIVER role on the emulator (sign in as the seeded driver if the dev DB has one — say so; otherwise the owner account): Home today's rows → order detail → «Юклаш» → LoadTruck → back → Shipments → ShipmentLoad → Dispatch → DeliveryProof → detail shows «Етказилди» with the date; capture each step to `captures/job-walk-*.png`; every screen must clear the pill under gesture AND three-button nav (switch and restore). Note every place the walk stalls (a missing back, a dead button, a stale figure) and fix what is a phase-5 defect; ledger the rest.
- [ ] Commit only if code changed: `Fix(android) · the driver's job walk`.

---

### Task 6: Close the phase — shim retirement, lint, sweep, owner captures

- [ ] Delete `LegacyTokens.kt`, the `EtalonType.mono*` aliases, `StatusStripeCard.kt`, `SectionLabel.kt`, `StatusChip.kt` (all six chips), `EmptyState` if unused (grep); replace the last `MaterialTheme.*` reads in `NumericKeypadSheet.kt` and `RegionPicker.kt` with tokens (their frames `ds_kept_*`/region-picker baselines must NOT move — same colours, proven by verify); the `KeptComponentsScreenshotTest` samples of deleted components go with them.
- [ ] `NoLegacyApiTest.kt` in `:core:designsystem` beside `NoRawHexTest` (walk every `src/main/**/*.kt` in the repo; fail on `LegacyTokens`, `EtalonType.mono`, `MaterialTheme.colorScheme`, `MaterialTheme.typography`, `androidx.compose.material.icons`, `LocalEtalonColors` outside `EtalonTheme.kt`, `StatusStripeCard`, `SectionLabel`, `StatusChip(`, `PaymentStatusChip`, `DiscrepancyStatusChip`, `ShipmentStatusChip`, `DriverStatusChip`); wire it as a Gradle test input like `NoRawHexTest`.
- [ ] Orphans: strings the rewrites left unused (grep-proven), `Lightbox` scrim judgement (navy .55 like the sheets — decide and apply once), the «Юкланди деб белгилаш» decision recorded.
- [ ] Standard command with `--rerun-tasks`; web tests untouched (no web change in this phase).
- [ ] Emulator walk with captures `captures/final-*.png`: all seven screens + capture chrome, beside their idiom baselines; three-button check on Shipments and DeliveryLocation.
- [ ] Commit: `Chore(designsystem) · retire the phase-1 shim and the legacy components; legacy-API lint`.

---

## Carried for the readiness slice
- `ds_account_sheet_light` needs a Roborazzi harness in `:app`.
- App locale for the M3 pickers' month header (the Orders list's fallback picker).
- «Калькуляторда очиш» gating on a non-empty draft; Latin free text in the history carve-out.
- Signing keystore, CI (`verifyRoborazziDebug` + `golden:check` + `openapi:check`), install route, FCM.
- The Google Maps API key for the location tile (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`).

## Self-review
- Spec coverage: D9 entry points (R1, Task 5), §5.2 rows Dispatch (T3), Drivers (T4), LoadTruck/ShipmentLoad/DeliveryProof (T2), Shipments (T3), DeliveryLocation (T4); §5.1a Load job (R7, T2); the kept components restyled (T1: PhotoCapture; T6: keypad/region picker's last Material reads); §8 testing (frames per screen, gates tested, the lint).
- Type consistency: `StatusTag(ShipmentStatus)`/`StatusTag(active)` (T1) used by T3/T4; `LoadListCard` (T2, extracted from the detail) used by LoadTruck and ShipmentLoad; `ConfirmTile` grids (R5) in T2; `DriverPicker` (existing) in T3; `PhoneDigitsMask` (phase 3) in T4.
- Placeholders: none — every step names files, strings and frames; the two "decide" items (the 1.3 label, the Lightbox scrim) are rulings the executor makes and ledgers.
