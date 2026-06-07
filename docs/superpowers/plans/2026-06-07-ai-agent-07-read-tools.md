# AI Agent — Plan 07: Live `get_quote` + gazoblok/stock/lookup read tools

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the agent its read-only toolset — the live, grounded numbers it is *forced* to use instead of inventing (spec §4.2 layer 1). The keystone is **`get_quote`**, which mints the signed `quote_id` the Plan 06 order tool consumes — closing the price-integrity chain end-to-end (calculator → `quote_id` → `draft_order`). Plus `get_gazoblok_quote`, `check_stock`, and `lookup_client`.

These are all **read tools** (no writes). They follow the same pure-core + thin-shell pattern as the rest of the build: the grounded logic is a pure function with injected dependencies (live `PriceConfig`/catalog/secret), exhaustively unit-tested; the thin `execute` shell loads the live data (Prisma / `AppConfig` / `process.env`) and is kept dumb. Each tool also carries a **provider-agnostic definition** (`name`, `description`, JSON-Schema `inputSchema`) — the description encodes what the tool does NOT cover so the model escalates instead of guessing (spec §5). Plan 08 adapts these definitions to Claude/Gemini/OpenAI tool formats and dispatches them in the agent loop.

**Spec sections covered:** §4.2 layer 1 (tool-forced live numbers; price-integrity chain), §5 tool table rows `get_quote`, `get_gazoblok_quote`, `check_stock`, `lookup_client`, §6.7 (tool failure → escalate, never guess), §7/§10 (PII minimization for `lookup_client`).

**Tech stack:** TypeScript, Vitest, Zod (runtime input validation). Reuses `buildSlabQuote` + `SlabQuotePayload` (Plan 04), the gazoblok engine (`src/services/gazoblok-engine.ts`), `loadPricingConfig` (`src/lib/pricing-config.ts`), `normalizePhone`/`phoneMatchForms` (`src/lib/phone.ts`). No new dependencies.

**Deliberate deferrals (noted, not silent):**
- The **agent loop**, the **LlmProvider** abstraction, provider-specific tool serialization + parallel dispatch, and *forcing* a tool on price turns — **Plan 08**. Plan 07 ships the tool definitions + executors; Plan 08 registers and calls them.
- `transcribe_voice` + `send_reply` (channel/STT side-effect tools) — **Plan 08**.
- Wiring `get_gazoblok_quote`'s `quote_id` into `draft_order` (the Plan 06 order tool currently verifies a `SlabQuotePayload`; a gazoblok pending-order line type lands when the agent actually places block orders) — **Plan 08**.

---

## Conventions for this plan
- **App directory (run all commands from here):** `precast-crm/`. Paths relative to it.
- Branch `feat/telegram-ai-agent` is already checked out — do not switch branches.
- Tests live under `src/lib/agent/tools/*.test.ts` (covered by the `src/lib/agent/**` vitest glob) or `tests/**`. NOT `src/lib/*.test.ts` (un-globbed).
- Money/dimension units: gazoblok catalog dims are **meters** (`Decimal(10,3)`); `InventoryItem.beamLength` is **meters** (`Decimal(10,2)`); all prices **UZS**. Decimals from Prisma → coerce with `Number(...)` at the shell boundary before handing to a pure core.

## File Structure
- Create `src/lib/agent/tools/types.ts` — `AgentToolDefinition`, `AgentTool`, `ToolResult` discriminated helpers (`toolOk`/`toolEscalate`).
- Create `src/lib/agent/tools/get-quote.ts` (+ test) — `get_quote` (slab). Pure `runGetQuote(input, deps)` + live `execute`.
- Create `src/lib/agent/gazoblok-quote.ts` (+ test) — pure `buildGazoblokQuote` (mirrors `slab-quote.ts`) + `resolveGazoblokProduct`.
- Create `src/lib/agent/tools/get-gazoblok-quote.ts` (+ test) — `get_gazoblok_quote`. Live catalog loader in the shell.
- Create `src/lib/agent/tools/check-stock.ts` (+ test) — `check_stock` (floor `InventoryItem` + gazoblok `GazoblokStock`).
- Create `src/lib/agent/tools/lookup-client.ts` (+ test) — `lookup_client` (phone/name, minimal PII).

---

### Task 0: Shared tool types

`src/lib/agent/tools/types.ts`:
```ts
/** Provider-agnostic tool definition. Plan 08 maps {name, description,
 *  inputSchema} → Claude input_schema / Gemini / OpenAI formats. The
 *  description must state what the tool does NOT cover so the model escalates. */
export interface AgentToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema (object), strict-friendly
}

/** What every tool returns to the agent loop. `ok:false` with escalate:true is
 *  the spec's "tool failure / not-found → escalate, never guess" signal. */
export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; escalate: boolean; reason: string };

export const toolOk = <T>(data: T): ToolResult<T> => ({ ok: true, data });
export const toolEscalate = (reason: string): ToolResult<never> =>
  ({ ok: false, escalate: true, reason });

export interface AgentToolContext {
  /** Customer phone from Conversation.sharedContactPhone (digits-only), if any. */
  sharedContactPhone?: string | null;
  /** Clock injection for quote expiry; defaults to Date.now() in the shell. */
  now?: number;
}

export interface AgentTool<T = unknown> {
  definition: AgentToolDefinition;
  execute(rawInput: unknown, ctx?: AgentToolContext): Promise<ToolResult<T>>;
}
```

---

### Task 1: `get_quote` (slab) — the keystone

Pure core wraps `buildSlabQuote` and maps to the spec's output shape; the shell loads live `PriceConfig` + the signing secret.

```ts
export const GetQuoteInput = z.object({
  inner_width: z.coerce.number().positive(),
  inner_length: z.coerce.number().positive(),
  bearing: z.coerce.number().min(0).optional(),
  correction: z.coerce.number().optional(),
  extra_beams: z.coerce.number().int().min(0).optional(),
  force_start_beam: z.coerce.boolean().optional(),
  pattern: z.enum(['GB', 'BGB', 'GBG']).optional(),
});

export interface QuoteData {
  subtotal: number; m2_price: number; pattern: string;
  bill_of_materials: { beams: { count: number; lengthM: number }; blockRows: number; totalBlocks: number; billedAreaM2: number };
  quote_id: string; currency: 'UZS'; validity_ts: number;
}

export function runGetQuote(
  raw: unknown,
  deps: { pricing: PriceConfig; secret: string; now: number; validityMs?: number },
): ToolResult<QuoteData>
```
Behavior: `GetQuoteInput.safeParse` fails → `toolEscalate('invalid dimensions')` (the model re-asks / echoes dims). Empty `secret` → `toolEscalate('quote signing unavailable')` (config error, never crash the loop). Else `buildSlabQuote(...)` (catch `CalculationError` → escalate) and map → `QuoteData`. `bill_of_materials` is read straight off the signed `SlabQuotePayload` (`beamCount`/`beamLength`/`blockRows`/`totalBlocks`/`billedArea`) — no invented fields. The returned `quote_id` is exactly what `draft_order` (Plan 06) verifies.

Shell `execute`: `pricing = await loadPricingConfig()`, `secret = process.env.QUOTE_SIGNING_SECRET ?? ''`, `now = ctx?.now ?? Date.now()`, then `runGetQuote`.

Definition: name `get_quote`; description states it prices **beam-and-block flooring only** from inside-wall dimensions in meters, returns a binding `quote_id`, and does **not** cover gazoblok, delivery dates, or non-standard/irregular shapes → escalate; `strict`-friendly `inputSchema`.

**Tests (pure):** valid dims → `ok`, `quote_id` verifies via `verifyQuoteToken` back to the same price, `validity_ts === now + 24h`, `bill_of_materials` matches `calculateSlab`; empty secret → escalate; invalid dims (0/negative/missing) → escalate; `CalculationError` path → escalate; doubling injected tier prices changes `subtotal`.

---

### Task 2: `buildGazoblokQuote` (pure) + `get_gazoblok_quote`

Pure `src/lib/agent/gazoblok-quote.ts` mirrors `slab-quote.ts`:
```ts
export interface GazoblokQuotePayload {
  kind: 'gazoblok'; currency: 'UZS'; price: number;
  productId: string; label: string; thicknessMm: number;
  unitPrice: number; quantity: number;
  mode: 'quantity' | 'wall';
  wall?: { lengthM: number; heightM: number; openingsM2: number; wastePct: number; blocksNeeded: number };
  issuedAt: number; expiresAt: number;
}
export function resolveGazoblokProduct(catalog, selector): CatalogProduct | null  // by productId, else by thicknessMm among active
export function buildGazoblokQuote(product, req, opts): GazoblokQuote              // req = {quantity} | {wall:{...}}; mints a kind:'gazoblok' token
```
Two modes: direct `quantity` → `lineTotal(unitPrice, quantity)`; or `wall` → `estimateWall(...)` → `blocksNeeded` → price. Throws `GazoblokError` on bad input (caller escalates). Mints with `mintQuoteToken` + `kind:'gazoblok'` (discriminated so a later consumer can branch slab vs gazoblok).

Tool `src/lib/agent/tools/get-gazoblok-quote.ts`: shell loads the live catalog (`prisma.gazoblokProduct.findMany({ where:{active:true}, include:{stock:true} })`, lazy-imported, dims `Number(...)`-coerced), resolves the product, builds the quote. **Empty catalog or no matching size → `toolEscalate` (structured not-found, never invent)** — spec §5. Definition: prices **gazoblok wall blocks only**, selects a size by wall thickness (mm) or productId, takes a quantity or wall dims; does not cover flooring or delivery dates → escalate.

**Tests:** pure `resolveGazoblokProduct` (by id, by thicknessMm, none → null, ignores inactive); `buildGazoblokQuote` quantity + wall modes price correctly and the `quote_id` verifies; empty/over-thickness selector → escalate; `GazoblokError` (negative qty) → escalate.

---

### Task 3: `check_stock`

Read-only availability for a product line — returns a **coarse** status the bot can verbalize, NOT a count to quote, and **never a delivery date** (spec §5: that's an escalation).

```ts
export const CheckStockInput = z.object({
  line: z.enum(['floor', 'gazoblok']),
  // floor: kind BEAM (with beamLengthM) or BLOCK; gazoblok: thicknessMm
  kind: z.enum(['BEAM', 'BLOCK']).optional(),
  beamLengthM: z.coerce.number().positive().optional(),
  thicknessMm: z.coerce.number().positive().optional(),
});
export interface StockData { availability: 'in_stock' | 'low' | 'out_of_stock'; leadTimeApplies: boolean; }
```
Shell resolves the row (`InventoryItem` by `kind`/`beamLength`, or `GazoblokStock` via product `thicknessM`), maps `quantity` vs `lowStockThreshold` → `in_stock` (> threshold) / `low` (`0 < q ≤ threshold`) / `out_of_stock` (≤ 0); `leadTimeApplies = availability !== 'in_stock'`. Row not found → `toolEscalate`. The raw quantity is deliberately **not** returned (the description tells the model to say "in stock" / "limited" / "made to order, lead time applies" and never quote a count or a date).

**Tests (pure mapper):** quantity > threshold → in_stock; within (0, threshold] → low; 0/negative → out_of_stock; the floor vs gazoblok selector resolution (with a fake catalog/inventory list); not-found → escalate.

---

### Task 4: `lookup_client`

Resolve a customer to a `client_id` with **minimum PII** (spec §7/§10): a phone match may return id + name + language; a **name-only** lookup returns id + name **only** (no phone/address) — phone match required for anything more.

```ts
export const LookupClientInput = z.object({
  phone: z.string().optional(),  // raw; normalized in the shell
  name: z.string().optional(),
});
export type ClientMatch = { client_id: string; name: string; language?: string };
export interface LookupData { matchedBy: 'phone' | 'name' | 'none'; clients: ClientMatch[]; }
```
Shell: prefer `phone` (explicit) else `ctx.sharedContactPhone`; `normalizePhone` → `prisma.client.findUnique({ where:{ phone } })` → on hit return `[{client_id, name, language}]`, `matchedBy:'phone'`. Else if `name` → `findMany({ where:{ name:{ contains, mode:'insensitive' } }, take:5 })` → return `[{client_id, name}]` only (no phone/address), `matchedBy:'name'`. Neither → `{ matchedBy:'none', clients:[] }` (this is a normal "new customer" answer, **not** an escalation). Definition warns: returns minimal info; full client details require a phone match; never expose another customer's data.

**Tests:** pure shaping helpers — `toPhoneMatch(client)` includes language; `toNameMatch(client)` strips phone/address; normalization is applied to the lookup key; empty input → `none`. (The Prisma calls are exercised via an injectable `db` like Plan 06's `draftOrder`, or kept in the thin shell and the pure shapers tested directly.)

---

## Self-review (done by plan author)
- **Spec coverage:** §4.2 layer 1 — every changing number (slab price, gazoblok price, stock) comes from a tool; `get_quote` mints the `quote_id` that `draft_order` verifies, completing the price-integrity chain. §5 — all four rows implemented with descriptions that bound scope → escalate; gazoblok empty-catalog → structured not-found. §6.7 — bad input / not-found / missing secret → `toolEscalate`, never a guessed value. §7/§10 — `lookup_client` minimizes PII (name-only ⇒ no phone/address).
- **Deferred (explicit):** agent loop, LlmProvider, tool forcing + parallel dispatch, voice/send tools, gazoblok→draft_order line wiring — all Plan 08.
- **Pattern consistency:** pure cores (`runGetQuote`, `buildGazoblokQuote`, the stock/lookup shapers) are DB-free and unit-tested; thin shells lazy-import Prisma/config and coerce Decimals. Mirrors Plan 04 (`slab-quote`) and Plan 06 (`order-tool`).
- **Decimal safety:** Prisma `Decimal` catalog/stock fields are `Number(...)`-coerced at the shell boundary before any arithmetic.
