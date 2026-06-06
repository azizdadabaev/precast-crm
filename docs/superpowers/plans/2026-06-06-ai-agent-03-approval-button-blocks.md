# AI Agent — Plan 03: Approval-button building blocks (callback codec + Bot-API keyboard wrappers)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the two reusable pieces the staff **[Approve]/[Reject]** flow needs — a callback-data codec and the Telegram Bot-API wrappers for inline keyboards + callback answers — both fully tested in isolation.

**Architecture:** Task 1 is a pure codec in `src/lib/agent/` (Plan-01 style). Task 2 extends the existing thin Bot-API client `src/lib/telegram/api.ts` with three methods (`sendMessageWithInlineKeyboard`, `answerCallbackQuery`, `editMessageText`) and tests them with a mocked `fetch`; this requires adding `src/lib/telegram/**/*.test.ts` to the Vitest `include`.

**Tech Stack:** TypeScript, Vitest (mocked `fetch` for the API wrappers). No new dependencies.

**Spec sections covered:** the §5 `notify_staff`/`request_approval` tool's transport + the §8/§10 one-tap Action Card buttons (transport layer only).

**Deliberate deferral (noted, not silent):** the webhook `callback_query` dispatch, the DB **approval handler** (idempotency on `callback_query.id` + `PendingOrder` state transition), and committing a real `Order` all depend on an extracted order-creation **service** that doesn't exist yet (order creation is currently inline in `src/app/api/orders/route.ts`). Those land in a later plan **after** the order service is built. Plan 03 delivers only the transport building blocks they will use.

---

## Conventions for this plan
- **App directory (run all commands from here):** `precast-crm/`. Paths below are relative to it.
- Branch `feat/telegram-ai-agent` is already checked out — do not switch branches.

## File Structure
- Create: `src/lib/agent/approval-callback.ts` — encode/parse `"<action>:<pendingOrderId>"` callback_data (64-byte guard). Pure.
- Create: `src/lib/agent/approval-callback.test.ts` — unit tests.
- Modify: `src/lib/telegram/api.ts` — append `InlineButton` type + `tgSendMessageWithInlineKeyboard`, `tgAnswerCallbackQuery`, `tgEditMessageText`.
- Create: `src/lib/telegram/api.test.ts` — mocked-`fetch` tests for the three new wrappers.
- Modify: `vitest.config.ts` — add `"src/lib/telegram/**/*.test.ts"` to `include`.

---

### Task 1: Approval callback codec

**Files:**
- Create: `src/lib/agent/approval-callback.ts`
- Test: `src/lib/agent/approval-callback.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/agent/approval-callback.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { encodeApprovalCallback, parseApprovalCallback } from './approval-callback';

describe('encodeApprovalCallback', () => {
  it('builds "<action>:<id>" for approve and reject', () => {
    expect(encodeApprovalCallback('approve', 'abc123')).toBe('approve:abc123');
    expect(encodeApprovalCallback('reject', 'abc123')).toBe('reject:abc123');
  });

  it('throws on an empty id', () => {
    expect(() => encodeApprovalCallback('approve', '')).toThrow();
  });

  it('throws when the data would exceed Telegram 64-byte callback limit', () => {
    const longId = 'x'.repeat(60); // 'approve:' (8) + 60 = 68 > 64
    expect(() => encodeApprovalCallback('approve', longId)).toThrow();
  });
});

describe('parseApprovalCallback', () => {
  it('parses a valid approve/reject callback', () => {
    expect(parseApprovalCallback('approve:abc123')).toEqual({ action: 'approve', pendingOrderId: 'abc123' });
    expect(parseApprovalCallback('reject:abc123')).toEqual({ action: 'reject', pendingOrderId: 'abc123' });
  });

  it('round-trips with encode', () => {
    const data = encodeApprovalCallback('reject', 'cuid_xyz');
    expect(parseApprovalCallback(data)).toEqual({ action: 'reject', pendingOrderId: 'cuid_xyz' });
  });

  it('returns null for unrelated / malformed callback_data (so other callbacks are ignored)', () => {
    expect(parseApprovalCallback(null)).toBeNull();
    expect(parseApprovalCallback(undefined)).toBeNull();
    expect(parseApprovalCallback('')).toBeNull();
    expect(parseApprovalCallback('approve')).toBeNull(); // no separator
    expect(parseApprovalCallback('approve:')).toBeNull(); // empty id
    expect(parseApprovalCallback(':abc')).toBeNull(); // empty action
    expect(parseApprovalCallback('delete:abc')).toBeNull(); // unknown action
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/agent/approval-callback.test.ts`
Expected: FAIL — unresolved import `./approval-callback`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/agent/approval-callback.ts`:

```ts
// Encodes/parses the callback_data carried by the staff [Approve]/[Reject]
// inline-keyboard buttons. Telegram limits callback_data to 64 BYTES, so we keep
// it short: "<action>:<pendingOrderId>". Spec §5 (notify_staff / request_approval).

export type ApprovalAction = 'approve' | 'reject';

export interface ApprovalCallback {
  action: ApprovalAction;
  pendingOrderId: string;
}

const SEP = ':';
const MAX_CALLBACK_BYTES = 64; // Telegram hard limit on callback_data

/**
 * Build the callback_data for an approval button. Throws if it would exceed
 * Telegram's 64-byte limit (a cuid id is ~25 bytes, so this never trips in
 * practice — it guards against a future id-format change).
 */
export function encodeApprovalCallback(action: ApprovalAction, pendingOrderId: string): string {
  if (!pendingOrderId) throw new Error('pendingOrderId is required');
  const data = `${action}${SEP}${pendingOrderId}`;
  if (Buffer.byteLength(data, 'utf8') > MAX_CALLBACK_BYTES) {
    throw new Error(`callback_data exceeds ${MAX_CALLBACK_BYTES} bytes`);
  }
  return data;
}

/**
 * Parse callback_data back into an ApprovalCallback, or null if it is not a
 * well-formed approval callback — so unrelated callbacks are simply ignored.
 */
export function parseApprovalCallback(data: string | null | undefined): ApprovalCallback | null {
  if (!data) return null;
  const idx = data.indexOf(SEP);
  if (idx <= 0) return null; // no separator, or empty action
  const action = data.slice(0, idx);
  const pendingOrderId = data.slice(idx + 1);
  if (action !== 'approve' && action !== 'reject') return null;
  if (!pendingOrderId) return null;
  return { action, pendingOrderId };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/agent/approval-callback.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/approval-callback.ts src/lib/agent/approval-callback.test.ts
git commit -m "Feat(agent) · approval-button callback_data codec (spec §5)"
```

---

### Task 2: Telegram Bot-API inline-keyboard + callback wrappers

**Files:**
- Modify: `vitest.config.ts`
- Modify: `src/lib/telegram/api.ts`
- Test: `src/lib/telegram/api.test.ts`

- [ ] **Step 1: Extend the Vitest include so `src/lib/telegram` tests are discovered**

In `vitest.config.ts`, the `include` array is currently:

```ts
    include: ["tests/**/*.test.ts", "src/sandbox/**/__tests__/*.test.ts", "src/lib/agent/**/*.test.ts"],
```

Add `"src/lib/telegram/**/*.test.ts"` as the last entry:

```ts
    include: ["tests/**/*.test.ts", "src/sandbox/**/__tests__/*.test.ts", "src/lib/agent/**/*.test.ts", "src/lib/telegram/**/*.test.ts"],
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/telegram/api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  tgSendMessageWithInlineKeyboard,
  tgAnswerCallbackQuery,
  tgEditMessageText,
} from './api';

const realFetch = globalThis.fetch;

function mockFetchOnce(json: unknown) {
  const fn = vi.fn().mockResolvedValue({ json: async () => json, status: 200 });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

function lastBody(fn: ReturnType<typeof vi.fn>): any {
  const [, init] = fn.mock.calls[0];
  return JSON.parse((init as RequestInit).body as string);
}

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
});
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('tgSendMessageWithInlineKeyboard', () => {
  it('POSTs sendMessage with an inline_keyboard and returns the message id', async () => {
    const fn = mockFetchOnce({ ok: true, result: { message_id: 42 } });
    const res = await tgSendMessageWithInlineKeyboard('chat-1', 'Approve this order?', [
      [
        { text: 'Approve', callback_data: 'approve:po1' },
        { text: 'Reject', callback_data: 'reject:po1' },
      ],
    ]);
    expect(res).toEqual({ messageId: '42' });
    const url = fn.mock.calls[0][0] as string;
    expect(url).toContain('/sendMessage');
    const body = lastBody(fn);
    expect(body.chat_id).toBe('chat-1');
    expect(body.reply_markup.inline_keyboard[0][0]).toEqual({ text: 'Approve', callback_data: 'approve:po1' });
  });

  it('throws when Telegram returns ok:false', async () => {
    mockFetchOnce({ ok: false, description: 'Bad Request' });
    await expect(
      tgSendMessageWithInlineKeyboard('c', 't', [[{ text: 'x', callback_data: 'approve:1' }]]),
    ).rejects.toThrow(/sendMessage/);
  });
});

describe('tgAnswerCallbackQuery', () => {
  it('POSTs answerCallbackQuery with the id and optional toast', async () => {
    const fn = mockFetchOnce({ ok: true, result: true });
    await tgAnswerCallbackQuery('cbq-1', { text: 'Approved', showAlert: true });
    const url = fn.mock.calls[0][0] as string;
    expect(url).toContain('/answerCallbackQuery');
    const body = lastBody(fn);
    expect(body.callback_query_id).toBe('cbq-1');
    expect(body.text).toBe('Approved');
    expect(body.show_alert).toBe(true);
  });

  it('throws when Telegram returns ok:false', async () => {
    mockFetchOnce({ ok: false, description: 'query too old' });
    await expect(tgAnswerCallbackQuery('cbq-1')).rejects.toThrow(/answerCallbackQuery/);
  });
});

describe('tgEditMessageText', () => {
  it('POSTs editMessageText with a numeric message_id', async () => {
    const fn = mockFetchOnce({ ok: true, result: { message_id: 7 } });
    await tgEditMessageText('chat-1', '7', '✅ Approved', { inlineKeyboard: [] });
    const url = fn.mock.calls[0][0] as string;
    expect(url).toContain('/editMessageText');
    const body = lastBody(fn);
    expect(body.chat_id).toBe('chat-1');
    expect(body.message_id).toBe(7); // numeric, not string
    expect(body.text).toBe('✅ Approved');
    expect(body.reply_markup).toEqual({ inline_keyboard: [] });
  });

  it('throws when Telegram returns ok:false', async () => {
    mockFetchOnce({ ok: false, description: 'message not found' });
    await expect(tgEditMessageText('c', '1', 'x')).rejects.toThrow(/editMessageText/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/telegram/api.test.ts`
Expected: FAIL — the three functions are not exported yet (import error / undefined).

- [ ] **Step 4: Write the implementation**

Append to the END of `src/lib/telegram/api.ts` (after `tgDownloadFile`):

```ts
export interface InlineButton {
  text: string;
  callback_data: string;
}

/**
 * Send a plain message (NOT via a business connection) with an inline keyboard —
 * used to post the staff [Approve]/[Reject] card to the internal staff group.
 * Token is server-only; never logged.
 */
export async function tgSendMessageWithInlineKeyboard(
  chatId: string,
  text: string,
  inlineKeyboard: InlineButton[][],
): Promise<{ messageId: string }> {
  const res = await fetch(apiUrl("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: { inline_keyboard: inlineKeyboard },
    }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram sendMessage(keyboard) failed: ${json.description ?? res.status}`);
  return { messageId: String(json.result.message_id) };
}

/**
 * Acknowledge a callback_query (stops the button's loading spinner; optional
 * toast to the staff member). Must be called once per callback within ~15s.
 */
export async function tgAnswerCallbackQuery(
  callbackQueryId: string,
  opts?: { text?: string; showAlert?: boolean },
): Promise<void> {
  const res = await fetch(apiUrl("answerCallbackQuery"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      ...(opts?.text ? { text: opts.text } : {}),
      ...(opts?.showAlert ? { show_alert: true } : {}),
    }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram answerCallbackQuery failed: ${json.description ?? res.status}`);
}

/**
 * Replace a message's text (e.g. mark the staff card "✅ Approved by …"). Pass
 * `inlineKeyboard: []` to remove the buttons after a decision.
 */
export async function tgEditMessageText(
  chatId: string,
  messageId: string,
  text: string,
  opts?: { inlineKeyboard?: InlineButton[][] },
): Promise<void> {
  const res = await fetch(apiUrl("editMessageText"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: Number(messageId),
      text,
      ...(opts?.inlineKeyboard ? { reply_markup: { inline_keyboard: opts.inlineKeyboard } } : {}),
    }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram editMessageText failed: ${json.description ?? res.status}`);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/telegram/api.test.ts`
Expected: PASS — all three describe blocks green.

- [ ] **Step 6: Run the full suite + commit**

Run: `npx vitest run`
Expected: the whole suite passes (the new telegram test now discovered by the extended glob; nothing else affected).

```bash
git add vitest.config.ts src/lib/telegram/api.ts src/lib/telegram/api.test.ts
git commit -m "Feat(agent) · Telegram inline-keyboard + callback-answer Bot-API wrappers (spec §5)"
```

---

## Self-review (done by plan author)

- **Spec coverage:** the §5 staff-approval transport → Task 1 (the button↔handler contract) + Task 2 (post the keyboard, answer the tap, edit the card). These are the reusable pieces the later approval-handler plan consumes.
- **Deferred (explicit):** webhook `callback_query` dispatch + the DB approval handler (idempotency on `callback_query.id`, `PendingOrder` transition) + real `Order` creation — all wait on the extracted order-creation service (Plan 04+). Stated up top and here so the deferral is visible, not a silent gap.
- **Placeholder scan:** none — full code in every step.
- **Type consistency:** `encodeApprovalCallback`/`parseApprovalCallback` and `tgSendMessageWithInlineKeyboard`/`tgAnswerCallbackQuery`/`tgEditMessageText` signatures match between tests and implementation. `InlineButton` shape (`{ text, callback_data }`) is used identically in the test and the wrapper. `editMessageText` sends `message_id` as a `Number` — the test asserts the numeric type.
