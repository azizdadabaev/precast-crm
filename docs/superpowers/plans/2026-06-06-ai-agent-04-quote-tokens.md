# AI Agent — Plan 04: Quote tokens (price-integrity primitive) + buildSlabQuote

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "the AI cannot send a wrong price" structurally true. A quote is a **signed token** that binds a calculated price to an HMAC signature; the (later) order tool will accept only such a `quote_id` and re-verify it, so a tampered or invented price fails verification. Plus a pure `buildSlabQuote` that composes the existing slab calculator with the token.

**Architecture:** Two pure modules in `src/lib/agent/`. Task 1 is a generic HMAC quote-token codec (mint/verify with signature + expiry), no DB. Task 2 calls the existing pure `calculateSlab` and mints a slab quote token. Both fully unit-tested; the live `PriceConfig` is injected (defaults to the engine's `DEFAULT_PRICE_CONFIG`) so the unit stays pure.

**Tech Stack:** TypeScript, Vitest, Node `crypto` (HMAC-SHA256 + `timingSafeEqual`). Reuses `src/services/calculation-engine.ts` (`calculateSlab`, `SlabInput`, `PriceConfig`, `DEFAULT_PRICE_CONFIG`). No new dependencies.

**Spec sections covered:** §4.2 / §6.1 the price-integrity chain (calculator → `quote_id`; the order tool accepts only a `quote_id`).

**Deliberate deferrals (noted, not silent):** the `get_quote` **agent tool** that loads the *live* `PriceConfig` (async, via `src/lib/pricing-config.ts`) and the gazoblok/stock/lookup tools; extracting `createOrder` from the inline `src/app/api/orders/route.ts`; and the order tool that consumes/verifies a `quote_id` — all land in later plans. Plan 04 delivers the pure primitive + slab composer they build on.

---

## Conventions for this plan
- **App directory (run all commands from here):** `precast-crm/`. Paths below are relative to it.
- Branch `feat/telegram-ai-agent` is already checked out — do not switch branches.

## File Structure
- Create: `src/lib/agent/quote-token.ts` — `mintQuoteToken` / `verifyQuoteToken` (HMAC sign + verify + expiry). Pure.
- Create: `src/lib/agent/quote-token.test.ts`
- Create: `src/lib/agent/slab-quote.ts` — `buildSlabQuote(input, opts)` composes `calculateSlab` + `mintQuoteToken`. Pure.
- Create: `src/lib/agent/slab-quote.test.ts`
- Modify: `.env.example` — document `QUOTE_SIGNING_SECRET`.

---

### Task 1: Quote-token HMAC codec

**Files:**
- Create: `src/lib/agent/quote-token.ts`
- Test: `src/lib/agent/quote-token.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write the failing test**

Create `src/lib/agent/quote-token.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mintQuoteToken, verifyQuoteToken } from './quote-token';

const SECRET = 'quote-secret-key';

describe('mintQuoteToken / verifyQuoteToken', () => {
  it('round-trips a payload and recovers it exactly', () => {
    const payload = { kind: 'slab', price: 123456, expiresAt: 9_999_999_999_999 };
    const token = mintQuoteToken(payload, SECRET);
    expect(typeof token).toBe('string');
    expect(token).toContain('.');
    expect(verifyQuoteToken(token, SECRET, { now: 1000 })).toEqual(payload);
  });

  it('rejects a token whose payload was tampered with', () => {
    const token = mintQuoteToken({ price: 100 }, SECRET);
    const [, sig] = token.split('.');
    // forge a new body (price=999999) but keep the old signature
    const forgedBody = Buffer.from(JSON.stringify({ price: 999999 }), 'utf8')
      .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(verifyQuoteToken(`${forgedBody}.${sig}`, SECRET)).toBeNull();
  });

  it('rejects a token signed with a different secret (a forged price is rejected)', () => {
    const token = mintQuoteToken({ price: 100 }, 'attacker-secret');
    expect(verifyQuoteToken(token, SECRET)).toBeNull();
  });

  it('rejects an expired token (now > expiresAt) but accepts it before expiry', () => {
    const token = mintQuoteToken({ price: 1, expiresAt: 5000 }, SECRET);
    expect(verifyQuoteToken(token, SECRET, { now: 4999 })).toEqual({ price: 1, expiresAt: 5000 });
    expect(verifyQuoteToken(token, SECRET, { now: 5001 })).toBeNull();
  });

  it('returns null for malformed / empty input and never throws', () => {
    expect(verifyQuoteToken(null, SECRET)).toBeNull();
    expect(verifyQuoteToken(undefined, SECRET)).toBeNull();
    expect(verifyQuoteToken('', SECRET)).toBeNull();
    expect(verifyQuoteToken('no-dot-here', SECRET)).toBeNull();
    expect(verifyQuoteToken('body.', SECRET)).toBeNull();
    expect(verifyQuoteToken('.sig', SECRET)).toBeNull();
    expect(verifyQuoteToken('a.b', '')).toBeNull(); // empty secret
  });

  it('mintQuoteToken throws when the secret is empty', () => {
    expect(() => mintQuoteToken({ price: 1 }, '')).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/agent/quote-token.test.ts`
Expected: FAIL — unresolved import `./quote-token`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/agent/quote-token.ts`:

```ts
// Quote tokens — the price-integrity primitive (spec §4.2 / §6.1).
//
// A quote token is "<base64url(payloadJson)>.<base64url(hmacSha256(body))>".
// It binds a computed price to an HMAC signature, so a quote_id can be trusted
// WITHOUT being stored: a tampered payload or a forged price fails verification.
// If the payload carries a numeric `expiresAt`, expired tokens are rejected.

import { createHmac, timingSafeEqual } from 'crypto';

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function sign(body: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(body).digest());
}

/** Sign a payload into a quote token. Throws if the secret is empty. */
export function mintQuoteToken(payload: object, secret: string): string {
  if (!secret) throw new Error('mintQuoteToken: secret is required');
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  return `${body}.${sign(body, secret)}`;
}

export interface VerifyQuoteOptions {
  /** Current time in ms; defaults to Date.now(). If the payload has a numeric
   *  `expiresAt`, a token at/after that time is rejected. */
  now?: number;
}

/**
 * Verify a quote token's signature (constant-time) and expiry, returning the
 * decoded payload — or null for any tampered / forged / expired / malformed
 * token, so callers can treat null as "untrusted, re-quote".
 */
export function verifyQuoteToken<T = unknown>(
  token: string | null | undefined,
  secret: string,
  opts?: VerifyQuoteOptions,
): T | null {
  if (!token || !secret) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  const expectedSig = sign(body, secret);
  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(fromB64url(body).toString('utf8'));
  } catch {
    return null;
  }
  if (payload && typeof (payload as { expiresAt?: unknown }).expiresAt === 'number') {
    const now = opts?.now ?? Date.now();
    if (now >= (payload as { expiresAt: number }).expiresAt) return null;
  }
  return payload as T;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/agent/quote-token.test.ts`
Expected: PASS.

- [ ] **Step 5: Document the env var**

Append to `.env.example` (near `AGENT_SERVICE_TOKEN`):

```bash
# HMAC secret that signs AI-agent price quotes (the quote_id). The order tool
# re-verifies a quote_id with this secret, so a tampered/invented price is
# rejected. Generate with: openssl rand -hex 32
QUOTE_SIGNING_SECRET=
```

- [ ] **Step 6: Run the agent folder + commit**

Run: `npx vitest run src/lib/agent`
Expected: PASS (quote-token plus all existing agent tests).

```bash
git add src/lib/agent/quote-token.ts src/lib/agent/quote-token.test.ts .env.example
git commit -m "Feat(agent) · signed quote-token codec — price-integrity primitive (spec §4.2)"
```

---

### Task 2: buildSlabQuote (compose calculator + token)

**Files:**
- Create: `src/lib/agent/slab-quote.ts`
- Test: `src/lib/agent/slab-quote.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/agent/slab-quote.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSlabQuote } from './slab-quote';
import { verifyQuoteToken } from './quote-token';
import { calculateSlab, DEFAULT_PRICE_CONFIG, CalculationError } from '@/services/calculation-engine';

const SECRET = 'quote-secret-key';
const ISSUED = 1_700_000_000_000;

describe('buildSlabQuote', () => {
  it('prices a room exactly as the calculator does, and stamps currency + validity', () => {
    const input = { inner_width: 4, inner_length: 5 };
    const expected = calculateSlab(input, DEFAULT_PRICE_CONFIG);

    const quote = buildSlabQuote(input, { secret: SECRET, issuedAt: ISSUED });

    expect(quote.price).toBe(expected.subtotal);
    expect(quote.currency).toBe('UZS');
    expect(quote.pattern).toBe(expected.pattern);
    expect(quote.payload.expiresAt).toBe(ISSUED + 24 * 60 * 60 * 1000); // default 24h
    expect(quote.payload.kind).toBe('slab');
    expect(typeof quote.quoteId).toBe('string');
  });

  it('produces a quoteId the order tool can verify back to the same trusted price', () => {
    const input = { inner_width: 3.5, inner_length: 6 };
    const quote = buildSlabQuote(input, { secret: SECRET, issuedAt: ISSUED });

    const verified = verifyQuoteToken<{ price: number; kind: string }>(quote.quoteId, SECRET, { now: ISSUED });
    expect(verified).not.toBeNull();
    expect(verified!.price).toBe(quote.price);
    expect(verified!.kind).toBe('slab');
  });

  it('a quoteId minted under a different secret is rejected by the trusted secret', () => {
    const input = { inner_width: 3.5, inner_length: 6 };
    const forged = buildSlabQuote(input, { secret: 'attacker-secret', issuedAt: ISSUED });
    expect(verifyQuoteToken(forged.quoteId, SECRET, { now: ISSUED })).toBeNull();
  });

  it('honours a custom validityMs', () => {
    const quote = buildSlabQuote(
      { inner_width: 4, inner_length: 5 },
      { secret: SECRET, issuedAt: ISSUED, validityMs: 60_000 },
    );
    expect(quote.payload.expiresAt).toBe(ISSUED + 60_000);
  });

  it('propagates calculator validation errors (so the agent escalates rather than guessing)', () => {
    expect(() => buildSlabQuote({ inner_width: 0, inner_length: 5 }, { secret: SECRET, issuedAt: ISSUED }))
      .toThrow(CalculationError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/agent/slab-quote.test.ts`
Expected: FAIL — unresolved import `./slab-quote`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/agent/slab-quote.ts`:

```ts
// buildSlabQuote — composes the pure slab calculator with a signed quote token
// (spec §4.2). The agent's get_quote tool (a later plan) calls this with the
// LIVE PriceConfig and process.env.QUOTE_SIGNING_SECRET; here PriceConfig is
// injected (defaults to the engine's DEFAULT_PRICE_CONFIG) so this stays pure.

import {
  calculateSlab,
  DEFAULT_PRICE_CONFIG,
  type SlabInput,
  type PriceConfig,
} from '@/services/calculation-engine';
import { mintQuoteToken } from './quote-token';

const DEFAULT_VALIDITY_MS = 24 * 60 * 60 * 1000; // 24h

export interface SlabQuotePayload {
  kind: 'slab';
  currency: 'UZS';
  price: number; // = SlabResult.subtotal — the only number the order tool trusts
  pattern: string;
  beamLength: number;
  beamCount: number;
  blockRows: number;
  totalBlocks: number;
  billedArea: number;
  m2Price: number;
  input: SlabInput; // snapshot of the dimensions that produced this price
  issuedAt: number;
  expiresAt: number;
}

export interface SlabQuote {
  quoteId: string; // the signed token — this is the quote_id
  price: number;
  currency: 'UZS';
  pattern: string;
  payload: SlabQuotePayload;
}

export interface BuildSlabQuoteOptions {
  secret: string;
  issuedAt: number;
  validityMs?: number;
  priceConfig?: PriceConfig;
}

/**
 * Calculate a slab price and return it as a signed quote. Throws
 * CalculationError on invalid input (the caller escalates instead of guessing).
 */
export function buildSlabQuote(input: SlabInput, opts: BuildSlabQuoteOptions): SlabQuote {
  const r = calculateSlab(input, opts.priceConfig ?? DEFAULT_PRICE_CONFIG);
  const issuedAt = opts.issuedAt;
  const expiresAt = issuedAt + (opts.validityMs ?? DEFAULT_VALIDITY_MS);

  const payload: SlabQuotePayload = {
    kind: 'slab',
    currency: 'UZS',
    price: r.subtotal,
    pattern: r.pattern,
    beamLength: r.beam_length,
    beamCount: r.beam_count,
    blockRows: r.block_rows,
    totalBlocks: r.total_blocks,
    billedArea: r.billed_area,
    m2Price: r.m2_price,
    input,
    issuedAt,
    expiresAt,
  };

  return {
    quoteId: mintQuoteToken(payload, opts.secret),
    price: r.subtotal,
    currency: 'UZS',
    pattern: r.pattern,
    payload,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/agent/slab-quote.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite + commit**

Run: `npx vitest run`
Expected: whole suite passes.

```bash
git add src/lib/agent/slab-quote.ts src/lib/agent/slab-quote.test.ts
git commit -m "Feat(agent) · buildSlabQuote — calculator + signed quote token (spec §4.2)"
```

---

## Self-review (done by plan author)

- **Spec coverage:** §4.2/§6.1 price-integrity chain → Task 1 (the signed quote_id that can't be forged or tampered) + Task 2 (the slab calculator emits one). The order tool re-verifying a `quote_id` and refusing free-text prices lands in the later order-tool plan and *consumes* `verifyQuoteToken`.
- **Deferred (explicit):** live `PriceConfig` loading (async, `src/lib/pricing-config.ts`), the gazoblok/stock/lookup tools, the `createOrder` extraction, and the order tool itself — all later plans. Stated up top + here.
- **Placeholder scan:** none — full code in every step.
- **Type consistency:** `mintQuoteToken(payload, secret)` / `verifyQuoteToken(token, secret, opts?)` and `buildSlabQuote(input, opts): SlabQuote` match between tests and implementation. `buildSlabQuote` reads exactly the `SlabResult` fields that exist in `src/services/calculation-engine.ts` (`subtotal`, `pattern`, `beam_length`, `beam_count`, `block_rows`, `total_blocks`, `billed_area`, `m2_price`) — verified against the engine source. Token expiry check uses `now >= expiresAt`, and the test asserts both the just-before (4999 < 5000 → valid) and at/after (5001 ≥ 5000 → null) boundaries.
