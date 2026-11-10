# Gazoblok Stage 3 — Missing Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder, order edit/reschedule, refund dialog, stock history, delivery pin, quote card to chat, orders-list filters, a clean Uzbek sweep and the order-screen polish — on top of Stage 1 rules, after Stage 2.

**Architecture:** Pure rules in new `src/lib/gazoblok-{edit,reorder,order-filters,stock-history,text}.ts` (unit-tested); thin routes under `src/app/api/gazoblok/**` call them inside the Stage-1 row-locked transactions; screens reuse beam-and-block components (`DeliveryLocationCard`, `RefundDialog`, `SendQuoteToChatButton`, `ShareCalculationButton`); two additive schema changes.

**Tech Stack:** Next 14.2 App Router, TypeScript strict, Prisma 5 (`db push`, no migrations folder), zod, vitest (`tests/**/*.test.ts`), react-query, Tailwind HSL tokens, `<Bi>`/`useT`.

**Spec:** `docs/superpowers/specs/2026-11-10-gazoblok-stage3-design.md` (section numbers below = §). Parent rules: `docs/superpowers/specs/2026-11-10-gazoblok-renovation-design.md` §2, §4. Comps: `C:\Users\aziz\Downloads\gazoblok-visual\comps\01,05,07,08` + `direction.md`.

Paths are relative to `precast-crm/` in worktree `.claude/worktrees/gazoblok-reno` (branch `feat/gazoblok-renovation`). Test command prefix: `cd precast-crm && npx vitest run <file>`.

## Global Constraints

- UI strings Uzbek Cyrillic via `<Bi>`/`useT(uz,en)`; units «м³», «мм», «та», «кг», currency «UZS»; «Click»/«Payme» stay Latin; numbers via `formatNumber` (thousands space, decimal comma); all figures `font-mono tabular-nums`, money right-aligned.
- API errors keep `"Узбекча · English"`; money in messages via `formatNumber`. Every state change writes a `GazoblokOrderEvent` with `actorId` and an Uzbek message, plus `recordAudit`.
- Every money/quantity write on an order: `prisma.$transaction` → `SELECT id FROM gazoblok_orders WHERE id=$1 FOR UPDATE` → re-read → validate → write (copy `lockOrder`/`Refused` from `src/app/api/gazoblok/orders/[id]/route.ts`).
- Finished orders are final: DELIVERED, CANCELED or `shortClosedAt` set → no edit, no pin change. `isOpen()` from `src/lib/gazoblok-rules.ts`.
- Permission keys only from `GAZOBLOK_PERMISSION` (`src/lib/gazoblok-permissions.ts`); edit of lines/money after any block is loaded needs `order.editShipped`.
- Delivery cost is only ever what an operator types; never copied by reorder, never computed.
- Payment chips: awaiting = muted «Кутилмоқда»; partial = primary «Қисман»; paid = success «Тўлиқ»; pending payment = `warning` «Тасдиқланмаган». Order total is never green unless fully paid. Dismiss buttons say «Орқага».
- Tokens only from `src/app/globals.css`; no coloured left-border stripes; 44 px controls; 412 px phone has no sideways scroll; light + dark.
- Schema changes additive and nullable; local DB = isolated `precast_crm_gazoblok_reno` (never shared `precast_crm`, never prod).
- No push / deploy until the owner says "deploy"; screenshots of built screens first.
- Stage 2 is already merged on the branch when this runs: do not re-plan its surfaces (dashboard, payments queue/bell, client page, cash ledger, Excel, calendar, sidebar). On a merge conflict in a shared file keep both sides.

## Review Focus

1. **Operator with `order.edit` but not `order.editShipped` edits quantities after a truck left** — refused 403 with «Юк жўнатилган — фақат эгаси ўзгартира олади»; a date-only change on the same order succeeds. → Task 2 test `editPolicy splits reschedule from money edits`.
2. **Edit lowers a size below what a truck loaded meanwhile** — refused with the size and both numbers. → Task 2 test `editPlan refuses below loaded` (route re-reads under the lock, Task 7).
3. **Reorder after a price rise or an archived size** — draft shows today's price and lists the archived size as dropped; nothing stale is billed. → Task 3 test `reorderDraft prices today and drops archived`.
4. **Phone search typed as displayed («+998 90 111 22 33», «111 22»)** — finds the client. → Task 4 test `phone search is digits-only`.
5. **Refund typed «1 000 000» (space or NBSP)** — parsed as 1000000, not rejected. → Task 6 test `parseDecimal accepts thousands spaces`.

---

### Task 1: Schema columns and request contracts

**Parallel group: A** (runs first, alone)

**Files:** Modify `prisma/schema.prisma` (model `GazoblokOrder`); Modify `src/lib/gazoblok-validation.ts`; Test `src/lib/gazoblok-validation.test.ts` (extend).

**Interfaces — Produces:**
- `GazoblokOrder` += `sourceOrderId String?`, `sourceOrder GazoblokOrder? @relation("GazoblokReorder", fields: [sourceOrderId], references: [id], onDelete: SetNull)`, `reorders GazoblokOrder[] @relation("GazoblokReorder")`, `@@index([sourceOrderId])`, `deliveryLat Float?`, `deliveryLng Float?`, `deliveryLocationUrl String?`, `deliveryLocationLabel String?`.
- `PlaceGazoblokOrderSchema` += `sourceOrderId: z.string().min(1).optional()`.
- `GazoblokEditOrderSchema = z.object({ lines?: {lineId?: string; productId: string; quantity: int ≥1}[] (min 1, max 50), discountPercent?: 0..100, discountAmount?: ≥0, deliveryCost?: ≥0, scheduledAt?: z.coerce.date().nullable(), notes?: string(trim, max 1000).nullable() })` refined: at least one key present (message «Ўзгариш йўқ · Nothing to change»); `export type GazoblokEditOrderInput`.
- `record_refund.notes` becomes `z.string().trim().min(5).max(500)` (required).

- [ ] **Step 1: Failing tests** in `gazoblok-validation.test.ts`: `GazoblokEditOrderSchema.safeParse({})` fails; `{scheduledAt: null}` passes; `{lines: [{productId: "p", quantity: 0}]}` fails; `PlaceGazoblokOrderSchema` keeps `sourceOrderId: "o1"`; `GazoblokOrderActionSchema` `record_refund` without `notes` fails, with `"Ортиқча тўлов"` passes.
- [ ] **Step 2: Run** `npx vitest run src/lib/gazoblok-validation.test.ts` — FAIL.
- [ ] **Step 3: Implement** the schema fields (hand-edit; do NOT run `prisma format` — it re-aligns unrelated lines) and the zod changes. `npx prisma db push` against `precast_crm_gazoblok_reno` (`.env` `DATABASE_URL`), `npx prisma generate`.
- [ ] **Step 4: Run** the test + `npx tsc --noEmit` — PASS / 0 errors. (The Stage-1 inline refund form sends no `notes` and will get a 400 until Task 22 replaces it with `RefundDialog` — acceptable on the branch.)
- [ ] **Step 5: Commit** `Feat(gazoblok) · reorder link and delivery pin columns, edit contract`.

### Task 2: Edit policy and edit plan

**Parallel group: B** · **Files:** Create `src/lib/gazoblok-edit.ts`; Test `tests/gazoblok-edit.test.ts`.

**Interfaces — Consumes:** `lineQuantities`, `loadedByLine` (`gazoblok-quantities.ts`), `isOpen` (`gazoblok-rules.ts`), `orderTotal` (`@/services/gazoblok-engine`), `computeOvership` (`gazoblok-overship.ts`), `blockVolumeM3`.
**Produces:**
- `type EditScope = "none" | "schedule" | "money"` and `editScope(input: GazoblokEditOrderInput): EditScope` — `money` if `lines|discount*|deliveryCost` present, else `schedule`.
- `editPolicy(o: { status: string; shortClosedAt: Date|string|null; totalLoaded: number }, scope: EditScope, perms: { edit: boolean; editShipped: boolean }): { status: number; message: string } | null` — closed → 409 «Буюртма ёпилган — таҳрирлаб бўлмайди · The order is closed»; no `edit` → 403 «Буюртмани ўзгартиришга рухсат йўқ · You can't change orders»; `money` && totalLoaded>0 && !editShipped → 403 «Юк жўнатилган — фақат эгаси ўзгартира олади · Blocks were loaded — only the owner can change quantities or prices».
- `type EditChange = { field: "line" | "lineAdded" | "lineRemoved" | "discount" | "delivery" | "date" | "notes" | "total"; label: string; before: string; after: string }`.
- `editPlan(input: { order: { linesSubtotal: number; discountPercent: number; discountAmount: number; deliveryCost: number; overshipAmount: number; totalPrice: number; scheduledAt: Date|null; notes: string|null }; lines: { id: string; productId: string|null; productLabel: string; quantity: number; unitPrice: number }[]; shipments: { loadedLines: unknown }[]; products: { id: string; label: string; pricePerBlock: number; active: boolean; lengthM: number; heightM: number; thicknessM: number }[]; edit: GazoblokEditOrderInput }): { problem: { status: number; message: string } } | { lineOps: { update: {id: string; quantity: number; lineTotal: number}[]; create: {productId: string; productLabel: string; unitPrice: number; quantity: number; lineTotal: number}[]; remove: string[] }; totals: { linesSubtotal: number; discountPercent: number; discountAmount: number; deliveryCost: number; overshipAmount: number; totalPrice: number; totalBlocks: number }; scheduledAt: Date|null; notes: string|null; changes: EditChange[] }`.
- `orderVolumeM3(lines: { quantity: number; product: { lengthM: number; heightM: number; thicknessM: number } | null }[]): number` — rounded to 3 dp (used by Task 7 and Task 12).
- `changesText(changes: EditChange[]): string` — `"; "`-joined «label: before → after».

Rules: existing line keeps `unitPrice`; new product priced `pricePerBlock`, must be `active`; duplicate productId → 422 «Бир ўлчам икки марта · Same size twice»; quantity < loaded → 409 via `floorText` «Юкланганидан кам қилиб бўлмайди — 600×300×200: юкланган 168, янгисида 150»; omitted line with loaded>0 → same 409; absent discount → `orderTotal` with stored `discountPercent`; `totalPrice = total + overshipAmount` from `computeOvership` on new lines; no changes → 409 «Ўзгариш йўқ · Nothing changed».

- [ ] **Step 1: Failing tests** (fixture A 600×300×200 ordered 200 @18 000, loaded 168 via shipment `{A:168}`; delivery 300 000; discount 0):
  - `editPolicy splits reschedule from money edits`: totalLoaded 168, perms {edit:true, editShipped:false}: `schedule` → null; `money` → status 403 matching /эгаси/; editShipped true → null; status DELIVERED → 409; shortClosedAt set → 409.
  - `editPlan refuses below loaded`: lines `[{lineId:"A", productId:"pA", quantity:150}]` → problem 409 message contains `168` and `150`; omitting A → 409.
  - `editPlan raises a line at its frozen price`: A → 250 with catalog price 20 000 → update `{id:"A", quantity:250, lineTotal:4500000}`, totals.linesSubtotal 4 500 000, totalPrice 4 800 000, changes include `{field:"line", before:"200", after:"250"}`.
  - `editPlan adds a new size at today's price`: + `{productId:"pB", quantity:10}` (B active, 25 000) → create lineTotal 250 000; B inactive → 422.
  - `editPlan absorbs an over-load`: shipment `{A:220}`, overshipAmount 360 000, A → 220 → overshipAmount 0, totalPrice unchanged (3 960 000 + 300 000).
  - `editPlan keeps percent discount`: discountPercent 10 stored, A → 250 → discountAmount 450 000.
  - date-only `{scheduledAt: 2026-11-14}` → lineOps empty, changes `[{field:"date"}]`; identical values → problem 409 «Ўзгариш йўқ».
  - `orderVolumeM3([{quantity:200, product:{lengthM:0.6,heightM:0.3,thicknessM:0.2}}])` → 7.2.
- [ ] **Step 2: Run** `npx vitest run tests/gazoblok-edit.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement** `src/lib/gazoblok-edit.ts` (pure: no Prisma, no `new Date()`).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `Feat(gazoblok) · order edit rules`.

### Task 3: Reorder draft

**Parallel group: B** · **Files:** Create `src/lib/gazoblok-reorder.ts`; Test `tests/gazoblok-reorder.test.ts`.

**Interfaces — Consumes:** `lineQuantities`. **Produces:**
- `type ReorderDraft = { source: { id: string; orderNumber: string; placedAt: string; status: string }; client: { name: string; phone: string; address: string | null }; lines: { productId: string; label: string; quantity: number; unitPrice: number; previousUnitPrice: number; previousLoaded: number }[]; dropped: { label: string; quantity: number }[]; previous: { deliveryCost: number; discountPercent: number; scheduledAt: string | null } }` (spec §3 shape).
- `reorderDraft(src: { id; orderNumber; placedAt: Date; status; deliveryCost: number; discountPercent: number; scheduledAt: Date|null; client: {name; phone; address}; lines: {id; productId: string|null; productLabel; quantity; unitPrice: number}[]; shipments: {loadedLines: unknown}[] }, catalog: { id; label; pricePerBlock: number; active: boolean }[]): ReorderDraft`.

- [ ] **Step 1: Failing tests** `reorderDraft prices today and drops archived`: source lines A(200 @18 000, loaded 220), B(100, product archived), C(productId null) → `lines` = [A quantity 200, unitPrice = catalog 20 000, previousUnitPrice 18 000, previousLoaded 220]; `dropped` = [B 100, C …]; `previous.deliveryCost` 300 000; client fields copied; all archived → `lines: []`.
- [ ] **Step 2: Run** `npx vitest run tests/gazoblok-reorder.test.ts` — FAIL.
- [ ] **Step 3: Implement** (catalog `label` wins over the old snapshot label).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `Feat(gazoblok) · reorder draft from a past order`.

### Task 4: Orders list query, flags, phone search

**Parallel group: B** · **Files:** Create `src/lib/gazoblok-order-filters.ts`; Test `tests/gazoblok-order-filters.test.ts`.

**Interfaces — Consumes:** `unpaidOverload` (`gazoblok-quantities.ts`), `refundDue`, `OVERPAY_ALERT_MIN` (`@/lib/overpayment`). **Produces:**
- `type OrderListQuery = { q: string; status?: GazoblokStatus; pay?: "AWAITING_PAYMENT"|"PARTIALLY_PAID"|"FULLY_PAID"; flag?: "debt"|"refund"|"unconfirmed"; seller?: string; from?: Date; to?: Date; limit: number; cursor?: string }`.
- `parseOrderListQuery(sp: URLSearchParams): OrderListQuery` — unknown enum values dropped; `limit` default 50, clamp 1..200; `from`/`to` `YYYY-MM-DD` → local `00:00` / next day `00:00` (server `TZ=Asia/Tashkent`); bad dates dropped.
- `phoneDigits(q: string): string | null` — digits only when q has ≥ 3 digits and no letters, else null.
- `buildOrderWhere(q: OrderListQuery, flaggedIds: string[] | null): Prisma.GazoblokOrderWhereInput` — `OR` [orderNumber contains q (insensitive), client.name contains q, client.phone contains phoneDigits(q)]; status, paymentState, createdById, placedAt {gte from, lt to}; `id: { in: flaggedIds }` when non-null.
- `orderFlags(o: { status: string; totalPrice: number; confirmedPaid: number; overshipAmount: number; pendingCount: number }): { debt: boolean; refund: boolean; unconfirmed: boolean }` — debt = status≠CANCELED && unpaidOverload>0.005; refund = refundDue ≥ OVERPAY_ALERT_MIN; unconfirmed = pendingCount>0.

- [ ] **Step 1: Failing tests:** `phone search is digits-only` — `phoneDigits("+998 90 111 22 33")` → `"998901112233"`, `"111 22"` → `"11122"`, `"Тест"` → null, `"B-2026"` → null; `buildOrderWhere` with q "111 22" contains `{ client: { phone: { contains: "11122" } } }`; `parseOrderListQuery("limit=999&status=BAD&from=2026-11-01")` → limit 200, status undefined, from = local 2026-11-01 00:00; `orderFlags` — CANCELED with paid 500 000 → refund true, debt false; overship 360 000, total 4 260 000, paid 3 900 000 → debt true; pendingCount 1 → unconfirmed.
- [ ] **Step 2: Run** `npx vitest run tests/gazoblok-order-filters.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `Feat(gazoblok) · orders list filters and flags`.

### Task 5: Stock history helpers

**Parallel group: B** · **Files:** Create `src/lib/gazoblok-stock-history.ts`; Test `tests/gazoblok-stock-history.test.ts`.

**Interfaces — Consumes:** `lineQuantities`, `isOpen`. **Produces:**
- `MOVEMENT_REASON_LABELS: Record<GazoblokStockReason, [uz: string, en: string]>` — SHIPMENT_LOAD «Машина юкланди», SHIPMENT_CORRECTION «Юк тузатилди», PRODUCTION «Ишлаб чиқарилди», MANUAL_ADJUSTMENT «Қўлда тузатиш», SALE «Буюртма етказилди (эски тартиб)», CANCELLATION_RESTOCK «Бекор қилинди — омборга қайтди».
- `movementText(m: { reason: GazoblokStockReason; note: string | null; shipmentNumber: number | null; orderNumber: string | null }): string` — e.g. «Машина юкланди · Жўнатма 2 · B-2026-11-0012»; manual «Қўлда тузатиш · «Синган блоклар»».
- `reservedByProduct(orders: { status: string; shortClosedAt: Date|null; lines: {id; productId: string|null; productLabel; quantity}[]; shipments: {loadedLines: unknown}[] }[]): Map<string, number>` — Σ `left` over `isOpen` orders.

- [ ] **Step 1: Failing tests:** `movementText` for SHIPMENT_LOAD (2, B-2026-11-0012) → exact string above; MANUAL_ADJUSTMENT note «Синган блоклар» → «Қўлда тузатиш · «Синган блоклар»»; `reservedByProduct` — open order pA 200 loaded 168 → 32; DELIVERED / CANCELED / short-closed orders ignored; over-loaded line contributes 0.
- [ ] **Step 2: Run** `npx vitest run tests/gazoblok-stock-history.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `Feat(gazoblok) · stock movement texts and reserved blocks`.

### Task 6: Uzbek text helpers; parseDecimal with thousands spaces

**Parallel group: B** · **Files:** Create `src/lib/gazoblok-text.ts`; Modify `src/lib/gazoblok-quantities.ts` (`parseDecimal` only); Test `tests/gazoblok-text.test.ts`, `tests/gazoblok-quantities.test.ts` (extend).

**Interfaces — Produces:**
- `uzPart(message: string, lang: "uz" | "bilingual"): string` — in `uz` returns the text before the first `" · "`; bilingual unchanged.
- `STATUS_LABELS: Record<"PLACED"|"IN_PRODUCTION"|"DELIVERED"|"CANCELED", [string, string]>` — «Қабул қилинган», «Ишлаб чиқилмоқда», «Етказилган», «Бекор қилинган».
- `eventText(e: { type: string; message: string | null; payload: unknown }): string` — STATUS_CHANGED with `payload.from/to` → «Ҳолат: Қабул қилинган → Етказилган»; ORDER_PLACED with English message «Order placed for X» → «Буюртма қабул қилинди — X» (`reorderOf` in payload → «Қайта буюртма (B-… асосида) — X»); PAYMENT_RECORDED/CONFIRMED with `payload.amount` and English message → «Тўлов ёзилди: 1 000 000 UZS» / «Тўлов тасдиқланди: …»; otherwise the stored message (already Uzbek).
- `placedText(clientName: string, reorderOf: string | null): string`, `statusChangeText(from: string, to: string): string` (used by Tasks 8 and 12).
- `parseDecimal` accepts spaces and NBSP between digit groups: `"1 000 000"`, `"1 000 000"`, `"1 000,5"`.

- [ ] **Step 1: Failing tests:** `uzPart("Рухсат йўқ · Permission denied", "uz")` → «Рухсат йўқ»; bilingual unchanged; no separator unchanged. `eventText` cases above (amount 1000000 → `/1\s000\s000 UZS/`). `parseDecimal accepts thousands spaces`: `"1 000 000"` → 1000000, `"1\u00a0000\u00a0000"` → 1000000, `"7,5"` → 7.5, `"1 000,5"` → 1000.5, `"1 0 0"` → null (spaces only between 3-digit groups: `/^-?\d{1,3}([ \u00a0]\d{3})*([.,]\d+)?$|^-?\d+([.,]\d+)?$/`).
- [ ] **Step 2: Run** `npx vitest run tests/gazoblok-text.test.ts tests/gazoblok-quantities.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS (existing parseDecimal cases still pass).
- [ ] **Step 5: Commit** `Feat(gazoblok) · Uzbek event texts; money input accepts 1 000 000`.

### Task 7: Edit route

**Parallel group: C** · **Files:** Create `src/app/api/gazoblok/orders/[id]/edit/route.ts`; Test `tests/gazoblok-edit.test.ts` (extend with `changesText`).

**Interfaces — Consumes:** Task 1 schema, Task 2 `editScope/editPolicy/editPlan/orderVolumeM3/changesText`, `refundDue`, `paymentStateFor`. **Produces:** `PATCH /api/gazoblok/orders/[id]/edit` → `200 { id, totalPrice, paymentState, refundDue }` (spec §4).

- [ ] **Step 1: Failing test** `changesText` → «600×300×200: 200 → 250 та; Етказиб бериш: 300 000 → 350 000 UZS» (NBSP-tolerant `\s`).
- [ ] **Step 2: Run** `npx vitest run tests/gazoblok-edit.test.ts` — FAIL.
- [ ] **Step 3: Implement** the route: `withAuth`; parse; tx { `lockOrder`; re-read order + lines (with product dims) + shipments + active catalog for new productIds; `editPolicy(…, editScope(body), {edit: can(user,"order.edit"), editShipped: can(user,"order.editShipped")})` → `Refused`; `editPlan` → `Refused`; apply `lineOps` (update/create/deleteMany ids); recompute `confirmedPaid` from CONFIRMED payments; update order totals + `totalVolumeM3` + `paymentState` + `scheduledAt` + `notes`; event `ORDER_RESCHEDULED` when scope is `schedule` and only the date changed, else `ORDER_EDITED`, message `changesText`, payload `{ before, after, changes }` }; `recordAudit({action:"gazoblok.order.edit"})`. (Event labels are added by Task 12, which owns `gazoblok-labels.ts`.)
- [ ] **Step 4: Run** test + `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** `Feat(gazoblok) · edit and reschedule an open order`.

### Task 8: Orders route — filters, paging, reorder link, Uzbek messages; counts route

**Parallel group: C** · **Files:** Modify `src/app/api/gazoblok/orders/route.ts`; Create `src/app/api/gazoblok/orders/counts/route.ts`. *(Stage 2 may have added a notification call to POST — keep it.)*

**Interfaces — Consumes:** Task 4 `parseOrderListQuery/buildOrderWhere/orderFlags`, Task 6 `placedText`, `lineQuantities`, `unpaidOverload`, `refundDue`. **Produces:** GET contract of spec §9 (array; items += `loadedBlocks`, `unpaidOverload`, `refundDue`; cursor paging `orderBy [{placedAt:"desc"},{id:"desc"}]`, `take: limit`, `cursor: {id}`, `skip: 1`); POST accepts `sourceOrderId`; `GET /api/gazoblok/orders/counts` → `{ all, byStatus, flags: {debt, refund, unconfirmed}, sellers: [{id, name, count}] }` (`order.view`).

- [ ] **Step 1:** GET — when `flag` set, select `{id,status,totalPrice,confirmedPaid,overshipAmount,_count:{select:{payments:{where:{status:"PENDING_CONFIRMATION"}}}}}` for all orders, keep ids where `orderFlags(...)[flag]`; pass to `buildOrderWhere`; include `shipments: {select: {loadedLines: true}}`; map extra fields; drop raw shipments/payments from the response.
- [ ] **Step 2:** POST — if `sourceOrderId`, `findUnique` it (422 «Асл буюртма топилмади · Source order not found»), store it, payload `reorderOf: orderNumber`; ORDER_PLACED message `placedText(client.name, reorderOf)`; placement payment event messages in Uzbek («Тўлов ёзилди: X UZS (усул)», «Тўлов тасдиқланди: X UZS») with `formatNumber`. Fix stale doc comments (GET is `order.view`, POST `order.create`, stock moves per truck at loading).
- [ ] **Step 3:** counts route — same light select + `groupBy createdById` joined to user names.
- [ ] **Step 4: Verify** `npx tsc --noEmit` 0; `npx vitest run tests/gazoblok-order-filters.test.ts` PASS; on the local app `curl` (logged-in cookie) `/api/gazoblok/orders?q=111%2022` returns the seeded client, `/api/gazoblok/orders/counts` returns the shape.
- [ ] **Step 5: Commit** `Feat(gazoblok) · orders search by phone digits, filters, paging, counts; reorder link`.

### Task 9: Reorder draft route

**Parallel group: C** · **Files:** Create `src/app/api/gazoblok/orders/[id]/reorder/route.ts`.

**Interfaces — Consumes:** Task 3 `reorderDraft`. **Produces:** `GET /api/gazoblok/orders/[id]/reorder` (`withPermission("order.create")`) → `ReorderDraft`; 404 «Буюртма топилмади · Order not found».

- [ ] **Step 1:** load order with client, lines, shipments(loadedLines); catalog `findMany` (all products, `active` field); return `ok(reorderDraft(...))` with Decimals `Number()`-ed.
- [ ] **Step 2: Verify** `npx tsc --noEmit` 0; curl on a seeded order returns the shape with today's prices.
- [ ] **Step 3: Commit** `Feat(gazoblok) · reorder draft route`.

### Task 10: Delivery location route

**Parallel group: C** · **Files:** Create `src/app/api/gazoblok/orders/[id]/delivery-location/route.ts`.

**Interfaces — Consumes:** `DeliveryLocationBody` from `@/app/api/orders/[id]/delivery-location/schema`. **Produces:** `PATCH` (`withPermission("order.edit")`) → `{ id, deliveryLat, deliveryLng, deliveryLocationUrl, deliveryLocationLabel }`; 409 «Ёпилган буюртманинг манзилини ўзгартириб бўлмайди · The order is finished» when status DELIVERED/CANCELED; event `DELIVERY_LOCATION_SET` «Манзил белгиланди: <label ?? lat, lng>» or `DELIVERY_LOCATION_CLEARED` «Манзил ўчирилди» in the same transaction.

- [ ] **Step 1: Implement** (mirror `src/app/api/orders/[id]/delivery-location/route.ts`, plus status check and event).
- [ ] **Step 2: Verify** `npx tsc --noEmit` 0; curl set then clear on a seeded order; events appear in GET detail.
- [ ] **Step 3: Commit** `Feat(gazoblok) · delivery map pin on orders`.

### Task 11: Stock movements route; reserved blocks on stock

**Parallel group: C** · **Files:** Create `src/app/api/gazoblok/stock/movements/route.ts`; Modify `src/app/api/gazoblok/stock/route.ts`.

**Interfaces — Consumes:** Task 5 `reservedByProduct`. **Produces:** `GET /api/gazoblok/stock/movements` (`inventory.view`) → `{ items, nextCursor }` per spec §6 (cursor = movement id; `orderBy [{createdAt:"desc"},{id:"desc"}]`; reason whitelisted against the enum; shipment numbers via one `gazoblokShipment.findMany({ where: { id: { in } }, select: { id, number } })`); `GET /api/gazoblok/stock` items += `reserved: number`.

- [ ] **Step 1: Implement** both; fix the stale "auth-only" doc comments in `stock/route.ts`.
- [ ] **Step 2: Verify** `npx tsc --noEmit` 0; on the local app load a truck then curl movements — first item reason `SHIPMENT_LOAD`, `shipmentNumber` 1, `order.orderNumber` set; `/api/gazoblok/stock` shows `reserved`.
- [ ] **Step 3: Commit** `Feat(gazoblok) · stock movement history and reserved blocks`.

### Task 12: Order action route fixes; event labels

**Parallel group: C** · **Files:** Modify `src/app/api/gazoblok/orders/[id]/route.ts`, `src/lib/gazoblok-labels.ts`. *(Shared with Stage 2 if it added payment notifications here — keep them.)*

**Interfaces — Consumes:** Task 2 `orderVolumeM3`, Task 6 `statusChangeText`. **Produces:** GET detail += `sourceOrder: {id, orderNumber} | null`, `reorders: {id, orderNumber}[]` (scalar pin fields come automatically); `EVENT_TYPE_LABELS` += `ORDER_EDITED`, `ORDER_RESCHEDULED`, `DELIVERY_LOCATION_SET`, `DELIVERY_LOCATION_CLEARED` = «Буюртма таҳрирланди», «Сана ўзгартирилди», «Манзил белгиланди», «Манзил ўчирилди» (with English pairs).

- [ ] **Step 1:** `record_payment`: re-read `status` inside the locked transaction; CANCELED → `Refused(422, …)` (deferred minor 1).
- [ ] **Step 2:** `close_short`: load lines with product dims, set `totalVolumeM3 = orderVolumeM3(loaded quantities)` (deferred minor 2).
- [ ] **Step 3:** `set_status` event message `statusChangeText(from, to)`; fix the "auth-only (open to all)" GET comment.
- [ ] **Step 4: Verify** `npx tsc --noEmit` 0; `npx vitest run tests/gazoblok-order-actions.test.ts tests/gazoblok-rules.test.ts` PASS.
- [ ] **Step 5: Commit** `Fix(gazoblok) · cancelled check under lock, volume on close short, Uzbek status events`.

### Task 13: Over-load confirm saves photos once

**Parallel group: C** · **Files:** Modify `src/app/api/gazoblok/orders/[id]/shipments/[sid]/load/route.ts`; Test `tests/gazoblok-load.test.ts` (extend if a helper is extracted).

- [ ] **Step 1:** Before saving any file, read lines + other shipments (no lock) and run `planLoad`; if `overload.length && !confirmOverload` return the same 409 `OVERLOAD_CONFIRM_REQUIRED` without touching the disk. The in-transaction check stays (race safety).
- [ ] **Step 2: Verify** `npx vitest run tests/gazoblok-load.test.ts` PASS; manually: over-load with one photo → confirm → shipment has exactly 1 photo URL.
- [ ] **Step 3: Commit** `Fix(gazoblok) · over-load confirm no longer saves truck photos twice`.

### Task 14: Reconcile script undo replay; small cleanups

**Parallel group: C** · **Files:** Modify `scripts/gazoblok-reconcile-stock.ts`, `src/lib/gazoblok-reconcile.ts` (only if a helper is needed), `src/lib/mcp/quote/gazoblok.ts` (remove unused `foldForSearch` import); Test `tests/gazoblok-reconcile.test.ts` (extend).

**Produces:** `invertMoves(moves: { orderId; shipmentId; productId; change: number }[]): same[]` (in `gazoblok-reconcile.ts`); script flags: `--undo=<file>` (dry run prints; with `--apply` posts the file's moves as `SHIPMENT_CORRECTION` with note «reconcile undo»); planning now runs **inside** the `--apply` transaction; the undo file is written inside the transaction callback before commit and reported after.

- [ ] **Step 1: Failing test** `invertMoves` flips signs and keeps ids; double inversion = identity.
- [ ] **Step 2: Run** `npx vitest run tests/gazoblok-reconcile.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** test PASS; `npx tsx scripts/gazoblok-reconcile-stock.ts` on the local DB prints a report; `--undo=<generated file>` dry run prints the inverse.
- [ ] **Step 5: Commit** `Fix(gazoblok) · reconcile plans under the transaction, undo replay; drop unused import`.

### Task 15: Edit order dialog

**Parallel group: D** · **Files:** Create `src/components/gazoblok/GazoblokEditOrderDialog.tsx`.

**Interfaces — Consumes:** Task 7 route, Task 2 `editPlan` (live preview, client-side, same function), Task 6 `uzPart`, `parseDecimal`. **Produces:** `<GazoblokEditOrderDialog open onClose order={…detail GET shape…} catalog={Product[]} perms={{ edit: boolean; editShipped: boolean }} mode={"full" | "schedule"} onSaved={() => void} />`.

- [ ] **Step 1: Implement** per spec §4 UI: `Dialog` (bottom sheet ≤ 640 px), per-size rows with mono inputs and «камида N (юкланган)», add-size select (active catalog), discount % / amount, delivery, date, notes; preview «Жами: A → B UZS», warning «Қайтариш керак бўлади: X UZS» when B < confirmed paid; money fields disabled with «Юк жўнатилган — фақат эгаси ўзгартира олади» when loaded and no `editShipped`; errors shown via `uzPart`; buttons «Сақлаш» / «Орқага».
- [ ] **Step 2: Verify** `npx tsc --noEmit` 0 (rendered in Task 22).
- [ ] **Step 3: Commit** `Feat(gazoblok) · edit order dialog`.

### Task 16: Share card

**Parallel group: D** · **Files:** Create `src/components/gazoblok/GazoblokShareCard.tsx`.

**Interfaces — Consumes:** `orderWeightKg` (`gazoblok-weight.ts`), `lineQuantities`. **Produces:** `<GazoblokShareCard order={detail} />` — white fixed-light card (inline `#ffffff` background like `CalculationShareCard`; it is an image for customers, not themed), brand header copied from `CalculationShareCard`'s header markup, rows «ўлчам · та · нарх · сумма» (ordered; loaded when `shortClosedAt`), discount, delivery, **Жами UZS**, «Оғирлик: N кг», «Ҳажм: N м³». `shareCaption(order): string` exported from the same file: `№B-… · Name\nЖами: X so'm\nОғирлик: N кг`.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify** `npx tsc --noEmit` 0.
- [ ] **Step 3: Commit** `Feat(gazoblok) · share card for the client`.

### Task 17: RefundDialog accepts a custom submit

**Parallel group: D** · **Files:** Modify `src/components/payments/RefundDialog.tsx` (beam-and-block shared component — additive only).

**Produces:** optional props `submit?: (v: { amount: number; method: PaymentMethod; paidOn: string; note: string }) => Promise<void>` (when set, called instead of `POST /api/orders/${orderId}/refund`) and `showDate?: boolean` (default `true`; `false` hides the date field).

- [ ] **Step 1: Implement**; beam-and-block call sites unchanged.
- [ ] **Step 2: Verify** `npx tsc --noEmit` 0; beam-and-block order refund still posts to `/api/orders/[id]/refund` (open a floor order with refund due locally, dialog shows date).
- [ ] **Step 3: Commit** `Refactor(payments) · RefundDialog takes an optional submit and date toggle`.

### Task 18: Orders list — filters, pills, phone cards

**Parallel group: D** · **Files:** Modify `src/app/(app)/gazoblok/orders/page.tsx`.

**Interfaces — Consumes:** Task 8 GET + counts, Task 6 `STATUS_LABELS`. **Produces:** the comp-05 list (spec §9 UI). Filter state in the URL (`useSearchParams` inside a `<Suspense>` child; `router.replace` on change); `useInfiniteQuery` with `cursor`; «Кўпроқ кўрсатиш» while the last page had `limit` rows; empty state «Бу шартларга мос буюртма йўқ» + «Фильтрларни тозалаш»; pending payment chip «Тасдиқланмаган» `warning`; no `border-l-[3px]`; ≤ 760 px stacked cards.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify** in the browser (local app): search «111 22» finds the client; «Ортиқча юклаш» pill shows only debt orders; 412 px no sideways scroll (`document.documentElement.scrollWidth <= 412`).
- [ ] **Step 3: Commit** `Feat(gazoblok) · orders list filters, counts and phone layout`.

### Task 19: Stock page — reserved and history

**Parallel group: D** · **Files:** Modify `src/app/(app)/gazoblok/stock/page.tsx`; Create `src/components/gazoblok/GazoblokStockHistory.tsx`.

**Interfaces — Consumes:** Task 11 routes, Task 5 `movementText`, `MOVEMENT_REASON_LABELS`. **Produces:** comp-08 stock table «Ўлчам, мм · Омборда · Буюртмаларга керак · Бўш · Чегара» (Бўш < 0 destructive; no left-border stripes; size shown once) and `<GazoblokStockHistory productId?: string />` section «Ҳаракатлар тарихи» with size pills, reason select, paged rows, order numbers linking to the order, phone stacked rows.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify** in the browser: a truck load appears as «Машина юкланди · Жўнатма 1 · B-…» with −N and the resulting balance; size pill filters.
- [ ] **Step 3: Commit** `Feat(gazoblok) · stock history and blocks reserved by open orders`.

### Task 20: New order — reorder prefill; text sweep of the form

**Parallel group: D** · **Files:** Modify `src/app/(app)/gazoblok/new/page.tsx`, `src/components/gazoblok/GazoblokWallCalculator.tsx` (text only).

**Interfaces — Consumes:** Task 9 draft route, Task 8 POST `sourceOrderId`. **Produces:** `/gazoblok/new?from=<id>` reads `from` (via a `<Suspense>`-wrapped child using `useSearchParams`), fetches the draft once, fills client name/phone/address and lines (`productId`, `quantity`), shows the strip «Қайта буюртма: B-… асосида» with «олдин юкланган N», «олдин 18 000» price notes, dropped sizes, greyed hints for previous delivery/discount; sends `sourceOrderId`. Money inputs parsed with `parseDecimal`; «м³», «мм»; English helper strings → `useT`.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify** in the browser: from a delivered order «Қайта буюртма» → form prefilled at today's prices → place → new order header shows «B-… асосида»; the source lists the new order.
- [ ] **Step 3: Commit** `Feat(gazoblok) · reorder prefills a new order for the same client`.

### Task 21: Breadcrumb, catalog and production sweep

**Parallel group: D** · **Files:** Modify `src/components/TopBar.tsx` (one map entry `gazoblok: { uz: "Газоблок", en: "Gazoblok" }`), `src/app/(app)/gazoblok/catalog/page.tsx`, `src/app/(app)/gazoblok/production/page.tsx`.

- [ ] **Step 1: Implement** spec §10: catalog titles through `<Bi>` (no hard bilingual strings), «мм» everywhere (table shows mm, not metres), grouped price display, read-only form + note «Нархни фақат нарх ҳуқуқи борлар ўзгартиради» when `/api/auth/me` lacks `pricing.edit`; production «Хато ёзувни ўчириш», no left stripes.
- [ ] **Step 2: Verify** in the browser in UZ-only mode: no Latin text except «B-», «UZS», «Click», «Payme».
- [ ] **Step 3: Commit** `Polish(gazoblok) · breadcrumb, catalog and production in Uzbek`.

### Task 22: Order screen — wire everything and audit fixes

**Parallel group: E** (after D) · **Files:** Modify `src/app/(app)/gazoblok/orders/[id]/page.tsx`, `src/components/gazoblok/GazoblokDebtPanel.tsx`, `src/components/gazoblok/GazoblokShipmentsSection.tsx`, `src/components/gazoblok/GazoblokSplitShipmentModal.tsx`, `src/components/gazoblok/GazoblokQuantitiesTable.tsx`, `src/components/gazoblok/GazoblokCloseShortDialog.tsx` (text/sweep only where needed).

**Interfaces — Consumes:** Tasks 10, 12, 15, 16, 17, 6, `canDeliver`, `DeliveryLocationCard`, `ShareCalculationButton`, `SendQuoteToChatButton`.

- [ ] **Step 1:** Header actions: «Қайта буюртма» (`order.create`, link `/gazoblok/new?from=id`), «Таҳрирлаш» (open order, `order.edit`), «Расм» (`ShareCalculationButton` on an off-screen `GazoblokShareCard` ref), «Чатга юбориш» (`SendQuoteToChatButton`, `conversationId={null}`, caption `shareCaption`, only with `inbox.access`). «Санани ўзгартириш» beside «Жадвал:» opens the dialog in `schedule` mode. Links «B-… асосида» / «Қайта буюртмалар: …».
- [ ] **Step 2:** Money block: total `text-foreground` unless `FULLY_PAID`; «Тўланган» success; «Қолди»; «Шундан ортиқча юклаш»; «м³». Delivered button disabled with the `canDeliver` reason list in place; cancel disabled with «N та юкланган»; dismiss buttons «Орқага»; history rows `ким · eventText(e) · formatDateTime`; errors via `uzPart`; payment amount via `parseDecimal`, pending chip «Тасдиқланмаган» `warning`.
- [ ] **Step 3:** `DeliveryLocationCard` with `PATCH /api/gazoblok/orders/[id]/delivery-location` (`canEdit` = `order.edit` and order not finished).
- [ ] **Step 4:** Refunds: `GazoblokDebtPanel` refund block → figure + «Пулни қайтариш» opening `RefundDialog` with `showDate={false}` and `submit` → `PATCH {action:"record_refund", amount, method, notes: note}`; without `payment.confirm` show «Фақат тўловни тасдиқловчи қайтара олади». Payments table: negative rows «−500 000» `text-warning`, chip «Қайтарилди», recorder name + date.
- [ ] **Step 5: Verify** `npx tsc --noEmit` 0; in the browser: edit A 200→250 (history shows «600×300×200: 200 → 250 та …»), reschedule as an operator after a load (allowed) and quantity edit (refused with reason), set and clear a pin, refund 500 000 typed «500 000», send-to-chat picker opens, PNG downloads.
- [ ] **Step 6: Commit** `Feat(gazoblok) · order screen: edit, reorder, pin, share, refund dialog, audit fixes`.

### Task 23: Verification

**Parallel group: F** (last) · **Files:** Create `tests/gazoblok-ui-text.test.ts`.

- [ ] **Step 1: Text guard test** — reads every file under `src/app/(app)/gazoblok/**`, `src/components/gazoblok/**` and `src/app/api/gazoblok/**` and asserts none contains any of these exact substrings: `"} m³"`, `" mm<"`, `"(dims in mm)"`, `"Order placed for"`, `"Payment of "`, `"auto-confirmed (recorder"`, `"border-l-[3px]"`, `"Тасдиқ кутилмоқда"`. Run it; fix any hit in the owning file.
- [ ] **Step 2: Run** `npx tsc --noEmit` → 0 errors; `npx vitest run` → all files pass (record counts in the ledger); `npm run build` → success; `npm run lint` → no new warnings in touched files; `graphify update .` (project rule).
- [ ] **Step 3: Screenshots** on the isolated local app (DB `precast_crm_gazoblok_reno`), 1440 and 412 wide, light and dark, into `docs/screenshots/gazoblok-stage3/`: orders list (filters active, empty result), order detail (edit dialog, reschedule, pin card, refund dialog, share card PNG), new order prefilled by reorder, stock page with history. Edge data: a 60-character client name, a 999 999 999 UZS order, an order with zero loaded, a cancelled order with refund due.
- [ ] **Step 4: Owner gate** — report screenshots, the Calls list (spec §14) and the overlaps with Stage 2; no push, no deploy until the owner says "deploy". At deploy: `prisma db push` adds 5 nullable columns + 1 index (rollback: columns stay unused).
