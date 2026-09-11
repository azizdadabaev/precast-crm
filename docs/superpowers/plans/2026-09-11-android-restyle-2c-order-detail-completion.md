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
val OrderDetail.discountPercent: BigDecimal      // OrderDetailDto.discountPercent: String = "0" — on the wire (schema `discountPercent`), never parsed until now
```
- [ ] Tests: rooms with beamLength 3.8/5.05/3.8 (counts 8, 3, 6) → `[("3.80", 14), ("5.05", 3)]`; blocks summed; weight 78.7 m² → 14 166 kg; DTO without the new keys decodes (nulls / zero); `discountPercent` «2.10» → `formatPercent(…, 1)` = «2,1%». Commit `Feat(android) · order detail derives its load list and weight; cancel reason and discount percent on the wire`.

---

### Task 2: Screen — load list card, canceled notice, collapsed history, payment-door reason

**Files:** `feature/orders/.../detail/OrderDetailScreen.kt`, `NextStep.kt` (a `PaymentDoor` sealed result: `Open`, `Blocked(reason)`, `Hidden` — `canRecordPayment` stays for callers), strings, `OrderDetailScreenshotTest.kt` (+ frames), `NextStepTest.kt` (+ payment door cases).

**Load list card** (`WhiteCard(«Юклаш рўйхати»)`, right under the panel or the canceled notice): a two-column grid of rows «3,80 м» (`label`, `ink`) … «14 та» (`rowAmount`, right); then a hairline, «Ғишт · жами» «282 та»; footer `meta` «Оғирлик ~14 166 кг» (`ink2`). CANCELED → the card collapsed to its title with a chevron (R5).
**Canceled notice** (R5): `Column(redBg, xl, padding cardPad)` with «Бекор қилинди · 3 сен 2026» `label` `red` and «Сабаб: …» `meta` `red`.
**History**: first three events; «Барчаси (N)» `label` `indigo` toggles the rest (`remember` state, no navigation).
**Payment door** (R4): `paymentDoorFor(order, me): PaymentDoor`; the bar renders `PrimaryButton(enabled = false)` + the reason line for `Blocked`.
**Discount percent**: `CostsCard`'s «Чегирма» caption becomes «Чегирма 2,1 %» (`detail_discount_pct` «Чегирма %1$s») when `discountPercent > 0`.
**Payments header on CANCELED**: `PaymentsCard` gains a footer `meta` «Тасдиқланган: {confirmedPaid} / {totalPrice}» (`detail_payments_confirmed_of` «Тасдиқланган: %1$s / %2$s») only when `status.owesNothing` — the one case where no other card states the denominator.
**History fallback**: for `STOCK_WARNING` prefer `orderEventLabel(type)` over `e.message` (the server's message is English prose); every other type keeps `message ?: label`.
**Strings** (add): `detail_load_list` «Юклаш рўйхати», `detail_load_row` «%1$s м», `detail_blocks_total` «Ғишт · жами», `detail_weight` «Оғирлик ~%1$s», `detail_canceled_title` «Бекор қилинди · %1$s», `detail_cancel_reason` «Сабаб: %1$s», `detail_cancel_reason_none` «Сабаб кўрсатилмаган», `detail_events_all` «Барчаси (%1$d)», `detail_payment_pending_cap` «Тасдиқ кутилмоқда: %1$s».
- [ ] Baselines: the dispatched frame gains the load list (re-record `order_detail_dispatched_light` + `_font13`); `order_detail_canceled_light` gains the notice with a reason; a new `order_detail_pending_cap_light` (PLACED, a pending payment equal to the remainder → disabled door with the reason); history frame with > 3 events collapsed.
- [ ] Emulator: open a DISPATCHED order → capture `detail-loadlist-emulator.png`; the canceled order → `detail-canceled-reason-emulator.png`.
- [ ] Commit `Feat(android) · Order detail: load list, weight, cancel reason, collapsed history, payment-door reason`.

---

### Task 3: Шарҳлар — comments with mentions, read and post

**Why now:** `COMMENT_MENTION` pushes already reach the phone (`EtalonMessagingService.kt` routes them to the «Изоҳлар» channel and deep-links `etalon://order/{id}`) into a screen with no comments — a dead end. The API exists: `GET`/`POST /api/orders/{id}/comments`, both `order.view`, the POST `withIdempotency`; the thread is the deal's (order + its draft project); mentions are resolved server-side from `@name` text.

**Files:** `core/network/.../EtalonApi.kt` (`@GET("/api/orders/{id}/comments")`, `@POST` with `@Header("Idempotency-Key")` as the other idempotent posts do), `core/network/.../dto/CommentDto.kt` (`id, body, createdAt, author { id, name, role }, deletedAt: String? = null, mentionedUserIds: List<String> = emptyList()` — read the route's response shape first and match it field for field), `core/model/.../Comment.kt` (`OrderComment(id, body, createdAt, authorName, authorId)`), `core/data/.../OrdersRepository.kt` (`comments(orderId): Flow<Resource<List<OrderComment>>>` + `refreshComments`, `postComment(orderId, body): Result<OrderComment>` with a fresh key per body, online-only — not queued), mapper + tests, `feature/orders/.../detail/OrderDetailViewModel.kt` (`comments` state, `postComment`, `commentDraft`), `OrderDetailScreen.kt` (`WhiteCard(«Шарҳлар») { last three rows: Avatar(author) 28 dp · name `label` · `formatDateTime` `meta` · body `body`; «Барчаси (N)» expands; composer: `EtalonTextField(placeholder «Шарҳ ёзинг… @ билан одам белгилаш», singleLine = false, max 3 lines)` + `PrimaryButton(«Юбориш», compact, enabled = draft.isNotBlank() && !posting && online)` }`), strings (`detail_comments` «Шарҳлар», `detail_comment_hint`, `detail_comments_empty` «Ҳозирча шарҳлар йўқ», `detail_comments_all` «Барчаси (%1$d)», `detail_comment_send` «Юбориш», `detail_comment_failed` «Шарҳ юборилмади»), tests (`OrderDetailViewModelTest` post success/failure; a `CommentDto` decode test), baseline `order_detail_comments_light` (three comments, one with an @mention rendered as plain text). Deleted comments (`deletedAt != null`) are skipped. No edit/delete, no mention picker (later).

- [ ] Commit `Feat(android) · order comments: read the thread, post a note, mentions resolved server-side`.

### Task 4: Close — the beam-key bug, the review's follow-ups, sweep, verification, captures

**Carried from Task 2's review (all in scope here):**
- **Beam keys must agree with the server everywhere.** `feature/logistics/.../shipments/BeamAllowance.kt:11` keys beam lengths with `String.format("%.2f", BigDecimal)` = decimal HALF_UP, while the server caps and the detail's load list key with JS `toFixed(2)` on the binary double — a 3.505 m beam posts `{"3.51": n}` against a server total of 0 and takes a permanent 422 in the yard. Lift the key into ONE function in `:core:model` (`fun beamLengthKey(v: BigDecimal): String = BigDecimal(v.toDouble()).setScale(2, HALF_UP).toPlainString()`, KDoc'd as the sanctioned `Double` crossing), use it from `OrderDetail.loadList` AND `BeamAllowance`, and pin 3.505 → "3.50" on both sides (`OrderDetailDerivedTest` + the allowance test).
- `rememberSaveable` for the two expansion states (canceled load list, history).
- «Барчаси (N)» gets a «Камроқ» to collapse; KDoc that the server returns at most 100 events.
- Capture the discount caption: `order_detail_discount_light.png` from the existing scrolling assertion.
- Tests for the null-`canceledAt` («Бекор қилинди» without a date) and no-reason («Сабаб кўрсатилмаган») branches.
- A `Blocked` + `fontScale 1.3` frame; derive the bar's extra clearance from the reason line's measured height (or `maxLines = 1` + ellipsis) so the last card never sits under it.
- One `STOCK_WARNING` constant in `EventLabels.kt`; the weight KDoc in `Order.kt` says `totalArea` is Σ monolith area (the physical slab), not the billed tiles nor the rows' sum.
- Task 3 follow-ups the reviewer names.

- [ ] Standard command with `--rerun-tasks`; list baselines moved; captures to the workspace; report which §5.1a rows are now Always/Collapsed/Conditional on the built screen.
- [ ] Commit: `Fix(android) · beam keys agree with the server; detail follow-ups from review`.

## Self-review
- §5.1a rows covered: panel (exists), canceled notice (T2), load list + blocks + weight (T1/T2), progress (exists), costs with the discount percent (T1/T2), payments with the CANCELED denominator (T2), delivery/shipments/photos (exist), comments (T3), history collapsed with the `STOCK_WARNING` label rule (T2), bar rules (T2 R4). Not-on-mobile list respected (nothing added); «Чатга юбориш», share, phone-as-text, receipt thumbnails recorded as Later in §5.1a. Types: `LoadLine`/`loadList`/`weightKg`/`discountPercent` (T1) consumed by T2; `PaymentDoor` (T2) tested in `NextStepTest`; `OrderComment` (T3) has no consumer outside T3.
