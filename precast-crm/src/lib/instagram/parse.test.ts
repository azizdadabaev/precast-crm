import { describe, it, expect } from 'vitest';
import { parseInstagramWebhook } from './parse';

describe('parseInstagramWebhook', () => {
  it('parses a text DM', () => {
    const msgs = parseInstagramWebhook({
      object: 'instagram',
      entry: [{ id: 'IG', messaging: [
        { sender: { id: 'u1' }, recipient: { id: 'IG' }, timestamp: 1, message: { mid: 'm1', text: 'salom' } },
      ]}],
    });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ externalId: 'u1', externalMsgId: 'm1', text: 'salom', media: null });
  });

  it('parses an image attachment', () => {
    const msgs = parseInstagramWebhook({
      object: 'instagram',
      entry: [{ messaging: [
        { sender: { id: 'u1' }, message: { mid: 'm2', attachments: [{ type: 'image', payload: { url: 'https://cdn/x.jpg' } }] } },
      ]}],
    });
    expect(msgs[0].media).toMatchObject({ kind: 'IMAGE', url: 'https://cdn/x.jpg' });
    expect(msgs[0].text).toBeNull();
  });

  it('maps audio → VOICE and unknown → OTHER', () => {
    const a = parseInstagramWebhook({ object: 'instagram', entry: [{ messaging: [
      { sender: { id: 'u1' }, message: { mid: 'm', attachments: [{ type: 'audio', payload: { url: 'https://cdn/a.ogg' } }] } },
    ]}]});
    expect(a[0].media?.kind).toBe('VOICE');
    const s = parseInstagramWebhook({ object: 'instagram', entry: [{ messaging: [
      { sender: { id: 'u1' }, message: { mid: 'm', attachments: [{ type: 'share', payload: { url: 'https://cdn/s' } }] } },
    ]}]});
    expect(s[0].media?.kind).toBe('OTHER');
  });

  it('drops echoes, empty payloads, and malformed events', () => {
    expect(parseInstagramWebhook({ object: 'instagram', entry: [{ messaging: [
      { sender: { id: 'IG' }, message: { mid: 'm3', text: 'hi', is_echo: true } },
    ]}]})).toEqual([]);
    expect(parseInstagramWebhook({})).toEqual([]);
    expect(parseInstagramWebhook(null)).toEqual([]);
    expect(parseInstagramWebhook({ object: 'page', entry: [] })).toEqual([]);
    // missing mid or sender → dropped
    expect(parseInstagramWebhook({ object: 'instagram', entry: [{ messaging: [
      { sender: { id: 'u1' }, message: { text: 'no mid' } },
    ]}]})).toEqual([]);
  });

  it('flattens multiple rooms/events', () => {
    const msgs = parseInstagramWebhook({ object: 'instagram', entry: [
      { messaging: [{ sender: { id: 'u1' }, message: { mid: 'a', text: '1' } }] },
      { messaging: [{ sender: { id: 'u2' }, message: { mid: 'b', text: '2' } }] },
    ]});
    expect(msgs.map((m) => m.externalId)).toEqual(['u1', 'u2']);
  });
});
