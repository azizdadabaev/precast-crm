# AI Agent — Plan 02: Data model + bot service-account auth

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the foundational data model the agent needs (conversation AI-state machine, `PendingOrder`, escalation notification type) and a server-side **service-account auth** path so agent/approve endpoints can act without a user session+PIN.

**Architecture:** Task 1 is a pure, unit-tested service-token module (`src/lib/agent/service-auth.ts`) mirroring Plan 01's style. Task 2 edits `prisma/schema.prisma` (additive only) and verifies with `prisma format` + `prisma validate` + `prisma generate`; the actual DB change is applied at deploy via the repo's existing `prisma db push` workflow, so **no migration file is created**.

**Tech Stack:** TypeScript, Vitest, Prisma (Postgres). Node `crypto.timingSafeEqual` for the constant-time compare. No new dependencies.

**Spec sections covered:** §11 (data model + service-account auth prerequisite) and the state/notification pieces that §8/§10 depend on.

---

## Conventions for this plan
- **App directory (run all commands from here):** `precast-crm/` (the Next.js app subfolder). Paths below are relative to it.
- Tests co-located as `*.test.ts` (Vitest's `include` already covers `src/lib/agent/**/*.test.ts`).
- Branch `feat/telegram-ai-agent` is already checked out — do not switch branches.

## Scope note (deliberate deferrals)
- The staff-facing `ACTION_CARD` / `QUOTE_REVIEW` *rendering* (a Message-type or payload) is **deferred to Plan 07 (inbox UX)**, where those cards are actually drawn. Plan 02 lands only the load-bearing persistence (`PendingOrder` + the conversation state machine + the escalation notification type) that Plans 03–07 build on.
- No DB migration is applied here (the repo uses `prisma db push` at deploy). Verification is schema-validate + client-generate.

## File Structure
- Create: `src/lib/agent/service-auth.ts` — constant-time service-token check + bearer-header extraction + a request authorizer. Pure.
- Create: `src/lib/agent/service-auth.test.ts` — unit tests.
- Modify: `.env.example` — document `AGENT_SERVICE_TOKEN`.
- Modify: `prisma/schema.prisma` — add `ConversationAiState` enum + `aiState`/`aiPaused` on `Conversation`; add `PendingOrderStatus` enum + `PendingOrder` model + its back-relation on `Conversation`; add `AGENT_ESCALATION` to `NotificationType`.

---

### Task 1: Service-account auth module

**Files:**
- Create: `src/lib/agent/service-auth.ts`
- Test: `src/lib/agent/service-auth.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write the failing test**

Create `src/lib/agent/service-auth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  isValidServiceToken,
  serviceTokenFromAuthHeader,
  authorizeServiceRequest,
} from './service-auth';

describe('isValidServiceToken', () => {
  it('returns true only for an exact match', () => {
    expect(isValidServiceToken('s3cret-token', 's3cret-token')).toBe(true);
    expect(isValidServiceToken('s3cret-token', 'other-token')).toBe(false);
  });

  it('returns false on length mismatch (never throws)', () => {
    expect(isValidServiceToken('short', 'a-much-longer-token')).toBe(false);
  });

  it('returns false when either side is empty/null/undefined', () => {
    expect(isValidServiceToken('', 'x')).toBe(false);
    expect(isValidServiceToken('x', '')).toBe(false);
    expect(isValidServiceToken(null, 'x')).toBe(false);
    expect(isValidServiceToken('x', undefined)).toBe(false);
    expect(isValidServiceToken(undefined, undefined)).toBe(false);
  });
});

describe('serviceTokenFromAuthHeader', () => {
  it('extracts the token from a Bearer header', () => {
    expect(serviceTokenFromAuthHeader('Bearer abc123')).toBe('abc123');
  });

  it('trims surrounding whitespace on the token', () => {
    expect(serviceTokenFromAuthHeader('Bearer   abc123  ')).toBe('abc123');
  });

  it('returns null when the prefix is missing or the token is empty', () => {
    expect(serviceTokenFromAuthHeader('abc123')).toBeNull();
    expect(serviceTokenFromAuthHeader('Bearer ')).toBeNull();
    expect(serviceTokenFromAuthHeader('Bearer    ')).toBeNull();
    expect(serviceTokenFromAuthHeader(null)).toBeNull();
    expect(serviceTokenFromAuthHeader(undefined)).toBeNull();
  });
});

describe('authorizeServiceRequest', () => {
  it('authorizes a correct Bearer token against the expected secret', () => {
    expect(authorizeServiceRequest('Bearer the-expected', 'the-expected')).toBe(true);
  });

  it('rejects a wrong token, a missing header, or an unset expected secret', () => {
    expect(authorizeServiceRequest('Bearer wrong', 'the-expected')).toBe(false);
    expect(authorizeServiceRequest(null, 'the-expected')).toBe(false);
    expect(authorizeServiceRequest('Bearer the-expected', undefined)).toBe(false);
    expect(authorizeServiceRequest('Bearer the-expected', '')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/agent/service-auth.test.ts`
Expected: FAIL — unresolved import `./service-auth`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/agent/service-auth.ts`:

```ts
// Service-account auth for the AI agent's server-to-server endpoints
// (the agent webhook + the /api/agent/approve callback). These run with no
// user session/PIN, so they authenticate with a single shared secret in the
// AGENT_SERVICE_TOKEN env var, compared in constant time. Spec §11.

import { timingSafeEqual } from 'crypto';

/** Constant-time equality of the provided token against the expected secret. */
export function isValidServiceToken(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on differing lengths — guard first. The early
  // length check is itself a (length-only) leak, which is acceptable for a
  // fixed-length service token.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Extract the token from an `Authorization: Bearer <token>` header value. */
export function serviceTokenFromAuthHeader(
  headerValue: string | null | undefined,
): string | null {
  if (!headerValue) return null;
  const prefix = 'Bearer ';
  if (!headerValue.startsWith(prefix)) return null;
  const token = headerValue.slice(prefix.length).trim();
  return token.length > 0 ? token : null;
}

/**
 * True iff the request's Authorization header carries the configured
 * AGENT_SERVICE_TOKEN. Pass `expected` explicitly in tests; in production it
 * defaults to the env var.
 */
export function authorizeServiceRequest(
  authHeader: string | null | undefined,
  expected: string | null | undefined = process.env.AGENT_SERVICE_TOKEN,
): boolean {
  return isValidServiceToken(serviceTokenFromAuthHeader(authHeader), expected);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/agent/service-auth.test.ts`
Expected: PASS (all assertions green).

- [ ] **Step 5: Document the env var**

Append to `.env.example` (place it near the other agent/Telegram secrets if present, otherwise at the end):

```bash
# Shared secret for the AI agent's server-to-server endpoints (agent webhook +
# /api/agent/approve). Generate with: openssl rand -hex 32
AGENT_SERVICE_TOKEN=
```

- [ ] **Step 6: Run the full agent folder + commit**

Run: `npx vitest run src/lib/agent`
Expected: PASS — service-auth tests plus the existing media-allowlist + rate-limiter tests all green.

```bash
git add src/lib/agent/service-auth.ts src/lib/agent/service-auth.test.ts .env.example
git commit -m "Feat(agent) · service-account token auth for agent endpoints (spec §11)"
```

---

### Task 2: Prisma schema additions

**Files:**
- Modify: `prisma/schema.prisma`

This task is additive-only. Verify with Prisma's own tooling — no DB connection or migration file is needed (the repo applies schema with `prisma db push` at deploy).

- [ ] **Step 1: Add the `AGENT_ESCALATION` notification type**

In `prisma/schema.prisma`, the `NotificationType` enum currently ends like this:

```prisma
enum NotificationType {
  ORDER_PLACED
  ORDER_STATUS_CHANGED
  DELIVERY_PROOF_UPLOADED
  PAYMENT_RECORDED
  PAYMENT_CONFIRMED
  PAYMENT_REJECTED
  COMMENT_MENTION
  NEW_COMMENT
}
```

Add `AGENT_ESCALATION` as the last member:

```prisma
enum NotificationType {
  ORDER_PLACED
  ORDER_STATUS_CHANGED
  DELIVERY_PROOF_UPLOADED
  PAYMENT_RECORDED
  PAYMENT_CONFIRMED
  PAYMENT_REJECTED
  COMMENT_MENTION
  NEW_COMMENT
  AGENT_ESCALATION
}
```

- [ ] **Step 2: Add the conversation AI-state enum + fields, and the PendingOrder back-relation**

In the "Telegram Business Inbox" section, just after the `MediaKind` enum (before `model Conversation`), add:

```prisma
enum ConversationAiState {
  AI_HANDLING   // bot auto-handles; staff watch passively
  PENDING_HUMAN // escalated, or a write-action awaits staff approval; sorts to top
  HUMAN_ACTIVE  // a human took over; the bot is paused for this chat
  RESOLVED
}
```

Then modify the `Conversation` model — add the two scalar fields (after `unread`) and the `pendingOrders` back-relation (next to `messages`):

```prisma
model Conversation {
  id                   String              @id @default(cuid())
  channel              ConversationChannel @default(TELEGRAM)
  externalId           String              // Telegram chat id (the chat to reply to)
  businessConnectionId String?
  displayName          String
  username             String?
  sharedContactPhone   String?             // digits-only; from a client's shared-contact message
  lastMessageAt        DateTime
  lastSnippet          String              @default("")
  unread               Boolean             @default(true)
  aiState              ConversationAiState @default(AI_HANDLING)
  aiPaused             Boolean             @default(false)
  createdAt            DateTime            @default(now())
  messages             Message[]
  pendingOrders        PendingOrder[]
  projects             Project[]

  @@unique([channel, externalId])
  @@index([lastMessageAt])
}
```

- [ ] **Step 3: Add the `PendingOrderStatus` enum + `PendingOrder` model**

Add these immediately after the `Message` model (before the Газоблок section banner):

```prisma
enum PendingOrderStatus {
  AWAITING_CUSTOMER // draft built; waiting for the customer to confirm dims + agree to order
  AWAITING_STAFF    // customer agreed; waiting for the one-tap staff approval
  APPROVED          // committed into a real Order
  REJECTED
  EXPIRED
}

// A proposed order the AI agent prepared but has NOT placed. The HITL flow is
// Propose -> Customer-confirm -> Staff-approve -> Commit (spec §6 guardrail 3).
// The price is carried ONLY by quoteId (never free text); a real Order is
// created via the existing createOrder flow when status flips to APPROVED.
model PendingOrder {
  id                 String             @id @default(cuid())
  conversationId     String
  clientId           String?
  quoteId            String             // price comes ONLY from a minted quote_id, never free text
  payload            Json               // line items, parsed dims, delivery, snapshot for the staff card
  status             PendingOrderStatus @default(AWAITING_CUSTOMER)

  // Idempotency: at most one pending order per (conversation + the customer
  // confirmation message that triggered it) — webhook retries can't duplicate.
  idempotencyKey     String             @unique
  // Idempotency for the staff Approve/Reject tap (Telegram callback_query id).
  telegramCallbackId String?            @unique

  orderId            String?            // set when APPROVED and a real Order is created
  decidedById        String?            // staff user id who approved/rejected (no FK; owner-only inbox)
  decidedAt          DateTime?
  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt

  conversation       Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([status, createdAt])
  @@index([conversationId])
  @@map("pending_orders")
}
```

- [ ] **Step 4: Format + validate the schema**

Run (from the app dir):
```bash
npx prisma format
npx prisma validate
```
Expected: `prisma format` rewrites the file cleanly (alignment only) and `prisma validate` prints `The schema at prisma\schema.prisma is valid 🚀`. If validate errors, fix the schema per the message (most likely a missing back-relation or a typo) and re-run.

- [ ] **Step 5: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: `Generated Prisma Client ...` with no errors. (This only needs the schema file, not a DB.) This makes `prisma.pendingOrder`, the `ConversationAiState` enum, etc. available to TypeScript.

- [ ] **Step 6: Confirm nothing else broke + commit**

Run: `npx vitest run`
Expected: the full suite still passes (the additive schema change touches no existing code path; the pre-existing skipped test stays skipped).

```bash
git add prisma/schema.prisma
git commit -m "Feat(agent) · schema: conversation AI-state, PendingOrder, AGENT_ESCALATION (spec §11)"
```

(The generated client under `node_modules/.prisma` is not committed — it's regenerated on install/build. At deploy, the schema is applied with the repo's standard `prisma db push`.)

---

## Self-review (done by plan author)

- **Spec coverage:** §11 service-account auth → Task 1 (constant-time `AGENT_SERVICE_TOKEN` check + bearer extraction + request authorizer, fully unit-tested). §11 data model → Task 2 (`ConversationAiState` + `aiState`/`aiPaused`; `PendingOrder` with `@unique idempotencyKey` and `@unique telegramCallbackId`; `AGENT_ESCALATION`). `AppConfig` keys (`agent.knowledge_base`, rate-limit config) need no schema change — they reuse the existing key-value model — so they're created at runtime in later plans, not here.
- **Deferred (noted, not silent):** `ACTION_CARD`/`QUOTE_REVIEW` message rendering → Plan 07; the actual `prisma db push` → deploy; wiring the service-auth into a route → Plan 03 (`/api/agent/approve`).
- **Placeholder scan:** none — Task 1 has full code; Task 2 shows the exact before/after schema blocks.
- **Type consistency:** `isValidServiceToken` / `serviceTokenFromAuthHeader` / `authorizeServiceRequest` signatures match between test and implementation. Schema relation `Conversation.pendingOrders` ↔ `PendingOrder.conversation` is two-sided and consistent.
