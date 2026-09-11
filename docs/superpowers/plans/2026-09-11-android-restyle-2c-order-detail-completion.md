# Android Restyle — Phase 2c: Order Detail Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Order detail the sections the owner's job test requires and the phase-2 brief omitted: the load list with the block total and the weight, the cancellation reason, the collapsed history, and the hide-vs-disable rule for the sticky bar's actions.

**Architecture:** No server change (the GET already returns `cancelReason`/`canceledAt`). Two derived values on the model (`OrderDetail.loadList`, `OrderDetail.weightKg`) mirror the web's `beamGroups` and `totalArea × 180`. Three new white cards on the existing screen, one conditional notice, and a `Blocked`-style reason on the payment door. Everything else on the screen is untouched.

**Tech Stack:** Kotlin, Compose, Roborazzi. **Spec:** `docs/superpowers/specs/2026-09-10-android-restyle-design.md` §5.1a (the table is the contract), §7 numbers, §8 testing. **Oracle:** the §5.1a table plus the phase-2 detail baselines' idiom (white `xl` cards, `sectionTitle`, `meta`/`label` pairs, `formatMoney`, tokens).

## Global Constraints
- Same as phase 2: light only; tokens only (no raw hex, no `MaterialTheme.*`, no shim); 48 dp; `Money`/`BigDecimal` only — the weight is `BigDecimal` (`totalArea × 180`, whole kg, `formatWeightKg` takes a `Double` today: add a `BigDecimal` overload or format via `formatDecimal(..., 0) + " кг"`; never `Double` on the model); Uzbek Cyrillic; `EtalonSpace` gaps; no new dependency; every existing capability kept; verification with `--rerun-tasks`; never stash; captures to the workspace.
- The screen keeps its phase-2 order of sections except where §5.1a inserts: panel → canceled notice → **load list** → progress → costs → payments → delivery → shipments → photos → history (collapsed) → bar.

## Rulings
- **R1 — Load-list order.** First appearance by room order (the web's `Map` insertion order), not sorted; the two-decimal key is the display «3,80 м».
- **R2 — Weight.** `ORDER_KG_PER_M2 = BigDecimal(180)` lives in `:core:model` `Order.kt`; the calculator's `KG_PER_M2` (Double, engine domain) gets a KDoc pointing at it (they must agree; a test in `:core:model` pins 180).
- **R3 — History collapsed.** First three events, «Барчаси (N)» expands in place; no navigation.
- **R4 — Payment door reason.** When `canRecordPayment` is false ONLY because `recordableRemaining.isZero && !remaining.isZero`, the bar shows the primary button disabled with «Тасдиқ кутилмоқда: {pendingAmount}» beneath it (a `meta` line in `ink2`); the existing status/permission refusals stay hidden (lifecycle / role). `nextStepFor`'s `Blocked` already carries its reason.
- **R5 — Canceled.** Notice card on `redBg` with `red` text: «Бекор қилинди · {formatDate(canceledAt)}» and «Сабаб: {cancelReason}» (or «Сабаб кўрсатилмаган» when null); the panel's Қолди stays «—» (phase-2 rule); progress and costs stay hidden; the load list still shows (a canceled order's list is still what was quoted — Collapsed by default when CANCELED).

---

### Task 1: Model — `cancelReason`, `canceledAt`, `loadList`, `weightKg`

**Files:** `core/network/.../dto/OrderDto.kt` (`OrderDetailDto.cancelReason: String? = null`, `canceledAt: String? = null`), `core/data/.../mapper/OrderMappers.kt`, `core/model/.../Order.kt`, tests `OrderMappersTest`, new `OrderDetailDerivedTest`.

**Produces:**
```kotlin
data class LoadLine(val lengthKey: String, val beamLength: BigDecimal, val beams: Int)   // lengthKey = beamLength.setScale(2, HALF_UP).toPlainString(), e.g. "3.80"
val OrderDetail.loadList: List<LoadLine>      // grouped by lengthKey, Σ beamCount, first-appearance order
val OrderDetail.totalBlocks: Int              // Σ rooms.totalBlocks
val ORDER_KG_PER_M2: BigDecimal = BigDecimal(180)
val OrderDetail.weightKg: BigDecimal          // summary.totalArea × ORDER_KG_PER_M2, scale 0 HALF_UP
val OrderDetail.cancelReason: String?; val canceledAt: Instant?
```
- [ ] Tests: rooms with beamLength 3.8/5.05/3.8 (counts 8, 3, 6) → `[("3.80", 14), ("5.05", 3)]`; blocks summed; weight 78.7 m² → 14 166 kg; DTO without the new keys decodes (nulls). Commit `Feat(android) · order detail derives its load list and weight; cancel reason on the wire`.

---

### Task 2: Screen — load list card, canceled notice, collapsed history, payment-door reason

**Files:** `feature/orders/.../detail/OrderDetailScreen.kt`, `NextStep.kt` (a `PaymentDoor` sealed result: `Open`, `Blocked(reason)`, `Hidden` — `canRecordPayment` stays for callers), strings, `OrderDetailScreenshotTest.kt` (+ frames), `NextStepTest.kt` (+ payment door cases).

**Load list card** (`WhiteCard(«Юклаш рўйхати»)`, right under the panel or the canceled notice): a two-column grid of rows «3,80 м» (`label`, `ink`) … «14 та» (`rowAmount`, right); then a hairline, «Ғишт · жами» «282 та»; footer `meta` «Оғирлик ~14 166 кг» (`ink2`). CANCELED → the card collapsed to its title with a chevron (R5).
**Canceled notice** (R5): `Column(redBg, xl, padding cardPad)` with «Бекор қилинди · 3 сен 2026» `label` `red` and «Сабаб: …» `meta` `red`.
**History**: first three events; «Барчаси (N)» `label` `indigo` toggles the rest (`remember` state, no navigation).
**Payment door** (R4): `paymentDoorFor(order, me): PaymentDoor`; the bar renders `PrimaryButton(enabled = false)` + the reason line for `Blocked`.
**Strings** (add): `detail_load_list` «Юклаш рўйхати», `detail_load_row` «%1$s м», `detail_blocks_total` «Ғишт · жами», `detail_weight` «Оғирлик ~%1$s», `detail_canceled_title` «Бекор қилинди · %1$s», `detail_cancel_reason` «Сабаб: %1$s», `detail_cancel_reason_none` «Сабаб кўрсатилмаган», `detail_events_all` «Барчаси (%1$d)», `detail_payment_pending_cap` «Тасдиқ кутилмоқда: %1$s».
- [ ] Baselines: the dispatched frame gains the load list (re-record `order_detail_dispatched_light` + `_font13`); `order_detail_canceled_light` gains the notice with a reason; a new `order_detail_pending_cap_light` (PLACED, a pending payment equal to the remainder → disabled door with the reason); history frame with > 3 events collapsed.
- [ ] Emulator: open a DISPATCHED order → capture `detail-loadlist-emulator.png`; the canceled order → `detail-canceled-reason-emulator.png`.
- [ ] Commit `Feat(android) · Order detail: load list, weight, cancel reason, collapsed history, payment-door reason`.

---

### Task 3: Close — sweep, verification, captures
- [ ] Standard command with `--rerun-tasks`; list baselines moved; captures to the workspace; report which §5.1a rows are now Always/Collapsed/Conditional on the built screen.
- [ ] Commit any sweep.

## Self-review
- §5.1a rows covered: panel (exists), canceled notice (T2), load list + blocks + weight (T1/T2), progress/costs/payments/delivery/shipments/photos (exist), history collapsed (T2), bar rules (T2 R4). Not-on-mobile list respected (nothing added). Types: `LoadLine`/`loadList`/`weightKg` (T1) consumed by T2; `PaymentDoor` (T2) tested in `NextStepTest`.
