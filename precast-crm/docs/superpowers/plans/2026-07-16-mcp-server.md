# MCP Server — Milestone 1 (Read-Only Tools) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stateless MCP (Model Context Protocol) server at `POST https://etalontbm.uz/api/mcp` exposing five read-only tools so Claude can query live CRM data.

**Architecture:** A static Next.js App Router route at `src/app/api/mcp/route.ts` uses the `mcp-handler` package (Vercel's Next.js MCP adapter) to handle Streamable HTTP transport. Every request is stateless (no Redis, no sessions). Auth is a static bearer token checked manually before the handler runs — no OAuth advertising.

**Tech Stack:** Next.js 14 App Router · `mcp-handler@1.1.0` · `@modelcontextprotocol/sdk@1.26.0` (pinned) · Prisma (existing) · Vitest (existing) · Zod ^3 (existing)

## Global Constraints

- SDK version MUST be pinned to `@modelcontextprotocol/sdk@1.26.0` exactly — `mcp-handler@1.1.0` has a strict peer dep; do not upgrade independently
- `disableSse: true` — SSE transport is disabled; GET `/api/mcp` returns `405`
- `sessionIdGenerator: undefined` — stateless mode, no Redis
- Auth: SHA-256 hash both tokens before `timingSafeEqual` (avoids `RangeError` on unequal-length inputs); fail closed if env var is missing
- No `WWW-Authenticate` header on 401 — would trigger Claude's OAuth flow
- Tool output: two `content` blocks — prose summary + fenced JSON (do not rely on `structuredContent` alone)
- Prisma import: `import { prisma } from "@/lib/prisma"` (confirmed pattern)
- All money fields from Prisma are `Decimal` — call `.toNumber()` or `Number()` when doing arithmetic; they serialize to strings in `JSON.stringify` automatically

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/lib/mcp/auth.ts` | `checkBearer(req)` — SHA-256 token comparison |
| Create | `src/lib/mcp/server.ts` | `createMcpHandler` instance + tool registration |
| Create | `src/lib/mcp/tools/dashboard.ts` | `registerDashboardTools` — `get_dashboard` |
| Create | `src/lib/mcp/tools/orders.ts` | `registerOrderTools` — `list_orders`, `get_order` |
| Create | `src/lib/mcp/tools/clients.ts` | `registerClientTools` — `list_clients`, `get_client` |
| Create | `src/app/api/mcp/route.ts` | Auth gate + `export { GET, POST }` |
| Create | `src/lib/mcp/auth.test.ts` | Unit tests for `checkBearer` |
| Create | `src/lib/mcp/tools/dashboard.test.ts` | Unit tests for dashboard tool |
| Create | `src/lib/mcp/tools/orders.test.ts` | Unit tests for order tools |
| Create | `src/lib/mcp/tools/clients.test.ts` | Unit tests for client tools |
| Modify | `package.json` | Add `mcp-handler`, `@modelcontextprotocol/sdk` |
| Modify | `docker-compose.yml` | Pass `MCP_API_TOKEN` env var to app container |

---

## Task 1: Install Packages + Environment Wiring

**Files:**
- Modify: `package.json`
- Modify: `docker-compose.yml`

**Interfaces:**
- Produces: `mcp-handler` and `@modelcontextprotocol/sdk` available as imports; `MCP_API_TOKEN` available as `process.env.MCP_API_TOKEN` in the app container

- [ ] **Step 1: Install packages**

Run from `precast-crm/` (the Next.js app directory, where `package.json` lives):

```bash
npm install mcp-handler@1.1.0 @modelcontextprotocol/sdk@1.26.0
```

Expected: both packages appear in `dependencies`. No peer dep warnings — zod ^3.23.8 already satisfies the requirement.

- [ ] **Step 2: Verify packages installed correctly**

```bash
node -e "require('mcp-handler'); console.log('ok')"
```

Expected: `ok` (no error)

- [ ] **Step 3: Wire `MCP_API_TOKEN` into docker-compose.yml**

Open `docker-compose.yml`. Find the `app:` service's `environment:` block (same block that has `DATABASE_URL`, `JWT_SECRET`, etc.) and add:

```yaml
- MCP_API_TOKEN=${MCP_API_TOKEN}
```

- [ ] **Step 4: Generate a local dev token and add it to `.env`**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output. Add to `.env` (the local env file, never committed):

```
MCP_API_TOKEN=<paste-hex-value-here>
```

This token is for local dev only. A separate value will be generated and set on the prod server during deployment.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json docker-compose.yml
git commit -m "feat(mcp): install mcp-handler + wire MCP_API_TOKEN env var"
```

---

## Task 2: Auth Helper

**Files:**
- Create: `src/lib/mcp/auth.ts`
- Create: `src/lib/mcp/auth.test.ts`

**Interfaces:**
- Produces: `checkBearer(req: Request): boolean` — exported from `@/lib/mcp/auth`

- [ ] **Step 1: Write the failing test**

Create `src/lib/mcp/auth.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkBearer } from './auth';

const REAL_TOKEN = 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd';

function makeReq(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set('Authorization', authHeader);
  return new Request('http://localhost/api/mcp', { method: 'POST', headers });
}

describe('checkBearer', () => {
  beforeEach(() => {
    process.env.MCP_API_TOKEN = REAL_TOKEN;
  });
  afterEach(() => {
    delete process.env.MCP_API_TOKEN;
  });

  it('returns true for a correct bearer token', () => {
    expect(checkBearer(makeReq(`Bearer ${REAL_TOKEN}`))).toBe(true);
  });

  it('returns false for a wrong token', () => {
    expect(checkBearer(makeReq('Bearer wrongtoken'))).toBe(false);
  });

  it('returns false when Authorization header is missing', () => {
    expect(checkBearer(makeReq())).toBe(false);
  });

  it('returns false when format is not Bearer', () => {
    expect(checkBearer(makeReq(`Basic ${REAL_TOKEN}`))).toBe(false);
  });

  it('returns false when MCP_API_TOKEN env var is unset (fail closed)', () => {
    delete process.env.MCP_API_TOKEN;
    expect(checkBearer(makeReq(`Bearer ${REAL_TOKEN}`))).toBe(false);
  });

  it('does not throw when provided token has a different length than expected', () => {
    expect(() => checkBearer(makeReq('Bearer short'))).not.toThrow();
    expect(checkBearer(makeReq('Bearer short'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/mcp/auth.test.ts
```

Expected: 6 failures — `Cannot find module './auth'`

- [ ] **Step 3: Implement `checkBearer`**

Create `src/lib/mcp/auth.ts`:

```typescript
import { createHash, timingSafeEqual } from 'crypto';

/**
 * Validates the Authorization: Bearer <token> header against MCP_API_TOKEN.
 *
 * Uses SHA-256 digests for comparison so timingSafeEqual always receives
 * equal-length buffers (the RangeError it throws on length mismatch is a
 * common footgun with raw token comparison).
 *
 * Fails closed: returns false if MCP_API_TOKEN is unset.
 */
export function checkBearer(req: Request): boolean {
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

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/mcp/auth.test.ts
```

Expected: 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/auth.ts src/lib/mcp/auth.test.ts
git commit -m "feat(mcp): add checkBearer auth helper with SHA-256 constant-time comparison"
```

---

## Task 3: Route + Server Skeleton

**Files:**
- Create: `src/lib/mcp/server.ts`
- Create: `src/app/api/mcp/route.ts`

**Interfaces:**
- Consumes: `checkBearer` from `@/lib/mcp/auth`
- Produces: `POST /api/mcp` — responds to MCP `initialize` and `tools/list` (empty tool set at this stage); `GET /api/mcp` → `405`

- [ ] **Step 1: Create the MCP server instance**

Create `src/lib/mcp/server.ts`:

```typescript
import { createMcpHandler } from 'mcp-handler';

/**
 * Stateless MCP Streamable-HTTP handler. Tools are registered by
 * registerXxxTools() calls in the initializeServer callback.
 * SSE is disabled — only POST (Streamable HTTP) is active.
 * sessionIdGenerator: undefined → no session state, no Redis needed.
 */
export const mcpHandler = createMcpHandler(
  (_server) => {
    // Tool registrations added in Tasks 4–6.
    // Empty for now — initialize + tools/list still work.
  },
  {
    serverInfo: { name: 'etalon-crm', version: '1.0.0' },
  },
  {
    basePath: '/api',
    disableSse: true,
  }
);
```

- [ ] **Step 2: Create the auth-gated route**

Create `src/app/api/mcp/route.ts`:

```typescript
import { checkBearer } from '@/lib/mcp/auth';
import { mcpHandler } from '@/lib/mcp/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  if (!checkBearer(req)) {
    return new Response('Unauthorized', { status: 401 });
  }
  return mcpHandler(req);
}

export async function GET(req: Request): Promise<Response> {
  if (!checkBearer(req)) {
    return new Response('Unauthorized', { status: 401 });
  }
  // SSE is disabled. Return 405 — spec-compliant for Streamable HTTP only.
  return new Response('Method Not Allowed', { status: 405 });
}
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors. If you get `Cannot find module 'mcp-handler'` — confirm Task 1 install succeeded.

- [ ] **Step 4: Start the dev server and test `initialize`**

```bash
npm run dev
```

In a second terminal, run (replace `<token>` with the value from `.env`):

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}' \
  | node -e "process.stdin||(0); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>console.log(JSON.parse(d).result?.protocolVersion ?? JSON.parse(d)))"
```

Expected: prints `2025-06-18` (or the server's negotiated version)

- [ ] **Step 5: Test auth rejection**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}'
```

Expected: `401`

- [ ] **Step 6: Test tools/list returns empty array**

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>console.log(JSON.parse(d).result?.tools?.length ?? JSON.parse(d)))"
```

Expected: `0`

- [ ] **Step 7: Test GET returns 405**

```bash
curl -s -o /dev/null -w "%{http_code}" -X GET http://localhost:3000/api/mcp \
  -H "Authorization: Bearer <token>"
```

Expected: `405`

- [ ] **Step 8: Commit**

```bash
git add src/lib/mcp/server.ts src/app/api/mcp/route.ts
git commit -m "feat(mcp): add stateless MCP route with auth gate — initialize + tools/list working"
```

---

## Task 4: `get_dashboard` Tool

**Files:**
- Create: `src/lib/mcp/tools/dashboard.ts`
- Create: `src/lib/mcp/tools/dashboard.test.ts`
- Modify: `src/lib/mcp/server.ts` (add `registerDashboardTools` call)

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`
- Produces: `registerDashboardTools(server: McpServer): void` — registers `get_dashboard` tool

- [ ] **Step 1: Write the failing test**

Create `src/lib/mcp/tools/dashboard.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the module under test
vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    client: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import { buildDashboardData } from './dashboard';

const mockPrisma = prisma as unknown as {
  order: { aggregate: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  client: { findMany: ReturnType<typeof vi.fn> };
};

describe('buildDashboardData', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns shaped dashboard object with correct keys', async () => {
    mockPrisma.order.aggregate.mockResolvedValue({ _sum: { confirmedPaid: '1500000' } });
    mockPrisma.order.findMany.mockResolvedValue([
      { totalPrice: '500000', confirmedPaid: '500000', paymentState: 'FULLY_PAID', orderNumber: '2026-01-0001', status: 'DELIVERED', placedAt: new Date(), client: { name: 'Test' } },
    ]);
    mockPrisma.order.count.mockResolvedValue(3);
    mockPrisma.client.findMany.mockResolvedValue([{ id: 'c1', name: 'Top Client', phone: '998901234567', _count: { orders: 10 } }]);

    const result = await buildDashboardData();

    expect(result).toHaveProperty('revenueThisMonth');
    expect(result).toHaveProperty('outstandingReceivables');
    expect(result).toHaveProperty('todayDeliveries');
    expect(result).toHaveProperty('recentOrders');
    expect(result).toHaveProperty('topClients');
    expect(typeof result.revenueThisMonth).toBe('number');
    expect(typeof result.outstandingReceivables).toBe('number');
  });

  it('handles zero confirmed paid without throwing', async () => {
    mockPrisma.order.aggregate.mockResolvedValue({ _sum: { confirmedPaid: null } });
    mockPrisma.order.findMany.mockResolvedValue([]);
    mockPrisma.order.count.mockResolvedValue(0);
    mockPrisma.client.findMany.mockResolvedValue([]);

    const result = await buildDashboardData();
    expect(result.revenueThisMonth).toBe(0);
    expect(result.outstandingReceivables).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/lib/mcp/tools/dashboard.test.ts
```

Expected: fails — `Cannot find module './dashboard'`

- [ ] **Step 3: Implement the dashboard tool**

Create `src/lib/mcp/tools/dashboard.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@/lib/prisma';

export interface DashboardData {
  revenueThisMonth: number;
  outstandingReceivables: number;
  todayDeliveries: { count: number; orders: Array<{ orderNumber: string; clientName: string; totalArea: number }> };
  recentOrders: Array<{ orderNumber: string; status: string; clientName: string; totalPrice: number; paymentState: string; placedAt: Date | null }>;
  topClients: Array<{ id: string; name: string; phone: string; orderCount: number }>;
}

export async function buildDashboardData(): Promise<DashboardData> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);

  const [revenueAgg, activeOrders, todayCount, todayOrderList, recentOrders, topClients] =
    await Promise.all([
      // Revenue this month = sum of confirmedPaid on non-canceled orders delivered this month
      prisma.order.aggregate({
        where: { status: 'DELIVERED', deliveredAt: { gte: monthStart }, NOT: { status: 'CANCELED' } },
        _sum: { confirmedPaid: true },
      }),
      // All non-canceled, non-fully-paid orders for receivables calc
      prisma.order.findMany({
        where: { status: { not: 'CANCELED' }, paymentState: { not: 'FULLY_PAID' } },
        select: { totalPrice: true, confirmedPaid: true },
      }),
      // Count of orders scheduled today
      prisma.order.count({
        where: { scheduledAt: { gte: todayStart, lt: todayEnd }, status: { not: 'CANCELED' } },
      }),
      // Today's order list
      prisma.order.findMany({
        where: { scheduledAt: { gte: todayStart, lt: todayEnd }, status: { not: 'CANCELED' } },
        select: { orderNumber: true, totalArea: true, client: { select: { name: true } } },
        orderBy: { scheduledAt: 'asc' },
      }),
      // 10 most recent orders
      prisma.order.findMany({
        where: { status: { not: 'CANCELED' } },
        orderBy: { placedAt: 'desc' },
        take: 10,
        select: { orderNumber: true, status: true, totalPrice: true, paymentState: true, placedAt: true, client: { select: { name: true } } },
      }),
      // Top 5 clients by order count
      prisma.client.findMany({
        take: 5,
        orderBy: { orders: { _count: 'desc' } },
        select: { id: true, name: true, phone: true, _count: { select: { orders: true } } },
      }),
    ]);

  const outstandingReceivables = activeOrders.reduce(
    (sum, o) => sum + Number(o.totalPrice) - Number(o.confirmedPaid),
    0,
  );

  return {
    revenueThisMonth: Number(revenueAgg._sum.confirmedPaid ?? 0),
    outstandingReceivables,
    todayDeliveries: {
      count: todayCount,
      orders: todayOrderList.map((o) => ({
        orderNumber: o.orderNumber,
        clientName: o.client.name,
        totalArea: Number(o.totalArea),
      })),
    },
    recentOrders: recentOrders.map((o) => ({
      orderNumber: o.orderNumber,
      status: o.status,
      clientName: o.client.name,
      totalPrice: Number(o.totalPrice),
      paymentState: o.paymentState,
      placedAt: o.placedAt,
    })),
    topClients: topClients.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      orderCount: c._count.orders,
    })),
  };
}

function formatSummary(d: DashboardData): string {
  const fmt = (n: number) => n.toLocaleString('ru-RU') + ' UZS';
  const lines = [
    `Revenue this month: ${fmt(d.revenueThisMonth)}`,
    `Outstanding receivables: ${fmt(d.outstandingReceivables)}`,
    `Today's scheduled deliveries: ${d.todayDeliveries.count}`,
  ];
  if (d.todayDeliveries.orders.length > 0) {
    lines.push(...d.todayDeliveries.orders.map((o) => `  • ${o.orderNumber} — ${o.clientName} (${o.totalArea} m²)`));
  }
  lines.push(`Top clients: ${d.topClients.map((c) => c.name).join(', ')}`);
  return lines.join('\n');
}

export function registerDashboardTools(server: McpServer): void {
  server.tool(
    'get_dashboard',
    'Revenue this month, outstanding receivables, today\'s scheduled deliveries, recent orders, and top clients.',
    {},
    async () => {
      const data = await buildDashboardData();
      return {
        content: [
          { type: 'text' as const, text: formatSummary(data) },
          { type: 'text' as const, text: '```json\n' + JSON.stringify(data, null, 2) + '\n```' },
        ],
      };
    },
  );
}
```

**Note on `server.tool` vs `server.registerTool`:** The `McpServer` from `@modelcontextprotocol/sdk` 1.26.0 uses `server.tool(name, description, inputSchema, handler)` — a different signature from the mcp-handler README example which shows `server.registerTool`. Check which method is available; both do the same thing. If `server.tool` errors, try `server.registerTool`.

- [ ] **Step 4: Register the tool in server.ts**

Edit `src/lib/mcp/server.ts` — replace the placeholder comment with the actual import and call:

```typescript
import { createMcpHandler } from 'mcp-handler';
import { registerDashboardTools } from './tools/dashboard';

export const mcpHandler = createMcpHandler(
  (server) => {
    registerDashboardTools(server);
  },
  {
    serverInfo: { name: 'etalon-crm', version: '1.0.0' },
  },
  {
    basePath: '/api',
    disableSse: true,
  }
);
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/lib/mcp/tools/dashboard.test.ts
```

Expected: 2 tests pass

- [ ] **Step 6: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Smoke-test `tools/list` now shows 1 tool**

With dev server running:

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{ const t=JSON.parse(d).result?.tools; console.log(t?.length, t?.map(x=>x.name)) })"
```

Expected: `1 [ 'get_dashboard' ]`

- [ ] **Step 8: Commit**

```bash
git add src/lib/mcp/tools/dashboard.ts src/lib/mcp/tools/dashboard.test.ts src/lib/mcp/server.ts
git commit -m "feat(mcp): add get_dashboard tool"
```

---

## Task 5: `list_orders` + `get_order` Tools

**Files:**
- Create: `src/lib/mcp/tools/orders.ts`
- Create: `src/lib/mcp/tools/orders.test.ts`
- Modify: `src/lib/mcp/server.ts` (add `registerOrderTools` call)

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`
- Produces: `registerOrderTools(server: McpServer): void` — registers `list_orders` and `get_order`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/mcp/tools/orders.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import { listOrders, getOrder } from './orders';

const mockPrisma = prisma as unknown as {
  order: {
    count: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
};

const SAMPLE_ORDER = {
  id: 'ord1',
  orderNumber: '2026-07-0001',
  status: 'PLACED',
  paymentState: 'AWAITING_PAYMENT',
  totalPrice: '1200000',
  totalArea: '48.5',
  confirmedPaid: '0',
  scheduledAt: new Date('2026-07-20'),
  placedAt: new Date('2026-07-16'),
  deliveredAt: null,
  client: { name: 'Azizbek', phone: '998901234567' },
};

describe('listOrders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated result', async () => {
    mockPrisma.order.count.mockResolvedValue(1);
    mockPrisma.order.findMany.mockResolvedValue([SAMPLE_ORDER]);

    const result = await listOrders({});
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].orderNumber).toBe('2026-07-0001');
    expect(result.totalPages).toBe(1);
  });

  it('clamps pageSize to max 50', async () => {
    mockPrisma.order.count.mockResolvedValue(0);
    mockPrisma.order.findMany.mockResolvedValue([]);

    await listOrders({ pageSize: 999 });
    const callArgs = mockPrisma.order.findMany.mock.calls[0][0];
    expect(callArgs.take).toBe(50);
  });

  it('filters by status when provided', async () => {
    mockPrisma.order.count.mockResolvedValue(0);
    mockPrisma.order.findMany.mockResolvedValue([]);

    await listOrders({ status: 'DELIVERED' });
    const whereArg = mockPrisma.order.findMany.mock.calls[0][0].where;
    expect(whereArg.status).toBe('DELIVERED');
  });
});

describe('getOrder', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the order when found', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ ...SAMPLE_ORDER, payments: [], shipments: [], events: [] });
    const result = await getOrder('ord1');
    expect(result?.orderNumber).toBe('2026-07-0001');
  });

  it('returns null when order not found', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null);
    const result = await getOrder('doesnotexist');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/lib/mcp/tools/orders.test.ts
```

Expected: fails — `Cannot find module './orders'`

- [ ] **Step 3: Implement order tools**

Create `src/lib/mcp/tools/orders.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const ORDER_STATUS_VALUES = ['DRAFT', 'PLACED', 'IN_PRODUCTION', 'LOADED', 'DISPATCHED', 'DELIVERED', 'CANCELED'] as const;

export async function listOrders(params: {
  status?: string;
  page?: number;
  pageSize?: number;
  clientName?: string;
  day?: string;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 20));

  const where: Record<string, unknown> = {};
  if (params.status) where.status = params.status;
  if (params.clientName) {
    where.client = { name: { contains: params.clientName, mode: 'insensitive' } };
  }
  if (params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day)) {
    const [y, m, d] = params.day.split('-').map(Number);
    where.scheduledAt = {
      gte: new Date(y, m - 1, d, 0, 0, 0, 0),
      lt: new Date(y, m - 1, d + 1, 0, 0, 0, 0),
    };
  }

  const [total, items] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: [{ scheduledAt: 'asc' }, { placedAt: 'desc' }],
      include: { client: { select: { name: true, phone: true } } },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: items.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      paymentState: o.paymentState,
      totalPrice: Number(o.totalPrice),
      totalArea: Number(o.totalArea),
      confirmedPaid: Number(o.confirmedPaid),
      clientName: o.client.name,
      clientPhone: o.client.phone,
      scheduledAt: o.scheduledAt,
      placedAt: o.placedAt,
      deliveredAt: o.deliveredAt,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      client: true,
      project: { include: { calculations: true } },
      payments: { orderBy: { recordedAt: 'desc' } },
      shipments: { orderBy: { number: 'asc' } },
      events: { orderBy: { id: 'desc' }, take: 50 },
      dispatch: { include: { driver: true } },
    },
  });
}

export function registerOrderTools(server: McpServer): void {
  server.tool(
    'list_orders',
    'List orders with optional filters. Returns paginated results (max 50 per page).',
    {
      status: z.enum(ORDER_STATUS_VALUES).optional().describe('Filter by order status'),
      page: z.number().int().min(1).optional().describe('Page number, 1-based (default: 1)'),
      pageSize: z.number().int().min(1).max(50).optional().describe('Results per page (default: 20, max: 50)'),
      clientName: z.string().optional().describe('Substring search on client name'),
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Filter by scheduled date (YYYY-MM-DD)'),
    },
    async (params) => {
      const data = await listOrders(params);
      const summary = `Found ${data.total} order(s) (page ${data.page}/${data.totalPages}). Showing ${data.items.length}.`;
      return {
        content: [
          { type: 'text' as const, text: summary },
          { type: 'text' as const, text: '```json\n' + JSON.stringify(data, null, 2) + '\n```' },
        ],
      };
    },
  );

  server.tool(
    'get_order',
    'Get full detail for a single order — rooms, payments, shipments, event timeline, and client.',
    {
      orderId: z.string().describe('The order ID (uuid)'),
    },
    async ({ orderId }) => {
      const order = await getOrder(orderId);
      if (!order) {
        return { content: [{ type: 'text' as const, text: `Order ${orderId} not found.` }] };
      }
      const summary = `Order ${order.orderNumber} — ${order.status} — ${order.client.name} — ${Number(order.totalPrice).toLocaleString('ru-RU')} UZS`;
      return {
        content: [
          { type: 'text' as const, text: summary },
          { type: 'text' as const, text: '```json\n' + JSON.stringify(order, null, 2) + '\n```' },
        ],
      };
    },
  );
}
```

- [ ] **Step 4: Register in server.ts**

Edit `src/lib/mcp/server.ts`:

```typescript
import { createMcpHandler } from 'mcp-handler';
import { registerDashboardTools } from './tools/dashboard';
import { registerOrderTools } from './tools/orders';

export const mcpHandler = createMcpHandler(
  (server) => {
    registerDashboardTools(server);
    registerOrderTools(server);
  },
  {
    serverInfo: { name: 'etalon-crm', version: '1.0.0' },
  },
  {
    basePath: '/api',
    disableSse: true,
  }
);
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/lib/mcp/tools/orders.test.ts
```

Expected: 4 tests pass

- [ ] **Step 6: Verify TypeScript + tools/list**

```bash
npx tsc --noEmit
```

With dev server running:
```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>console.log(JSON.parse(d).result?.tools?.map(x=>x.name)))"
```

Expected: `[ 'get_dashboard', 'list_orders', 'get_order' ]`

- [ ] **Step 7: Commit**

```bash
git add src/lib/mcp/tools/orders.ts src/lib/mcp/tools/orders.test.ts src/lib/mcp/server.ts
git commit -m "feat(mcp): add list_orders and get_order tools"
```

---

## Task 6: `list_clients` + `get_client` Tools

**Files:**
- Create: `src/lib/mcp/tools/clients.ts`
- Create: `src/lib/mcp/tools/clients.test.ts`
- Modify: `src/lib/mcp/server.ts` (add `registerClientTools` call)

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`
- Produces: `registerClientTools(server: McpServer): void` — registers `list_clients` and `get_client`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/mcp/tools/clients.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    client: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import { listClients, getClient } from './clients';

const mockPrisma = prisma as unknown as {
  client: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
};

const SAMPLE_CLIENT = {
  id: 'c1',
  name: 'Azizbek Dadabaev',
  phone: '998901234567',
  address: 'Toshkent',
  language: 'UZ',
  source: null,
  _count: { orders: 3, deals: 1 },
};

describe('listClients', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns clients capped at 50', async () => {
    mockPrisma.client.findMany.mockResolvedValue([SAMPLE_CLIENT]);
    const result = await listClients({});
    expect(result).toHaveLength(1);
    const callArgs = mockPrisma.client.findMany.mock.calls[0][0];
    expect(callArgs.take).toBe(50);
  });

  it('passes q search to prisma where', async () => {
    mockPrisma.client.findMany.mockResolvedValue([]);
    await listClients({ q: 'Aziz' });
    const whereArg = mockPrisma.client.findMany.mock.calls[0][0].where;
    expect(whereArg.OR).toBeDefined();
  });
});

describe('getClient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns client with recent orders when found', async () => {
    mockPrisma.client.findUnique.mockResolvedValue({ ...SAMPLE_CLIENT, orders: [], deals: [] });
    const result = await getClient('c1');
    expect(result?.name).toBe('Azizbek Dadabaev');
  });

  it('returns null when client not found', async () => {
    mockPrisma.client.findUnique.mockResolvedValue(null);
    const result = await getClient('notexist');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/lib/mcp/tools/clients.test.ts
```

Expected: fails — `Cannot find module './clients'`

- [ ] **Step 3: Implement client tools**

Create `src/lib/mcp/tools/clients.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export async function listClients(params: { q?: string; phone?: string }) {
  const where: Record<string, unknown> = {};

  if (params.q || params.phone) {
    const conditions: unknown[] = [];
    if (params.q) {
      conditions.push(
        { name: { contains: params.q, mode: 'insensitive' } },
        { address: { contains: params.q, mode: 'insensitive' } },
      );
    }
    if (params.phone) {
      conditions.push({ phone: { contains: params.phone } });
    }
    where.OR = conditions;
  }

  return prisma.client.findMany({
    where,
    take: 50,
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      language: true,
      source: true,
      _count: { select: { orders: true, deals: true } },
    },
  });
}

export async function getClient(clientId: string) {
  return prisma.client.findUnique({
    where: { id: clientId },
    include: {
      orders: {
        orderBy: { placedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalPrice: true,
          paymentState: true,
          placedAt: true,
          deliveredAt: true,
        },
      },
      deals: {
        where: { status: 'OPEN' },
        select: { id: true, stage: true, value: true },
      },
      _count: { select: { orders: true, deals: true } },
    },
  });
}

export function registerClientTools(server: McpServer): void {
  server.tool(
    'list_clients',
    'Search clients by name or phone. Returns up to 50 results.',
    {
      q: z.string().optional().describe('Name or address substring search'),
      phone: z.string().optional().describe('Phone number prefix or exact match'),
    },
    async (params) => {
      const clients = await listClients(params);
      const summary = `Found ${clients.length} client(s).`;
      return {
        content: [
          { type: 'text' as const, text: summary },
          { type: 'text' as const, text: '```json\n' + JSON.stringify(clients, null, 2) + '\n```' },
        ],
      };
    },
  );

  server.tool(
    'get_client',
    'Get full client detail including recent 20 orders and open deals.',
    {
      clientId: z.string().describe('The client ID (uuid)'),
    },
    async ({ clientId }) => {
      const client = await getClient(clientId);
      if (!client) {
        return { content: [{ type: 'text' as const, text: `Client ${clientId} not found.` }] };
      }
      const summary = `${client.name} — ${client.phone} — ${client._count.orders} order(s)`;
      return {
        content: [
          { type: 'text' as const, text: summary },
          { type: 'text' as const, text: '```json\n' + JSON.stringify(client, null, 2) + '\n```' },
        ],
      };
    },
  );
}
```

- [ ] **Step 4: Register in server.ts**

Edit `src/lib/mcp/server.ts`:

```typescript
import { createMcpHandler } from 'mcp-handler';
import { registerDashboardTools } from './tools/dashboard';
import { registerOrderTools } from './tools/orders';
import { registerClientTools } from './tools/clients';

export const mcpHandler = createMcpHandler(
  (server) => {
    registerDashboardTools(server);
    registerOrderTools(server);
    registerClientTools(server);
  },
  {
    serverInfo: { name: 'etalon-crm', version: '1.0.0' },
  },
  {
    basePath: '/api',
    disableSse: true,
  }
);
```

- [ ] **Step 5: Run all MCP tests**

```bash
npx vitest run src/lib/mcp
```

Expected: all tests pass (auth + dashboard + orders + clients)

- [ ] **Step 6: Verify TypeScript + full tools/list**

```bash
npx tsc --noEmit
```

With dev server running:
```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>console.log(JSON.parse(d).result?.tools?.map(x=>x.name)))"
```

Expected: `[ 'get_dashboard', 'list_orders', 'get_order', 'list_clients', 'get_client' ]`

- [ ] **Step 7: Commit**

```bash
git add src/lib/mcp/tools/clients.ts src/lib/mcp/tools/clients.test.ts src/lib/mcp/server.ts
git commit -m "feat(mcp): add list_clients and get_client tools — milestone 1 complete"
```

---

## Task 7: Deploy + Prod Smoke Test

**Files:** None (deployment only)

- [ ] **Step 1: Generate prod token**

On your local machine:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output. This is `<PROD_TOKEN>`.

- [ ] **Step 2: Set the token on the server**

```bash
ssh root@207.154.218.194 "echo 'MCP_API_TOKEN=<PROD_TOKEN>' >> /opt/precast-crm/.env"
```

Verify it's there:
```bash
ssh root@207.154.218.194 "grep MCP_API_TOKEN /opt/precast-crm/.env"
```

- [ ] **Step 3: Deploy**

```bash
ssh root@207.154.218.194 "cd /opt/precast-crm && git pull origin main && nohup bash -c 'docker compose build app && docker compose up -d app' > /tmp/deploy.log 2>&1 &"
```

Wait ~2 minutes then verify:
```bash
ssh root@207.154.218.194 "git -C /opt/precast-crm log --oneline -1 && docker ps --format 'table {{.Names}}\t{{.Status}}'"
```

Expected: latest commit hash shown; `precast-crm-app-1 Up X minutes (healthy)`

- [ ] **Step 4: Test auth rejection on prod**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST https://etalontbm.uz/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}'
```

Expected: `401`

- [ ] **Step 5: Test initialize on prod**

```bash
curl -s -X POST https://etalontbm.uz/api/mcp \
  -H "Authorization: Bearer <PROD_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}' \
  | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{ const r=JSON.parse(d); console.log('version:', r.result?.protocolVersion, 'name:', r.result?.serverInfo?.name) })"
```

Expected: `version: 2025-06-18 name: etalon-crm` (version may differ based on negotiation)

- [ ] **Step 6: Test tools/list**

```bash
curl -s -X POST https://etalontbm.uz/api/mcp \
  -H "Authorization: Bearer <PROD_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>console.log(JSON.parse(d).result?.tools?.map(x=>x.name)))"
```

Expected: `[ 'get_dashboard', 'list_orders', 'get_order', 'list_clients', 'get_client' ]`

- [ ] **Step 7: Test a tool call**

```bash
curl -s -X POST https://etalontbm.uz/api/mcp \
  -H "Authorization: Bearer <PROD_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_orders","arguments":{"status":"PLACED","pageSize":3}}}' \
  | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{ const r=JSON.parse(d); console.log(r.result?.content?.[0]?.text ?? r) })"
```

Expected: a line like `Found N order(s) (page 1/M). Showing 3.`

---

## Self-Review Checklist

- [x] **Spec section 3 (auth):** SHA-256 hash comparison implemented in Task 2 — `checkBearer` with `createHash('sha256')` before `timingSafeEqual`. Fail-closed on missing env var.
- [x] **Spec section 6 (output format):** Both prose + fenced JSON `content` blocks emitted in every tool — Tasks 4, 5, 6.
- [x] **Spec section 7 (GET→405):** Implemented in `route.ts`, Task 3.
- [x] **Spec section 8 (smoke tests):** Protocol version `2025-06-18` used throughout, Task 7.
- [x] **No placeholders:** All steps have concrete code and commands.
- [x] **Type consistency:** `registerDashboardTools`, `registerOrderTools`, `registerClientTools` names match across server.ts tasks.
- [x] **Note on `server.tool` vs `server.registerTool`:** Flagged in Task 4 Step 3 — implementer should verify which method the installed SDK version exposes.
