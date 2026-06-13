// Pure parser: a Meta Instagram messaging webhook payload → a flat list of
// messages in the shape the webhook route persists. No I/O.
//
// Handles BOTH directions:
//   - inbound  (customer → us): keyed by the sender's IGSID.
//   - outbound (us → customer, `is_echo`): a message WE sent — including from the
//     NATIVE Instagram app — keyed by the RECIPIENT's IGSID (the customer). We
//     mirror these into the inbox so the CRM stays in sync with the real DM thread
//     (parity with Telegram). Read/seen/delivery events carry no `message` → skipped.

export interface ParsedIgMedia {
  kind: 'IMAGE' | 'VOICE' | 'VIDEO' | 'OTHER';
  url: string;
}

export interface ParsedIgMessage {
  /** The CUSTOMER's IGSID — the conversation key. Sender for inbound, recipient for our echo. */
  externalId: string;
  /** Message `mid` — dedupes redelivered events AND our own API sends (we store the
   *  same mid on send, so the echo of an API-sent message is a no-op upsert). */
  externalMsgId: string;
  text: string | null;
  media: ParsedIgMedia | null;
  /** OUTBOUND = an echo of a message we/the owner sent (incl. from the native IG app). */
  direction: 'INBOUND' | 'OUTBOUND';
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
      if (!m) continue; // read / seen / delivery events carry no message

      const isEcho = m.is_echo === true;
      const sender = ev.sender as { id?: unknown } | undefined;
      const recipient = ev.recipient as { id?: unknown } | undefined;
      // The conversation key is ALWAYS the customer: the sender for an inbound
      // message, the recipient for our own echoed (outbound) message.
      const externalId = isEcho ? recipient?.id : sender?.id;
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
        direction: isEcho ? 'OUTBOUND' : 'INBOUND',
      });
    }
  }
  return out;
}
