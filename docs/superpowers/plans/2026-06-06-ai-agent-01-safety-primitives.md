# AI Agent — Plan 01: Safety Primitives (media allowlist + rate limiter)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build two pure, fully-unit-tested safety modules — a strict inbound-media allowlist and a per-user/global rate limiter — that every later AI-agent piece depends on.

**Architecture:** Two dependency-free TypeScript modules in `src/lib/agent/`. Both are pure logic (the rate limiter takes an injected clock), so they unit-test deterministically with Vitest and need no DB, network, or LLM. Later plans wire them into the Telegram webhook's pre-LLM screen.

**Tech Stack:** TypeScript, Vitest (already in `devDependencies`; `npm test` = `vitest run`). No new dependencies.

**Spec sections covered:** §7 (Media & file safety) and §8 (Rate limiting & token-abuse protection).

---

## Conventions for this plan

- **App directory:** `precast-crm/` (the Next.js app subfolder; its `package.json` has the `test` script). All file paths below are relative to that app directory. All commands are run **from** that directory.
- Tests are **co-located** as `*.test.ts` next to the source file (Vitest's default glob picks these up).
- This work happens on the existing `feat/telegram-ai-agent` branch.

## File Structure

- Create: `src/lib/agent/media-allowlist.ts` — classifies an inbound Telegram message's media into one safe action (`pass` / `process` / `transcribe` / `escalate` / `reject`). Pure function.
- Create: `src/lib/agent/media-allowlist.test.ts` — unit tests for every branch.
- Create: `src/lib/agent/rate-limiter.ts` — `RateLimiter` class: per-user fixed-window message caps + per-user daily token budget + global daily token ceiling. Injected clock.
- Create: `src/lib/agent/rate-limiter.test.ts` — unit tests with a fake clock.

---

### Task 1: Media allowlist

**Files:**
- Create: `src/lib/agent/media-allowlist.ts`
- Test: `src/lib/agent/media-allowlist.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/agent/media-allowlist.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyInboundMedia } from './media-allowlist';

describe('classifyInboundMedia', () => {
  it('passes plain text / contact / location / sticker (no media to fetch)', () => {
    expect(classifyInboundMedia({ kind: 'text' })).toEqual({ action: 'pass' });
    expect(classifyInboundMedia({ kind: 'contact' })).toEqual({ action: 'pass' });
    expect(classifyInboundMedia({ kind: 'location' })).toEqual({ action: 'pass' });
    expect(classifyInboundMedia({ kind: 'sticker' })).toEqual({ action: 'pass' });
  });

  it('processes a photo as an image', () => {
    expect(classifyInboundMedia({ kind: 'photo' })).toEqual({ action: 'process', as: 'image' });
  });

  it('transcribes a voice note', () => {
    expect(classifyInboundMedia({ kind: 'voice' })).toEqual({ action: 'transcribe' });
  });

  it('hands video / video_note / animation / music-audio to a human (never processed)', () => {
    for (const kind of ['video', 'video_note', 'animation', 'audio'] as const) {
      const d = classifyInboundMedia({ kind });
      expect(d.action).toBe('escalate');
    }
  });

  it('processes a real PDF document (mime AND extension agree)', () => {
    expect(
      classifyInboundMedia({ kind: 'document', mimeType: 'application/pdf', fileName: 'plan.pdf' }),
    ).toEqual({ action: 'process', as: 'pdf' });
  });

  it('processes an image sent as a document (mime AND extension agree)', () => {
    expect(
      classifyInboundMedia({ kind: 'document', mimeType: 'image/png', fileName: 'room.png' }),
    ).toEqual({ action: 'process', as: 'image' });
  });

  it('REJECTS an .apk document (never downloaded/opened)', () => {
    const d = classifyInboundMedia({
      kind: 'document',
      mimeType: 'application/vnd.android.package-archive',
      fileName: 'invoice.apk',
    });
    expect(d.action).toBe('reject');
  });

  it('REJECTS a mime/extension mismatch (e.g. .apk disguised as application/pdf)', () => {
    const d = classifyInboundMedia({ kind: 'document', mimeType: 'application/pdf', fileName: 'photo.apk' });
    expect(d.action).toBe('reject');
  });

  it('REJECTS unknown/other document types (zip, exe, office docs)', () => {
    expect(classifyInboundMedia({ kind: 'document', mimeType: 'application/zip', fileName: 'a.zip' }).action).toBe('reject');
    expect(classifyInboundMedia({ kind: 'document', mimeType: 'application/octet-stream', fileName: 'a.exe' }).action).toBe('reject');
    expect(classifyInboundMedia({ kind: 'document', mimeType: 'application/msword', fileName: 'a.doc' }).action).toBe('reject');
  });

  it('escalates oversize images/pdf/voice instead of processing', () => {
    expect(classifyInboundMedia({ kind: 'photo', fileSize: 20_000_000 }).action).toBe('escalate');
    expect(
      classifyInboundMedia({ kind: 'document', mimeType: 'application/pdf', fileName: 'big.pdf', fileSize: 50_000_000 }).action,
    ).toBe('escalate');
    expect(classifyInboundMedia({ kind: 'voice', fileSize: 50_000_000 }).action).toBe('escalate');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/agent/media-allowlist.test.ts`
Expected: FAIL — `Failed to resolve import './media-allowlist'` (the module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/agent/media-allowlist.ts`:

```ts
// Strict inbound-media allowlist for the Telegram AI agent (spec §7).
// The bot only ever fetches/processes: text, voice notes, images (jpg/png), PDF.
// Everything else is handed to a human or refused outright. This module is the
// front-door gate; it never downloads bytes — it decides from message metadata.

export type TelegramMediaKind =
  | 'text'
  | 'voice'
  | 'photo'
  | 'video'
  | 'video_note'
  | 'audio'
  | 'document'
  | 'animation'
  | 'sticker'
  | 'contact'
  | 'location'
  | 'other';

export interface InboundMedia {
  kind: TelegramMediaKind;
  mimeType?: string; // present for document / audio / voice / video
  fileName?: string; // present for document
  fileSize?: number; // bytes, when Telegram provides it
}

export type MediaDecision =
  | { action: 'pass' } // no file to process (text, contact, location, sticker)
  | { action: 'process'; as: 'image' | 'pdf' } // safe to download + read
  | { action: 'transcribe' } // voice note -> speech-to-text
  | { action: 'escalate'; reason: string } // hand to a human, do NOT process
  | { action: 'reject'; reason: string }; // never download/open

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_PDF_BYTES = 16 * 1024 * 1024; // 16 MB
const MAX_VOICE_BYTES = 16 * 1024 * 1024; // 16 MB

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png']);
const ALLOWED_IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png']);

export function classifyInboundMedia(m: InboundMedia): MediaDecision {
  switch (m.kind) {
    case 'text':
    case 'contact':
    case 'location':
    case 'sticker':
      return { action: 'pass' };

    case 'photo':
      if (m.fileSize && m.fileSize > MAX_IMAGE_BYTES)
        return { action: 'escalate', reason: 'image too large' };
      return { action: 'process', as: 'image' };

    case 'voice':
      if (m.fileSize && m.fileSize > MAX_VOICE_BYTES)
        return { action: 'escalate', reason: 'voice note too large' };
      return { action: 'transcribe' };

    case 'video':
    case 'video_note':
    case 'animation':
    case 'audio':
      return { action: 'escalate', reason: `${m.kind} is handed to a human, never processed by the bot` };

    case 'document':
      return classifyDocument(m);

    case 'other':
    default:
      return { action: 'escalate', reason: 'unknown media kind' };
  }
}

function classifyDocument(m: InboundMedia): MediaDecision {
  const mime = (m.mimeType ?? '').toLowerCase();
  const ext = extensionOf(m.fileName);

  // PDF: mime AND extension must both say pdf.
  if (mime === 'application/pdf' && ext === 'pdf') {
    if (m.fileSize && m.fileSize > MAX_PDF_BYTES)
      return { action: 'escalate', reason: 'pdf too large' };
    return { action: 'process', as: 'pdf' };
  }

  // Image sent as a file: mime AND extension must both be an allowed image.
  if (ALLOWED_IMAGE_MIMES.has(mime) && ALLOWED_IMAGE_EXTS.has(ext)) {
    if (m.fileSize && m.fileSize > MAX_IMAGE_BYTES)
      return { action: 'escalate', reason: 'image too large' };
    return { action: 'process', as: 'image' };
  }

  // Everything else (.apk, archives, executables, office docs, unknown types,
  // or any mime/extension mismatch) is NEVER opened.
  return { action: 'reject', reason: `disallowed document type (ext=${ext || 'none'}, mime=${mime || 'none'})` };
}

function extensionOf(fileName?: string): string {
  if (!fileName) return '';
  const dot = fileName.lastIndexOf('.');
  if (dot < 0 || dot === fileName.length - 1) return '';
  return fileName.slice(dot + 1).toLowerCase();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/agent/media-allowlist.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/media-allowlist.ts src/lib/agent/media-allowlist.test.ts
git commit -m "Feat(agent) · strict inbound-media allowlist (spec §7)"
```

---

### Task 2: Rate limiter

**Files:**
- Create: `src/lib/agent/rate-limiter.ts`
- Test: `src/lib/agent/rate-limiter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/agent/rate-limiter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { RateLimiter, type RateLimitConfig } from './rate-limiter';

const CFG: RateLimitConfig = {
  perMinute: 3,
  perHour: 10,
  userDailyTokens: 1000,
  globalDailyTokens: 5000,
};

// A controllable clock so windows are deterministic.
function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('RateLimiter', () => {
  it('allows up to perMinute messages, then denies with a retryAfter', () => {
    const clock = fakeClock();
    const rl = new RateLimiter(CFG, clock.now);
    expect(rl.check('u1', 1).allowed).toBe(true);
    expect(rl.check('u1', 1).allowed).toBe(true);
    expect(rl.check('u1', 1).allowed).toBe(true);
    const denied = rl.check('u1', 1);
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toContain('minute');
    expect(denied.retryAfterSec).toBeGreaterThan(0);
  });

  it('resets the per-minute window after 60s', () => {
    const clock = fakeClock();
    const rl = new RateLimiter(CFG, clock.now);
    rl.check('u1', 1);
    rl.check('u1', 1);
    rl.check('u1', 1);
    expect(rl.check('u1', 1).allowed).toBe(false);
    clock.advance(60_000);
    expect(rl.check('u1', 1).allowed).toBe(true);
  });

  it('isolates users from each other', () => {
    const clock = fakeClock();
    const rl = new RateLimiter(CFG, clock.now);
    rl.check('u1', 1);
    rl.check('u1', 1);
    rl.check('u1', 1);
    expect(rl.check('u1', 1).allowed).toBe(false);
    expect(rl.check('u2', 1).allowed).toBe(true);
  });

  it('denies when the estimated tokens would exceed the per-user daily budget', () => {
    const clock = fakeClock();
    const rl = new RateLimiter(CFG, clock.now);
    rl.record('u1', 900); // already spent 900 of 1000
    const d = rl.check('u1', 200); // 900 + 200 > 1000
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('per-user daily token');
  });

  it('denies when estimated tokens would exceed the global daily ceiling', () => {
    const clock = fakeClock();
    const rl = new RateLimiter(CFG, clock.now);
    rl.record('whoever', 4900); // global now 4900 of 5000
    const d = rl.check('u1', 200); // 4900 + 200 > 5000
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('global daily token');
  });

  it('record() accumulates user + global token spend and resets after 24h', () => {
    const clock = fakeClock();
    const rl = new RateLimiter(CFG, clock.now);
    rl.record('u1', 500);
    expect(rl.check('u1', 600).allowed).toBe(false); // 500 + 600 > 1000
    clock.advance(86_400_000); // +24h
    expect(rl.check('u1', 600).allowed).toBe(true); // window reset
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/agent/rate-limiter.test.ts`
Expected: FAIL — `Failed to resolve import './rate-limiter'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/agent/rate-limiter.ts`:

```ts
// Per-user + global rate / token-budget limiter for the AI agent (spec §8).
// In-memory fixed-window counters with an injected clock so it unit-tests
// deterministically. A later plan swaps the in-memory store for a shared
// (Postgres/Redis) backend; the check()/record() contract stays the same.

export interface RateLimitConfig {
  perMinute: number; // messages per user per minute
  perHour: number; // messages per user per hour
  userDailyTokens: number; // model tokens per user per day
  globalDailyTokens: number; // org-wide model tokens per day
}

export interface RateDecision {
  allowed: boolean;
  reason?: string;
  retryAfterSec?: number;
}

interface Window {
  start: number;
  count: number;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export class RateLimiter {
  private perMinute = new Map<string, Window>();
  private perHour = new Map<string, Window>();
  private userTokensDay = new Map<string, Window>();
  private globalTokensDay: Window = { start: 0, count: 0 };

  constructor(
    private cfg: RateLimitConfig,
    private now: () => number = () => Date.now(),
  ) {}

  /**
   * Call BEFORE any paid model call. `estTokens` is a rough estimate of this
   * turn's spend; it gates against the daily budgets without recording.
   * Message-rate windows ARE incremented here (one check == one message).
   */
  check(userId: string, estTokens: number): RateDecision {
    const t = this.now();

    const minute = this.bump(this.perMinute, userId, t, MINUTE);
    if (minute.count > this.cfg.perMinute)
      return deny('per-minute message cap', remaining(minute, t, MINUTE));

    const hour = this.bump(this.perHour, userId, t, HOUR);
    if (hour.count > this.cfg.perHour)
      return deny('per-hour message cap', remaining(hour, t, HOUR));

    const userDay = this.window(this.userTokensDay, userId, t, DAY);
    if (userDay.count + estTokens > this.cfg.userDailyTokens)
      return deny('per-user daily token budget', remaining(userDay, t, DAY));

    const global = this.globalWindow(t);
    if (global.count + estTokens > this.cfg.globalDailyTokens)
      return deny('global daily token ceiling', remaining(global, t, DAY));

    return { allowed: true };
  }

  /** Call AFTER a model call to record the actual tokens spent. */
  record(userId: string, actualTokens: number): void {
    const t = this.now();
    this.window(this.userTokensDay, userId, t, DAY).count += actualTokens;
    this.globalWindow(t).count += actualTokens;
  }

  private bump(map: Map<string, Window>, key: string, t: number, windowMs: number): Window {
    const w = this.window(map, key, t, windowMs);
    w.count += 1;
    return w;
  }

  private window(map: Map<string, Window>, key: string, t: number, windowMs: number): Window {
    let w = map.get(key);
    if (!w || t - w.start >= windowMs) {
      w = { start: t, count: 0 };
      map.set(key, w);
    }
    return w;
  }

  private globalWindow(t: number): Window {
    if (t - this.globalTokensDay.start >= DAY) this.globalTokensDay = { start: t, count: 0 };
    return this.globalTokensDay;
  }
}

function deny(reason: string, retryAfterSec: number): RateDecision {
  return { allowed: false, reason, retryAfterSec };
}

function remaining(w: Window, t: number, windowMs: number): number {
  return Math.max(1, Math.ceil((w.start + windowMs - t) / 1000));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/agent/rate-limiter.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 5: Run the full agent test folder + commit**

Run: `npx vitest run src/lib/agent`
Expected: PASS — both `media-allowlist.test.ts` and `rate-limiter.test.ts` green.

```bash
git add src/lib/agent/rate-limiter.ts src/lib/agent/rate-limiter.test.ts
git commit -m "Feat(agent) · per-user + global rate/token limiter (spec §8)"
```

---

## Self-review (done by plan author)

- **Spec coverage:** §7 media allowlist → Task 1 (text/voice/image/pdf allowlist, video→human, `.apk`/other→reject, mime-vs-ext mismatch→reject, oversize→escalate). §8 rate limiting → Task 2 (per-minute, per-hour, per-user daily token budget, global daily ceiling, abuse via repeated denials surfaces to the caller). Per-media caps + abuse-auto-pause + link/suspicious-text handling are intentionally **deferred**: per-media caps and auto-pause land in Plan 6 (guardrail pipeline) where they combine with the classifier; link-stripping/suspicious-text is part of the §6.5 output validator, also Plan 6. Noted here so the deferral is explicit, not a silent gap.
- **Placeholder scan:** none — every step has the real test and implementation code.
- **Type consistency:** `classifyInboundMedia(InboundMedia): MediaDecision` and `RateLimiter.check(userId, estTokens)` / `record(userId, actualTokens)` are used identically in tests and implementation.
