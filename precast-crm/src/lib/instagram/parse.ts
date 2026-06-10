// Pure parser: a Meta Instagram messaging webhook payload → a flat list of
// inbound messages in the shape the webhook route persists. No I/O. Drops echoes
// (our own outbound, `is_echo`), and anything missing a sender id or message id.

export interface ParsedIgMedia {
  kind: 'IMAGE' | 'VOICE' | 'VIDEO' | 'OTHER';
  url: string;
}

export interface ParsedIgMessage {
  /** Sender IGSID — the per-customer conversation key (also IS their account id). */
  externalId: string;
  /** Message `mid` — used to dedupe redelivered events. */
  externalMsgId: string;
  text: string | null;
  media: ParsedIgMedia | null;
}

const MEDIA_KIND: Record<string, ParsedIgMedia['kind']> = {
  image: 'IMAGE',
  audio: 'VOICE',
  video: 'VIDEO',
};

export function parseInstagramWebhook(body: unknown): ParsedIgMessage[] {
  const b = body as { object?: string; entry?: Array<{ messaging?: unknown[] }> } | null;
  if (!b || b.object !== 'instagram' || !Array.isArray(b.entry)) return [];

  const out: ParsedIgMessage[] = [];
  for (const entry of b.entry) {
    if (!entry || !Array.isArray(entry.messaging)) continue;
    for (const ev of entry.messaging as Array<Record<string, unknown>>) {
      const m = ev.message as Record<string, unknown> | undefined;
      if (!m || m.is_echo === true) continue;

      const sender = ev.sender as { id?: unknown } | undefined;
      const externalId = sender?.id;
      const externalMsgId = m.mid;
      if (typeof externalId !== 'string' || typeof externalMsgId !== 'string') continue;

      const attachments = Array.isArray(m.attachments) ? (m.attachments as Array<Record<string, unknown>>) : [];
      const att = attachments[0];
      const payload = att?.payload as { url?: unknown } | undefined;
      const media: ParsedIgMedia | null =
        att && typeof payload?.url === 'string'
          ? { kind: MEDIA_KIND[String(att.type)] ?? 'OTHER', url: payload.url }
          : null;

      out.push({
        externalId,
        externalMsgId,
        text: typeof m.text === 'string' ? m.text : null,
        media,
      });
    }
  }
  return out;
}
