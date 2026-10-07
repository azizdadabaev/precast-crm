# MCP Quote Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. TDD per task.

**Goal:** Four MCP tools (`get_quote`, `get_gazoblok_quote`, `get_quote_by_id`, `render_quote_image`) that price from the CRM's own engine, save floor quotes as AI drafts, and keep an immutable quote record.

**Architecture:** Pure builders in `src/lib/mcp/quote/` (slab, gazoblok, status, texts) wrap the existing engine (`withAgentPatternPolicy` → `computeOrderTotals` → `calcResultToCreatePayload`; gazoblok engine). A store module persists `McpQuote` rows and the AI draft. `src/lib/mcp/tools/quotes.ts` registers the tools with rate limit, audit and the error envelope.

**Spec:** `docs/superpowers/specs/2026-10-07-mcp-quote-tools-design.md`

## Global Constraints
- Local DB `precast_crm_fulfil` only. Schema change additive only (new `mcp_quotes` table + back-relation).
- No formula copies: prices/quantities only via the engine functions named above.
- Errors: `{ error_code, message }`, `isError: true`. Audit every call with `source: "claude_mcp"`.
- Never import from `tests/` outside tests; no new dependencies.

## Review Focus
1. Same `customer_ref` quoted twice → one draft, old quote `superseded`, `superseded_by` = new id; old quote still returns its original snapshot.
2. Draft deleted by staff → quote `withdrawn`; render refuses.
3. Room 7 × 8 m (auto orients to 7 m span → 7.30 beam) → `needs_manual_review`, excluded from totals; all rooms unpriceable → nothing saved.
4. `as_given` with width > length → priced on the long span, `beams_span: "long_side"`.
5. District written in Cyrillic («Янгиқўрғон тумани») → `delivery_included: true`.

## Tasks
1. **Schema** — add `McpQuote` + `Project.mcpQuotes`; `prisma db push` local; `prisma generate`.
2. **Slab builder** (`quote/facts.ts`, `quote/texts.ts`, `quote/slab.ts` + tests) — `validateRooms`, `orientRoom`, `buildSlabQuote(input, pricing, priceListVersion)` → `{ rooms, priced RoomInput[], calcs, totals, warnings }`; 4×6 golden.
3. **Gazoblok builder** (`quote/gazoblok.ts` + tests) — `buildGazoblokQuote(input, catalog, stockByProduct)`; modes, district fold, `UNKNOWN_SIZE`.
4. **Status + store** (`quote/status.ts` + tests; `quote/store.ts`) — `parseQuoteId`, `quoteStatus`, `saveSlabQuote` (draft create/refresh by customer_ref, supersede), `saveGazoblokQuote`, `loadQuote`, `priceListVersion`.
5. **Tools** (`tools/quotes.ts`, register in `server.ts`) — rate limit (60/h), audit, error envelope, render via `renderAgentQuoteImage`.
6. **Verify** — tsc, vitest, local MCP HTTP smoke (`scripts/smoke-mcp-quotes.ts`), next build; commit.
7. **Deploy** — only after the owner's OK: backup, build, `db push` (additive), up, verify, tell the web agent the tools are live.
