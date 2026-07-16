# MCP Server for EtalonSlabs CRM

**Date:** 2026-07-16  
**Status:** Approved for implementation  
**Milestone:** Read-only tools (milestone 1 of 2)

---

## 1. Goal

Expose the CRM as an MCP (Model Context Protocol) server so Claude (claude.ai Cowork mode / custom connector) can query live business data — orders, clients, revenue, inventory — and eventually take guarded write actions. Milestone 1 ships five read-only tools behind a static bearer token with no infrastructure changes.

---

## 2. Architecture

### Transport

**MCP Streamable HTTP** (POST only). SSE transport is disabled (`disableSse: true`). Each tool call is an independent stateless POST — no session continuity, no Redis, no shared store.

### Package

- `mcp-handler@1.1.0` — Vercel's Next.js adapter for the MCP SDK
- `@modelcontextprotocol/sdk@1.26.0` — pinned exact version (peer dep requirement; do not upgrade independently)
- `zod@^3` — already in project

### Route

```
src/app/api/mcp/route.ts
```

A **static** Next.js App Router route (not `[transport]` catch-all). Works with `basePath: "/api"` because `mcp-handler` derives the transport name from the trailing path segment (`/api/mcp` → segment = `mcp` → Streamable HTTP). Existing routes at `/api/clients`, `/api/orders`, etc. are unaffected — Next.js static segments always win over dynamic segments.

Public URL: **`https://etalontbm.uz/api/mcp`**

---

## 3. Authentication

Static bearer token. No OAuth, no `WWW-Authenticate` header (which would trigger Claude's OAuth flow).

**Flow:**
1. If `MCP_API_TOKEN` env var is missing → `401` immediately (fail closed, never treat undefined as a match)
2. Read `Authorization` header — if absent or not `Bearer <token>` → `401`
3. SHA-256 hash both the provided token and `MCP_API_TOKEN` (produces two fixed-length 32-byte digests)
4. `crypto.timingSafeEqual(digest_provided, digest_expected)` — comparing fixed-length digests avoids the `RangeError` that `timingSafeEqual` throws on unequal-length inputs, and keeps the comparison constant-time
5. On mismatch → bare `401`, no extra headers
6. On match → forward to `createMcpHandler(...)` handler

`withMcpAuth` from `mcp-handler` is deliberately **not used** — it may emit `WWW-Authenticate` for OAuth flows.

**Concrete implementation:**
```ts
import { createHash, timingSafeEqual } from 'crypto';

function checkBearer(req: Request): boolean {
  const expected = process.env.MCP_API_TOKEN;
  if (!expected) return false;
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const provided = auth.slice(7);
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
```

**Token generation:**
```bash
openssl rand -hex 32
```

**Env wiring:**

`.env` (local + prod):
```
MCP_API_TOKEN=<generated-value>
```

`docker-compose.yml` (app service → environment):
```yaml
- MCP_API_TOKEN=${MCP_API_TOKEN}
```

**Claude connector entry:**  
Header: `Authorization` = `Bearer <MCP_API_TOKEN>`  
URL: `https://etalontbm.uz/api/mcp`

---

## 4. File Layout

```
src/
  app/api/mcp/
    route.ts                   ← auth gate + exports GET/POST
  lib/mcp/
    server.ts                  ← createMcpHandler call; registers all tools
    tools/
      dashboard.ts             ← get_dashboard
      orders.ts                ← list_orders, get_order
      clients.ts               ← list_clients, get_client
```

---

## 5. Milestone 1 Tools (read-only)

All tools reuse the same Prisma queries and business logic already used by the REST routes. No business logic in the tool layer — tools are thin wrappers around existing data-access patterns.

### `get_dashboard`

**Description:** Revenue summary, outstanding receivables, today's deliveries, 12-month trend, top clients.  
**Input:** none  
**Output:** Same payload as `GET /api/dashboard` — `revenueThisMonth`, `revenueAllTime`, `averageOrderValue`, `outstandingReceivables`, `activeCustomers`, `todayDeliveries`, `openDiscrepancies`, `cashOnTheRoad`, `revenueByMonth[12]`, `ordersByMonth[12]`, `topCustomers[5]`, `recentOrders[10]`.  
**Source route:** `/api/dashboard` (30s cached)

---

### `list_orders`

**Description:** Paginated order list with optional filters.  
**Input:**
```ts
{
  status?: 'DRAFT' | 'PLACED' | 'IN_PRODUCTION' | 'LOADED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELED',
  page?: number,        // 1-based, default 1
  pageSize?: number,    // default 20, max 50
  clientName?: string,  // substring search on client.name
  day?: string,         // YYYY-MM-DD — filter by scheduled/placed date
}
```
**Output:** `{ items: Order[], total: number, page: number, pageSize: number, totalPages: number }`  
Each item includes: `orderNumber`, `status`, `paymentState`, `totalPrice`, `totalArea`, `confirmedPaid`, `client.name`, `client.phone`, `scheduledAt`, `placedAt`, `deliveredAt`.

---

### `get_order`

**Description:** Full order detail — rooms, payments, shipments, events timeline, client.  
**Input:** `{ orderId: string }`  
**Output:** Full order object as returned by `GET /api/orders/[id]` — includes all nested relations (payments, shipments, events last 100, receipts, dispatch, client, project+calculations).

---

### `list_clients`

**Description:** Search clients by name or phone prefix.  
**Input:**
```ts
{
  q?: string,     // name search
  phone?: string, // phone prefix/exact
}
```
**Output:** Array of clients with `id`, `name`, `phone`, `address`, `language`, `source`, `_count.orders`, `_count.deals`.  
Hard-capped at 50 results (internal cap 200; MCP tool caps at 50 for readability).

---

### `get_client`

**Description:** Single client with recent orders and deal stage.  
**Input:** `{ clientId: string }`  
**Output:** Client fields + recent 20 orders (order number, status, total price, payment state, placed/delivered date) + open deals.  
**Source route:** `GET /api/clients/[id]`

---

## 6. Tool Output Format

Every tool returns a `content` array with **two blocks**:

```ts
{
  content: [
    { type: "text", text: "<human-readable prose summary>" },
    { type: "text", text: "```json\n" + JSON.stringify(data, null, 2) + "\n```" },
  ]
}
```

**Why two blocks:** `structuredContent` (the protocol-level structured field) is only reliably delivered when the tool declares an `outputSchema` and the negotiated protocol version supports it. If Claude negotiates an older revision or `outputSchema` is omitted, `structuredContent` can be silently dropped. Emitting the raw JSON as a fenced second `text` block means the data survives regardless of version negotiation — Claude can always parse the fenced block from `content`.

Do **not** rely on `structuredContent` alone for milestone 1. `outputSchema` declarations and `structuredContent` can be added in milestone 2 once the baseline is stable.

Human-readable summaries are in **English** (operator-facing connector, not customer-facing).

---

## 7. GET vs POST

- **POST** `/api/mcp` — MCP JSON-RPC messages (`initialize`, `tools/list`, `tools/call`). Full auth gate.
- **GET** `/api/mcp` — Returns `405 Method Not Allowed`. SSE is disabled so GET has no role; 405 is spec-compliant.

If Caddy buffering becomes an issue (it won't for plain JSON responses; only SSE needs `flush_interval -1`), no Caddy changes are required.

---

## 8. Validation Steps Before Connecting Claude

1. **Transport resolution test** — `curl -X POST https://etalontbm.uz/api/mcp -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}' ` — expect `200` with `result.protocolVersion`. Use `2025-06-18` (the version Claude negotiates) not the older `2024-11-05` revision, so the curl exercises the same protocol path Claude will use.

2. **Tools list** — follow with `{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}` — expect 5 tools listed.

3. **Auth rejection** — same POST without header — expect bare `401`.

4. **MCP Inspector** — `npx @modelcontextprotocol/inspector https://etalontbm.uz/api/mcp` with the bearer header for full interactive test.

5. **Claude connector** — only after curl validates cleanly.

---

## 9. Milestone 2 (deferred)

After milestone 1 is live and the Claude connector is verified:

| Tool | Description | Sensitive? |
|---|---|---|
| `add_order_note` | Add a comment to an order | No |
| `update_order_status` | Change order status (PLACED→IN_PRODUCTION etc.) | Yes — requires confirm step |
| `record_payment` | Log a payment against an order | Yes — requires confirm step |

Sensitive tools prompt Claude to ask "Confirm?" before executing. Implementation deferred until milestone 1 is stable.

---

## 10. Out of Scope

- OAuth 2.1 (upgrade path available via `withMcpAuth` if multi-user connector needed later)
- Redis session resumability
- Streaming tool responses
- Instagram/Telegram inbox tools
- CAD drawing tools
- Gazoblok product line (low priority for Claude connector)
