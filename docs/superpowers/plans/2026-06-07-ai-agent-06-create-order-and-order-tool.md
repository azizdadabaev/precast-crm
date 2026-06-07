# AI Agent — Plan 06: Extract `createOrder` service + the order tool (`draft_order`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make order-placement callable **without a user session** so the (later) Plan 08 approval handler and the agent's order flow can place a real `Order` through the *same* battle-tested path the human UI uses — and add the **order tool** that writes a `PendingOrder` carrying a price **only** as a verified `quote_id`, never free text.

This is the **heaviest/riskiest** plan: it touches LIVE order-placement code (atomic transaction, monthly `orderNumber` allocation, client phone-dedup, in-app notifications, audit). The refactor is **behavior-preserving** — the existing `POST /api/orders` must return byte-identical responses (same status codes, bilingual messages, body shape, ordering of failures). The safety net is `tsc --noEmit` + the full unit suite + a line-by-line review against the pre-extraction handler.

**Architecture (pure core, thin I/O shell — the pattern the whole agent build uses):**
1. **`src/lib/order-totals.ts`** — a *pure* function `computeOrderTotals(...)` holding the discount/subtotal/total math that price-integrity hinges on (currently inline in the route, lines ~136–183). Exhaustively unit-tested, no Prisma, no `Date`.
2. **`src/lib/create-order.ts`** — the `createOrder(input, actor)` **service**: the `prisma.$transaction` (client dedup → project/calcs → order number → deal → order → events → optional payment), plus the post-commit `recordAudit` + `emitNotifications`. Uses `computeOrderTotals`. Returns a discriminated result `{ ok: true, order } | { ok: false, error }` so the route maps business-rule failures back to its exact `fail(...)` responses, and the agent path can branch too.
3. **`src/lib/agent/order-tool.ts`** — the order tool. Pure core `buildPendingOrderDraft(input, secret)` verifies the `quote_id` via `verifyQuoteToken` and assembles the `PendingOrder` row + idempotency key (unit-tested, no DB). Thin shell `draftOrder(input, deps)` writes the row with **ON CONFLICT DO NOTHING** semantics (`createMany({ skipDuplicates: true })` + `findUnique`) so a webhook retry can't duplicate; `deps.db` is injectable for a fake-DB idempotency test.

**Tech Stack:** TypeScript, Vitest, Node `crypto` (`createHash` for the idempotency key). Reuses `calculateSlab` / `PriceConfig` (`src/services/calculation-engine.ts`), `calcResultToCreatePayload` (`src/lib/calc-persistence.ts`), `verifyQuoteToken` + `SlabQuotePayload` (Plan 04), `normalizePhone`, `nextOrderNumber`/`orderNumberMonthPrefix`, `loadPricingConfig`, `recordAudit`, `emitNotifications`/`usersWithPermission`. No new dependencies.

**Spec sections covered:** §4.2/§6.1 price-integrity chain (the order tool consumes a `quote_id`, never a free-text price); §5 tool table (`draft_order` → `PendingOrder` `awaiting_customer`, UNIQUE `idempotency_key`, ON CONFLICT DO NOTHING); §6 guardrail 3 (the write-action HITL state machine begins at `PendingOrder`); §11 (service-account-callable order placement — prerequisite #2/#3).

**Deliberate deferrals (noted, not silent):**
- The **agent loop** that actually invokes `draft_order`, and the **approval webhook** (`/api/agent/approve`) that flips `PendingOrder → APPROVED` and calls `createOrder` with a service-account actor — both **Plan 08**. Plan 06 makes `createOrder` *callable* session-free and writes the `PendingOrder`; it adds no new HTTP route and no caller of `createOrder` other than the existing route.
- The live `get_quote` tool that *mints* the `quote_id` from live `PriceConfig` — **Plan 07**. Plan 06 only *consumes/verifies* a `quote_id`.
- `notify_staff`/`request_approval` (posting the staff Action Card with the `[Approve][Reject]` keyboard) — **Plan 08** (the keyboard wrappers + callback codec already exist from Plan 03).

---

## Conventions for this plan
- **App directory (run all commands from here):** `precast-crm/`. Paths below are relative to it.
- Branch `feat/telegram-ai-agent` is already checked out — do not switch branches.
- **Behavior-preserving rule (Tasks 1–2):** the externally observable behavior of `POST /api/orders` must not change. Before/after the same request must produce the same HTTP status, the same bilingual message, the same response body, and the same *ordering* of competing failures.

## File Structure
- Create: `src/lib/order-totals.ts` — pure `computeOrderTotals`. Test at `tests/order-totals.test.ts` (the vitest `include` globs cover `tests/**` + `src/lib/agent/**` + `src/lib/telegram/**`, NOT `src/lib/**` — a test next to the module would be silently un-run).
- Create: `src/lib/create-order.ts` — `createOrder(input, actor)` service. (DB; verified via tsc + suite + review, not a DB unit test.)
- Modify: `src/app/api/orders/route.ts` — `POST` delegates to `createOrder`; keeps the user-session authz (`payment.record` 403, `inbox.access` conversationId strip) and the phone-first failure ordering.
- Create: `src/lib/agent/order-tool.ts` — `buildPendingOrderDraft` (pure) + `idempotencyKey` (pure) + `draftOrder` (thin DB shell, injectable db). + test.

---

### Task 1: Pure `computeOrderTotals` (the price math, extracted & tested)

**Files:** Create `src/lib/order-totals.ts` + `src/lib/order-totals.test.ts`.

This lifts the route's lines ~136–183 verbatim (same `calculateSlab` call shape, same `calcResultToCreatePayload`-based `roomsSubtotal`, same discount precedence: `discountAmount > 0` wins, capped at `roomsSubtotal`, percent back-computed; else `discountPercent`). Pure — `pricing: PriceConfig` is injected.

Signature:
```ts
export interface ComputedRoom { input: RoomInput; result: SlabResult; }
export interface OrderTotals {
  computed: ComputedRoom[];
  roomsSubtotal: number;
  totalArea: number;       // Σ monolith_area
  totalBlocks: number;     // Σ total_blocks
  totalBeams: number;      // Σ beam_count
  discountAmount: number;
  resolvedDiscountPercent: number;
  totalPrice: number;      // roomsSubtotal - discountAmount + deliveryCost + otherCost
}
export function computeOrderTotals(
  rooms: PlaceOrderRoom[],
  opts: { discountPercent: number; discountAmount: number; deliveryCost: number; otherCost: number },
  pricing: PriceConfig,
): OrderTotals
```
where `PlaceOrderRoom` is the per-room shape from `PlaceOrderSchema` (reuse `RoomInput` from `calc-persistence.ts` extended with the calculator levers already present there). The `calculateSlab` argument mapping is copied exactly from the route (`inner_width: room.innerWidth`, …, `pattern: (room.patternOverride ?? undefined) as Pattern | undefined`).

**Tests (pure, deterministic):** known dims → assert each total equals the engine's own numbers; discount-amount path caps at subtotal and back-computes percent; discount-percent path; both-zero default; `roomsSubtotal === 0` guard (no divide-by-zero, percent stays 0); a per-room `m2PriceOverride` changes `roomsSubtotal` to match `calcResultToCreatePayload`.

---

### Task 2: `createOrder` service + rewire the route (behavior-preserving)

**Files:** Create `src/lib/create-order.ts`; modify `src/app/api/orders/route.ts`.

`createOrder` is the route's `POST` body **minus** the two checks that need the HTTP user session (kept in the route): the `payment.record` 403 gate and the `inbox.access` `conversationId` strip.

```ts
export interface OrderActor {
  /** Stamped on OrderEvent.actorId, AuditLog.userId, and (only when paidAmount>0)
   *  Payment.recordedById. null = AI-agent / approval service-account path; all
   *  three columns are nullable EXCEPT Payment.recordedById, which is written only
   *  on the human route path (paidAmount>0 ⇒ actor.userId is non-null there). */
  userId: string | null;
}
export type CreateOrderInput = z.infer<typeof PlaceOrderSchema>;
export type CreateOrderErrorCode =
  | "PHONE_REQUIRED" | "PAID_AMOUNT_EXCEEDS_TOTAL"
  | "PROJECT_NOT_FOUND" | "PROJECT_ALREADY_ORDERED";
export interface CreateOrderError { code: CreateOrderErrorCode; message: string; status: number; details?: unknown; }
export type CreateOrderResult =
  | { ok: true; order: OrderWithClientProject }
  | { ok: false; error: CreateOrderError };
export async function createOrder(input: CreateOrderInput, actor: OrderActor): Promise<CreateOrderResult>
```

Body, in the route's current order (so failure precedence is preserved):
1. `phoneNorm = normalizePhone(input.clientPhone)`; if empty → `{ ok:false, error:{ code:"PHONE_REQUIRED", message:"phone is required", status:422 } }`.
2. `pricing = await loadPricingConfig()`; `totals = computeOrderTotals(input.rooms, input, pricing)`.
3. `paidAmount = input.paidAmount ?? 0`; if `paidAmount > totals.totalPrice` → `PAID_AMOUNT_EXCEEDS_TOTAL` (422), message `` `paidAmount (${paidAmount}) cannot exceed totalPrice (${totals.totalPrice})` `` — identical to today.
4. `placedAt = new Date()` → year/month → `monthPrefix`.
5. Pre-tx project guard (copied verbatim): not found → `PROJECT_NOT_FOUND` (404, bilingual); `status==="ORDERED"` → `PROJECT_ALREADY_ORDERED` (409, bilingual, `details:{ existingOrderId, existingOrderNumber }`).
6. `order = await prisma.$transaction(...)` — the existing transaction verbatim, except `user.id` → `actor.userId` (OrderEvent `actorId`, the optional Payment's `recordedById` + its OrderEvent `actorId`). Includes `{ client: true, project: true }`. The in-tx `throw new Error("PROJECT_NOT_FOUND")` race guard stays.
7. Post-commit (verbatim, fire-and-forget): `void recordAudit({ userId: actor.userId, action:"order.place", … metadata:{ …, roomCount: input.rooms.length } })`; `void (async () => { const userIds = await usersWithPermission("payment.confirm"); void emitNotifications({ type:"ORDER_PLACED", userIds, … }); })()`.
8. `return { ok: true, order }`.

**Route after rewire:**
```ts
export const POST = withPermission("order.create", async (req, { user }) => {
  const body = PlaceOrderSchema.parse(await req.json());

  // Preserve the original failure ordering: phone (422) is reported before the
  // payment-permission gate (403). createOrder re-validates phone for the
  // session-free path; this early check only fixes precedence for the route.
  if (!normalizePhone(body.clientPhone)) return fail("phone is required", 422);

  const paidAmount = body.paidAmount ?? 0;
  if (paidAmount > 0 && !can(user, "payment.record")) {
    return fail("Сизга тўлов киритиш рухсати йўқ · You can't record payments — place the order with paidAmount=0 and add payment separately", 403);
  }

  const result = await createOrder(body, { userId: user.id });
  if (!result.ok) return fail(result.error.message, result.error.status, result.error.details);

  const order = result.order;
  if (order.project && !can(user, "inbox.access")) order.project.conversationId = null;
  return created(order);
});
```
The `GET` handler is untouched.

**Verification (no DB unit test for the tx):** `npx tsc --noEmit`; `npx vitest run` (full suite green, incl. Task 1); a side-by-side diff of the moved transaction against the pre-extraction handler confirming only `user.id → actor.userId` changed; confirm the four error messages/statuses/details match `git show HEAD:src/app/api/orders/route.ts` exactly.

---

### Task 3: The order tool (`draft_order`) — quote_id-only, writes `PendingOrder`

**Files:** Create `src/lib/agent/order-tool.ts` + `src/lib/agent/order-tool.test.ts`.

**Pure core (unit-tested):**
```ts
export function idempotencyKey(conversationId: string, confirmationMsgId: string): string {
  // spec §5: sha256(conversationId + ":" + confirmation_msg_id), hex.
  return createHash("sha256").update(`${conversationId}:${confirmationMsgId}`).digest("hex");
}

export interface DraftOrderInput {
  quoteId: string;                 // the ONLY source of price
  conversationId: string;
  confirmationMsgId: string;       // the customer msg that triggered the draft (idempotency)
  clientId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  deliveryAddress?: string | null;
  notes?: string | null;
}
export interface PendingOrderDraft {
  conversationId: string;
  clientId: string | null;
  quoteId: string;
  idempotencyKey: string;
  payload: {
    quote: SlabQuotePayload;       // the trusted, verified price snapshot — NOT free text
    customerName: string | null;
    customerPhone: string | null;
    deliveryAddress: string | null;
    notes: string | null;
  };
}
export type BuildDraftResult =
  | { ok: true; draft: PendingOrderDraft }
  | { ok: false; reason: "MISSING_FIELDS" | "INVALID_QUOTE" };

export function buildPendingOrderDraft(
  input: DraftOrderInput, secret: string, opts?: { now?: number },
): BuildDraftResult
```
Rules: missing `quoteId`/`conversationId`/`confirmationMsgId` → `MISSING_FIELDS`. `verifyQuoteToken<SlabQuotePayload>(quoteId, secret, opts)` returns null (tampered/forged/expired/malformed) → `INVALID_QUOTE` (caller escalates / re-quotes — never invents a price). Otherwise assemble the draft; price lives only inside the verified `payload.quote`.

**Thin DB shell (injectable db; one idempotency test with a fake):**
```ts
export interface DraftOrderDb {
  pendingOrder: {
    createMany(args: { data: PendingOrderRow[]; skipDuplicates: boolean }): Promise<{ count: number }>;
    findUnique(args: { where: { idempotencyKey: string } }): Promise<PendingOrderRow | null>;
  };
}
export async function draftOrder(
  input: DraftOrderInput,
  deps: { secret: string; db?: DraftOrderDb; now?: number },
): Promise<{ ok: true; pendingOrder: PendingOrderRow; created: boolean } | { ok: false; reason: "MISSING_FIELDS" | "INVALID_QUOTE" }>
```
Builds the draft (pure); on `ok`, `createMany({ data:[row], skipDuplicates:true })` (ON CONFLICT DO NOTHING — a retry never duplicates and never bumps `updatedAt`), then `findUnique({ where:{ idempotencyKey } })` to return the canonical row; `created = count === 1`. `db` defaults to `prisma`. Status defaults to `AWAITING_CUSTOMER`.

**Tests:** `idempotencyKey` is stable + collision-resistant on different inputs + correct hex shape. `buildPendingOrderDraft`: valid quote → ok, `payload.quote.price` matches the minted quote, idempotency key matches; forged-secret quote → `INVALID_QUOTE`; expired quote (`now` past `expiresAt`) → `INVALID_QUOTE`; missing fields → `MISSING_FIELDS`; the draft never contains a free-text price field. `draftOrder` with a fake `db`: first call creates (`created:true`), second call with same `confirmationMsgId` returns the same row (`created:false`, `skipDuplicates` hit) — proves idempotency without a real DB.

---

## Self-review (done by plan author)

- **Spec coverage:** §4.2/§6.1 — the order tool accepts only a `quote_id` and re-verifies it (`buildPendingOrderDraft` → `verifyQuoteToken`); null ⇒ refuse, never free-text price. §5 — `draft_order` writes `PendingOrder` `AWAITING_CUSTOMER` with UNIQUE `idempotencyKey = sha256(conversationId:confirmationMsgId)` and ON CONFLICT DO NOTHING. §6 guardrail 3 — the `PendingOrder` is the first node of the Propose→Confirm→Approve→Commit machine; commit (via `createOrder`) is wired but only *called* in Plan 08. §11 — `createOrder` is now session-free (actor abstraction), satisfying the "service-account-callable order placement" prerequisite.
- **Behavior-preservation argument:** the route keeps the two session-dependent checks (`payment.record` 403, `inbox.access` strip) and the phone-first early check, so failure precedence and all responses are unchanged; the moved transaction differs from the original only in `user.id → actor.userId`; audit + notifications keep their fire-and-forget post-commit ordering. No new route, no new caller of `createOrder`.
- **Deferred (explicit):** agent loop + approval webhook + the service-account *caller* of `createOrder` (Plan 08); `get_quote` minting (Plan 07); staff Action Card posting (Plan 08). Stated up top.
- **Risk controls:** the riskiest piece (the live transaction) is a verbatim move guarded by `tsc` + full suite + a pre/post diff; the price-critical math (`computeOrderTotals`) and the price-trust gate (`buildPendingOrderDraft`) are pure and exhaustively unit-tested; idempotency is proven with a fake-DB test.
- **Type consistency:** `createOrder(input: CreateOrderInput, actor: OrderActor): Promise<CreateOrderResult>`; `computeOrderTotals(rooms, opts, pricing): OrderTotals`; `buildPendingOrderDraft(input, secret, opts?): BuildDraftResult`; `draftOrder(input, { secret, db?, now? })`. `SlabQuotePayload` reused from `slab-quote.ts`; `verifyQuoteToken` generic param set to it.
