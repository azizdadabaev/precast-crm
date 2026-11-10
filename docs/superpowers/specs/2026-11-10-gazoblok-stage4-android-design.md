# Gazoblok renovation — Stage 4 (Android) design

Date: 2026-11-10 · Parent spec: `docs/superpowers/specs/2026-11-10-gazoblok-renovation-design.md` (§3 Stage 4, §4 rules)
Plan: `docs/superpowers/plans/2026-11-10-gazoblok-stage4-android.md` · Status: **draft, awaiting owner review**

## 1. Intent

Owner (parent spec §1): gazoblok is an "island" — "the … Android app don't know it exists". Stage 4 puts gazoblok on
the phone for the people in the yard and at the site: **orders list + detail, load a truck (counts per size, photos,
over-load confirm), mark delivered, delivery photo, record payment**, matching the web rules of Stage 1 exactly. The
server stays the only judge of every rule; the phone shows the same numbers and asks the same questions.

Owner decisions that apply (10 Nov 2026): Uzbek Cyrillic UI; **same permissions as web**; order numbers stay Latin
«B-2026-11-0007»; awaiting payment = grey, payment awaiting confirmation = orange «Тасдиқланмаган»; **manual**
«Етказилди» button (no automatic delivery); payment methods Click / Payme written in Latin.

## 2. Where Android lives (verified 2026-11-10, read-only git)

| Fact | Value |
|---|---|
| Android source | `android/` (Gradle multi-module: `:app`, `:core:*`, `:feature:*`) on branch `feat/android-restyle` |
| Worktree holding it | `C:\Users\aziz\Downloads\precast-crm\precast-crm\.claude\worktrees\android-phase1b` (clean) |
| Branch head | `60828750` «Revert(android) · share card keeps its old balance wording» |
| Live APK | **1150** (memory: overpayment release 2026-10-20). `versionCode` = `git rev-list --count HEAD`; that count is 1150 at `60828750`, so the live APK ships from this head. |
| Relation to main | **Diverged** (memory `feedback_branches_diverged`): `feat/android-restyle` is never pushed to `main`; it carries old web files. Web work is never done on it. |
| Gazoblok on Android today | Only the pricing engine port `:core:calc/gazoblok/*` (Phase 2a, golden-vector parity). **No gazoblok screens, DTOs, API calls or nav keys.** |

**Build branch:** `feat/android-gazoblok`, cut from `feat/android-restyle` at its head *at the moment Stage 4 starts*
(today `60828750`), in a new worktree `C:\Users\aziz\Downloads\precast-crm\precast-crm\.claude\worktrees\android-gazoblok`.
Merged back into `feat/android-restyle` (fast-forward or merge, owner's call) only when the owner approves the screens.
Never pushed to `main`. The **web** half (§5) is built on `feat/gazoblok-renovation` in the `gazoblok-reno` worktree.

## 3. What the phone does — decided by the job

Rule from memory `feedback_order_detail_jobs`: decide by who holds the phone and what they are about to do.

| Job | Where | On the phone |
|---|---|---|
| Load | yard, at the truck | pick the truck, enter blocks per size, photograph, confirm over-load |
| Deliver | client's site | call / navigate, photograph the unloaded blocks, mark the truck delivered, take money |
| Check | anywhere, 10 s | ordered / loaded / left / over, total / paid / left, who sold it |

**Not on the phone in Stage 4** (named so builders stop adding them): placing a gazoblok order (the calculator's
gazoblok mode is Stage 3+ if the owner asks), close short, cancel, refunds, confirm/reject payments (the existing
payments queue tab is beam-and-block only and stays so), stock and production screens, comments, reorder, editing
lines. These stay on the web. Hide them — they do not apply on the phone at all.

## 4. Screens

### 4.1 Entry
A segmented switch on the Orders tab: «Плита» | «Газоблок» (pill segment, same component as the existing status
segments). Shown only when the user has `order.view`. The «Газоблок» segment opens the gazoblok list; no new bottom-bar
cell (the bar is full). Nav keys: `GazoblokOrders`, `GazoblokOrderDetail(id)`, `GazoblokLoad(orderId, shipmentId)`,
`GazoblokDeliveryProof(orderId)`, `GazoblokRecordPayment(orderId)`.

### 4.2 List — `GET /api/gazoblok/orders?q=&status=`
Row: «B-2026-11-0007» (Latin, mono), client name, phone, sum `1 554 000 UZS` (tabular), date, status chip, payment chip.
Payment chip: `AWAITING_PAYMENT` → grey «Тўлов кутилмоқда»; `pendingPaymentCount > 0` → orange «Тасдиқланмаган»
(wins over the state chip); `PARTIALLY_PAID` accent «Қисман»; `FULLY_PAID` green «Тўланган». Status segments:
Ҳаммаси / Буюртма / Ишлаб чиқ. / Етказилди / Бекор. Search box (number, name, phone). Server caps at 100 rows — no
paging in Stage 4. Empty state «Газоблок буюртмалари йўқ».

### 4.3 Detail — `GET /api/gazoblok/orders/{id}`
Sections, top to bottom:
1. **Header**: number, client (tap → `tel:`), status + payment chips, «Сотувчи: {createdBy.name}».
2. **Money triple**: Жами / Тўланган (confirmed) / Қолди, plus «Тасдиқланмаган: X UZS» when pending payments exist.
3. **Quantities table** (the job's core) from `quantities`: per size — Буюртма / Юкланди / Қолди / Ортиқча, and a total
   row. Mono, tabular.
4. **Over-load debt** (only when `overshipAmount > 0`): «Ортиқча юк: +N та · +X UZS · тўланмагани Y UZS · Сотувчи: …».
5. **Refund owed** (only when `refundDue > 0`): «Қайтариш керак: X UZS» — read-only, refund is web-only.
6. **Trucks**: each shipment «Машина 1 · Юкланди · 10.11.2026 14:32», its counts, photo thumbs; actions per §4.4/4.5.
   «+ Машина қўшиш» (POST shipments) when the order is open and the user has `order.edit`.
7. **Delivery**: address/pin if present; delivery photo thumb; «Етказилди» order button (§4.5).
8. **Payments**: list (amount, method, status, who, when); «Тўлов қўшиш» (§4.6).
9. **History**: events «Ким · нима · 10.11.2026 14:32», newest first (`events[].actor.name`, `createdAt`).

Closed orders (DELIVERED, CANCELED, closed short) show everything read-only; cancel shows `cancelReason`, close short
shows `shortCloseReason`.

### 4.4 Load a truck — `POST …/shipments/{sid}/load` (multipart)
One number field per order line, prefilled with the truck's current `loadedLines` (correction) or empty; under each:
«Буюртма 400 · бошқа машиналарда 150 · қолди 250». Live «Жами: N та». Photos via the existing `:feature:capture`
(optional, 0..n). On save:
- The phone computes over-load with the **same rule** as `overloadLines` in `src/lib/gazoblok-quantities.ts`
  (other trucks + this one vs ordered, minus over-load the other trucks already had). If any line
  exceeds, it shows the confirm sheet first, text verbatim from the parent spec §4.4:
  «Буюртмадан ортиқ: +N та · +X UZS. Мижоз қарзи шунча ошади.» — «Тасдиқлаш» sends `confirmOverload=true`.
- If the server still answers **409 `OVERLOAD_CONFIRM_REQUIRED`** (another truck was loaded meanwhile), the phone shows
  the same sheet with the server's `extraBlocks`/`extraAmount` and resends with the flag. The server's numbers win.
- 422 unknown line, 409 closed order, 403 → Uzbek message from the server's text before « · ».
- Correcting a DELIVERED truck: the button is shown only with `order.editShipped`; otherwise hidden.

### 4.5 Deliver
- **Truck**: «Етказилди» on a LOADED truck → `PATCH …/shipments/{sid}`. PENDING truck: disabled with reason
  «Аввал юкланг».
- **Delivery photo**: «Етказиш сурати» → camera → `POST /api/gazoblok/orders/{id}/delivery-proof` (new, §5). Allowed
  before the order is DELIVERED (the photo is taken when the truck is unloaded, often before the last money).
- **Order «Етказилди»** (manual, owner decision) → `PATCH /api/gazoblok/orders/{id}` `set_status DELIVERED`. Always
  visible on an open order to `order.edit` holders; **disabled with the reason** from a Kotlin mirror of `canDeliver`
  (`src/lib/gazoblok-rules.ts`), same order and the same Uzbek text: «Ҳамма блоклар юкланмаган — юкланг ёки буюртмани
  қисқа ёпинг», «Аввал барча жўнатмаларни етказинг», «Тўлиқ тўланмаган буюртмани етказиб бўлмайди — аввал тўловни
  тасдиқланг» (+ «Қолди: X UZS»). The server re-checks (`nextStatusProblem`) and its message wins.

### 4.6 Record payment — `PATCH /api/gazoblok/orders/{id}` `record_payment`
Amount (decimal comma accepted, `1 554 000`), method chips from `src/lib/gazoblok-labels.ts`: **Нақд / Банк ўтказмаси /
Click / Payme / Бошқа** (Click, Payme Latin), note, receipt photos (each uploaded first to `POST /api/gazoblok/upload-receipt`, URLs passed as
`receiptUrls`). Ceiling: amount ≤ Қолди (client hint; server checks under lock). Result: auto-confirmed for
`payment.confirm` holders, otherwise «Тасдиқланмаган» (orange). Needs `payment.record`; hidden without it.

## 5. Server API consumed (Stage 1 routes, branch `feat/gazoblok-renovation`)

| Use | Route | Permission | Idempotent today? |
|---|---|---|---|
| list | `GET /api/gazoblok/orders` | `order.view` | n/a |
| detail | `GET /api/gazoblok/orders/{id}` | `order.view` | n/a |
| add truck | `POST /api/gazoblok/orders/{id}/shipments` | `order.edit` | **no** |
| load / correct | `POST …/shipments/{sid}/load` (multipart: `loadedLines`, `confirmOverload`, `file`×n) | `order.edit` (+`order.editShipped` on DELIVERED truck) | **no** |
| truck delivered | `PATCH …/shipments/{sid}` | `order.edit` | guarded (2nd call → 409) |
| order delivered / payment | `PATCH /api/gazoblok/orders/{id}` | per action | **no** |
| receipt photo | `POST /api/gazoblok/upload-receipt` | `payment.record` | no (dup file harmless) |
| delivery photo | — **missing** | | |

**Mobile auth:** no change needed. `withPermission`/`withAuth` call `getCurrentUser()`, which reads the cookie first,
then `Authorization: Bearer <jwt>` (`src/lib/auth.ts` `bearerFromHeader`, `MOBILE_AUDIENCE`), and `middleware.ts`
already lets Bearer API calls through. Gazoblok routes therefore accept the app's token as they are.

**Server changes required (web worktree, before the APK can ship):**
- **S1 Idempotency.** Wrap with `withIdempotency` (as beam-and-block's `orders/[id]/shipments/[sid]/load`): gazoblok
  load, shipments POST, shipment PATCH, order PATCH, upload-receipt. Without it a retry after a dropped connection can
  record a payment twice or add a second empty truck, and the outbox rule (Android architecture: "an operation may be
  QUEUED only if its route is `withIdempotency`-wrapped") forbids queueing the load.
- **S2 Delivery-proof route.** `POST /api/gazoblok/orders/{id}/delivery-proof`, multipart `file` (one image),
  `order.edit`, idempotent; saves under `gazoblok/orders/{id}`, sets `deliveryProofUrl` + `deliveryProofUploadedAt`,
  writes event `DELIVERY_PROOF` «Етказиш сурати юкланди». Refused on CANCELED. No schema change (columns exist).
  Reason: today the only gazoblok upload is `upload-receipt`, which needs `payment.record` and stores in the receipts
  folder — a loader/driver without payment rights could not attach the photo.
- **S3 Contract fixtures.** Commit sample JSON of list, detail and the 409 over-load body
  (`docs/api/gazoblok-contract/*.json`, `text eol=lf`) captured from the local dev DB, so Android DTO tests parse the
  real shape.

**Release order:** web Stage 1 + S1–S3 deployed to prod (owner says "deploy") **before** any Stage-4 APK is published;
an APK against today's prod would hit the old routes (no `quantities`, no over-load confirm).

## 6. Offline / outbox

The app has a Room outbox (`OutboxEntity`, `OutboxKind` stored as a string, `OutboxWorker`; row id = `Idempotency-Key`).
- **Queued (works offline):** `GAZOBLOK_LOAD` — the yard has weak signal and photos are large. Payload JSON:
  `{orderId, shipmentId, loadedLines, confirmOverload}`; photos as the existing outbox files. New enum value only;
  the kind is a string column, so **no Room migration** (DB stays version 7).
- **Online only (Idempotency-Key header on every call, retried in place):** add truck, truck delivered, delivery photo,
  record payment (+ receipts), order delivered. Money and status writes are not queued: a queued payment would hide a
  ceiling refusal until much later.
- A queued load that the server later refuses with 409 `OVERLOAD_CONFIRM_REQUIRED` fails **permanently** and shows in
  the outbox's failed list with the server text; the loader reopens the truck online and confirms. Pending queued
  loads are counted as "on other trucks" in the next load screen (same reason as beam `loadedBeams`).

## 7. Data and money on the phone

- New DTOs in `:core:network` (`GazoblokDto.kt`), domain in `:core:model` (`Gazoblok.kt`), mappers in `:core:data`.
  Money = existing `Money` over `BigDecimal` (never Double/Long). Block counts = `Int`.
- Quantities and over-load: a pure Kotlin `GazoblokQuantities` in `:core:model` mirroring
  `src/lib/gazoblok-quantities.ts` `lineQuantities` / `overloadLines`, unit-tested with the cases of
  `tests/gazoblok-quantities.test.ts`. Used only for display and the pre-confirm; the server decides.
- Delivered-button reasons mirror `canDeliver` (`tests/gazoblok-rules.test.ts` cases), pure and unit-tested.
- Numbers through the existing formatters (`1 554 000`, `4,90`), mono tabular in tables.

## 8. Permissions (same keys as web, read from the cached `me`)

| Action on phone | Key |
|---|---|
| see segment, list, detail | `order.view` |
| add truck, load, correct (not delivered), truck delivered, order delivered, delivery photo | `order.edit` |
| correct a delivered truck | `order.editShipped` |
| record payment, receipt photos | `payment.record` |

Hide what the user lacks; disable-with-reason only what the order's state blocks now.

## 9. Testing

- **Web (S1–S3):** vitest on extracted helpers + route tests in the repo's existing style; `npx tsc --noEmit`, lint.
- **Android unit:** DTO parsing against S3 fixtures; mappers; `GazoblokQuantities`; delivered-reasons; ViewModels
  (fake repository: success, 409 over-load → sheet → resend with flag, 403, offline → queued); outbox worker dispatch for
  `GAZOBLOK_LOAD`; Roborazzi screenshots of list, detail (open / over-loaded / closed), load sheet, confirm sheet,
  payment sheet — light and dark, long client name, 0 trucks, 9-digit sums.
- **Build:** `gradlew testDebugUnitTest` then `assembleDebug` — **one Gradle run at a time, in the foreground, Bash
  timeout 600000**, never while the owner tests on the emulator (memory `reference_emulator_starvation`).
- **Emulator walk:** debug build against local web (`10.0.2.2:3000`) on the `gazoblok-reno` server with the local dev
  DB: load truck 1 short, truck 2 over (confirm sheet), deliver both trucks, delivery photo, record Click payment as an
  operator (orange), confirm on web, order «Етказилди». Screenshots of every built screen to the owner before any merge.

## 10. Calls made by the designer (owner may overrule)

1. Entry is a «Плита | Газоблок» switch on the Orders tab, not a new bottom-bar cell.
2. Only the truck load is queued offline; money and status writes are online-only.
3. Delivery photo is one per order (existing `deliveryProofUrl`), via a new route; no per-truck delivery photo (that
   needs a schema change — Stage 3 if wanted).
4. Close short, cancel, refunds, payment confirmation and placing gazoblok orders stay web-only in Stage 4.
5. No paging (server returns ≤ 100 newest).

## 11. Risks

- **Prod dependency:** the APK needs Stage 1 + S1–S3 live; publishing earlier breaks gazoblok on phones.
- **Branch divergence:** never push `feat/android-gazoblok` or `feat/android-restyle` to `main`.
- **Concurrent Android work:** other Android branches (`feat/android-restyle` unpushed commits) may move; rebase the
  Stage-4 branch on its head before merge, one Gradle build at a time across ALL worktrees.
- **Signing:** releases use the PC-local debug keystore (memory `project_android_signing_key`) — publishing must be done
  from this PC.
