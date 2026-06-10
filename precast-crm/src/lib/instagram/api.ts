// Instagram Graph API client (Instagram-Login flow, graph.instagram.com).
// Network-only, no business logic. Sends go through /me/messages with the access
// token; media is sent by PUBLIC URL (Meta fetches it) — no file_id staging like
// Telegram. Token is server-only; never logged.

import { IG_GRAPH, igAccessToken } from './config';

async function igPost(body: Record<string, unknown>): Promise<{ messageId: string }> {
  const res = await fetch(`${IG_GRAPH}/me/messages?access_token=${encodeURIComponent(igAccessToken())}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new Error(`Instagram send failed: ${json.error?.message ?? res.status}`);
  }
  return { messageId: String(json.message_id ?? '') };
}

export const igSendText = (recipientId: string, text: string): Promise<{ messageId: string }> =>
  igPost({ recipient: { id: recipientId }, message: { text } });

export const igSendImage = (recipientId: string, url: string): Promise<{ messageId: string }> =>
  igPost({ recipient: { id: recipientId }, message: { attachment: { type: 'image', payload: { url } } } });

export const igSendVideo = (recipientId: string, url: string): Promise<{ messageId: string }> =>
  igPost({ recipient: { id: recipientId }, message: { attachment: { type: 'video', payload: { url } } } });

/** Best-effort "typing…" indicator; swallows errors (purely cosmetic). */
export async function igSendTyping(recipientId: string): Promise<void> {
  try {
    await fetch(`${IG_GRAPH}/me/messages?access_token=${encodeURIComponent(igAccessToken())}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipientId }, sender_action: 'typing_on' }),
    });
  } catch {
    /* cosmetic — never block a reply on a typing hint */
  }
}

/** Display name for a sender; falls back to username, then the IGSID, when the
 *  profile isn't accessible. Best-effort (never throws). */
export async function igGetName(igsid: string): Promise<string> {
  try {
    const res = await fetch(
      `${IG_GRAPH}/${igsid}?fields=name,username&access_token=${encodeURIComponent(igAccessToken())}`,
    );
    const json = await res.json().catch(() => ({}));
    return (json.name as string) || (json.username as string) || igsid;
  } catch {
    return igsid;
  }
}

/** Download inbound media (image/voice) from the attachment URL → bytes for
 *  vision/voice. Throws on failure; the caller leaves mediaPath null. */
export async function igDownloadMedia(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Instagram media download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
