# MCP quote tools — design

Date: 2026-10-07 · Status: owner said "build" (tools 1–4; tool 5 not requested)
Branch: `feat/mcp-quote-tools` (from origin/main 2c119f38)

## 1. Why

Claude (claude.ai, connected to the CRM MCP server) will answer Instagram customers who send room
sizes. It must never compute prices itself: every price and quantity comes from these tools, using
the same engine, live prices and layout rules the CRM uses for real orders and for the Telegram
agent. No second copy of any formula.

## 2. Owner decisions

| # | Decision |
|---|---|
| D1 | Tools: `get_quote` (floor), `get_gazoblok_quote`, `get_quote_by_id`, `render_quote_image`. `create_lead_from_quote` not now. |
| D2 | Gazoblok is priced per catalog size; grade is not priced (echoed only). |
| D3 | No expiry. `validity: "until_withdrawn"`. The price is locked when quoted. Staff withdraw a quote by deleting its draft. Claude cannot edit or delete. |
| D4 | Every floor quote lives as an **AI draft** in «Лойиҳалар» (`aiGenerated`, existing AI filter + badge), named «Claude · Instagram[ · customer_ref]». |
| D5 | Same `customer_ref` re-quoted → the SAME draft is refreshed; the older quote is marked `superseded` with `superseded_by`. One live draft per customer. |
| D6 | Orientation `"auto"` (default) = beams span the shorter wall; `"as_given"` = `width_m` is the span. Response says `beams_span: "short_side" \| "long_side"` and `span_m`. |
| D7 | Props are the customer's → in `excludes`. Pallets not returned (loaded without pallets). |
| D8 | Image = the existing CRM quote card the Telegram agent sends (`renderAgentQuoteImage`). |
| D9 | Same engine + Г-Б-Г policy as the agent (`withAgentPatternPolicy` → `computeOrderTotals`); beams > 6.30 m → `needs_manual_review` / `span_over_6_30`, not priced, not saved. |

## 3. Data

New additive table (the draft stays in `projects`; this holds the immutable quote):

```prisma
model McpQuote {
  id               String   @id @default(cuid())
  number           Int      @unique @default(autoincrement())   // quote_id = "Q-<number>"
  kind             String                                       // "slab" | "gazoblok"
  source           String   @default("claude_mcp")
  customerRef      String?
  projectId        String?                                      // slab only; SetNull when the draft is deleted
  supersededById   String?
  priceListVersion String
  input            Json
  snapshot         Json                                         // the exact response returned
  createdAt        DateTime @default(now())
  project          Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)
  @@index([customerRef])
  @@index([projectId])
  @@map("mcp_quotes")
}
```

Status of a quote (derived, never stored):
`withdrawn` (slab whose draft was deleted → `projectId` null) > `superseded` (`supersededById` set)
> `ordered` (draft status ORDERED) > `active`.

## 4. Tools

### get_quote
In: `rooms[1..20] {name?, width_m, length_m}`, `bearing_cm?` (default 15, 0–30), `orientation?`
(`auto` default | `as_given`), `customer_ref?` (e.g. Instagram handle, ≤ 80 chars), `lang?` (`uz` Latin default | `ru` | `en`).

Validation (whole call refused): any size ≤ 0 or non-number → `INVALID_INPUT`; `width_m` > 12 or
`length_m` > 50 (as sent) → `WIDTH_OUT_OF_RANGE` / `LENGTH_OUT_OF_RANGE`; > 20 rooms → `TOO_MANY_ROOMS`.

Per room: orientation → (span, run); `withAgentPatternPolicy({innerWidth: span, innerLength: run,
bearing})`; beam > 6.30 → `status: "needs_manual_review", reason: "span_over_6_30"` (no price);
otherwise priced through `computeOrderTotals` + `calcResultToCreatePayload` (exactly what a draft
row stores).

Out:
```
quote_id, draft_number, customer_ref, created_at, validity: "until_withdrawn", status: "active",
supersedes (quote_id | null), price_list_version, source: "claude_mcp",
rooms[]: { name, status, reason?, width_m, length_m (as sent), orientation, beams_span, span_m,
  area_m2 (monolith), billed_area_m2, beam_length_m, beam_count, block_rows, block_count,
  closing_piece "none"|"beam"|"block_row", closing_piece_price, strands_per_beam (4/5/6),
  needs_prop (beam > 5.30), price_per_m2, subtotal },
totals { area_m2, beam_count, block_count, total_weight_kg (Σ monolith × 180), total_price, currency "UZS" },
includes, excludes[], warnings[]
```
If no room is priceable: nothing is saved, `quote_id: null`, warnings explain.

### get_gazoblok_quote
In: `size?` ("600x300x200") | `thickness_cm?`; `grade?` (echoed); exactly one of
`quantity_blocks` | `volume_m3` | `wall_area_m2`; `district?`; `customer_ref?`; `lang?`.
Size from the active catalog (`resolveGazoblokProduct` / label match) else `UNKNOWN_SIZE`.
Blocks: quantity as given; volume → ceil(volume × blocksPerM3); wall area → `estimateWall`
(area, height 1, default waste). Price `lineTotal`. `delivery_included` when `district` folds
(`foldForSearch`) to contain `yangiqorgon`. `in_stock` = stock quantity ≥ blocks (untracked →
true, owner policy). Saved as `McpQuote` kind gazoblok (no draft; status active/superseded).

### get_quote_by_id
In: `quote_id` ("Q-12", "Q12", "12"). Out: the saved snapshot with `status` and `superseded_by`.
Unknown → `QUOTE_NOT_FOUND`.

### render_quote_image
In: `quote_id`. Active/ordered slab quote → PNG of the CRM quote card for its draft (MCP image
content). Superseded → `QUOTE_SUPERSEDED` (names the newer id). Withdrawn → `QUOTE_WITHDRAWN`.
Gazoblok → `NOT_AVAILABLE`.

## 5. Cross-cutting

- Auth: existing bearer (`checkBearer`). Rate limit 60 calls/hour for these tools (in-memory
  `RateLimiter`, key `claude_mcp`) → `RATE_LIMITED`.
- Every call → `recordAudit({ userId: null, action: "mcp.<tool>", metadata: { source: "claude_mcp", ... } })`.
- Errors: `isError: true`, content `{ error_code, message }` in plain English.
- `price_list_version` = `<pricing row updatedAt yyyy-mm-dd | "default">.<sha256(config)[0..6]>`.
- Texts (includes/excludes/warnings/delivery note) in uz (Latin) / ru / en.

## 6. Testing

Unit (pure): orientation + 4×6 golden (3 749 600, 11 beams, 200 blocks, 4 strands, no prop),
6×4 auto = same as 4×6, as_given 6×4 = 6.30 beam priced at 180 000, 7×8 → manual review,
validation codes, closing piece mapping, strands/prop thresholds, gazoblok modes + district fold,
status precedence, quote-id parsing. Local HTTP smoke against `/api/mcp` (JSON-RPC tools/call):
draft created, supersede on same customer_ref, withdrawn after draft delete, image renders.

## 7. Out of scope

`create_lead_from_quote`; any edit/delete via MCP; pallets; grade pricing.
