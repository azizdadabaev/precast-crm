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
