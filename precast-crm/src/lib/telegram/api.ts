// Thin Bot API client. Network-only; no business logic. Token read from
// env at call time so a missing token surfaces as a clear runtime error
// rather than a build-time one.

const TELEGRAM_MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024; // Bot API getFile cap (~20 MB)
export { TELEGRAM_MAX_DOWNLOAD_BYTES };

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return t;
}

function apiUrl(method: string): string {
  return `https://api.telegram.org/bot${token()}/${method}`;
}

/** Send a text message on behalf of the connected business account. */
export async function tgSendBusinessMessage(
  businessConnectionId: string,
  chatId: string,
  text: string,
): Promise<{ messageId: string }> {
  const res = await fetch(apiUrl("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business_connection_id: businessConnectionId,
      chat_id: chatId,
      text,
    }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram sendMessage failed: ${json.description ?? res.status}`);
  return { messageId: String(json.result.message_id) };
}

/**
 * Send a photo (by public URL) on behalf of the connected business account.
 *
 * IMPORTANT: business connections REJECT fresh multipart uploads with
 * `BUSINESS_PEER_USAGE_MISSING` — the Bot API doesn't thread the connection
 * through the upload step. The supported path is to send a `photo` that's
 * already on Telegram (file_id) or a URL Telegram can fetch. The caller saves
 * the image to a public /uploads URL first, then passes that URL here. Token
 * is server-only; never logged.
 */
export async function tgSendBusinessPhoto(
  businessConnectionId: string,
  chatId: string,
  photoUrl: string,
  opts?: { caption?: string },
): Promise<{ messageId: string }> {
  const res = await fetch(apiUrl("sendPhoto"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business_connection_id: businessConnectionId,
      chat_id: chatId,
      photo: photoUrl,
      ...(opts?.caption ? { caption: opts.caption } : {}),
    }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram sendPhoto failed: ${json.description ?? res.status}`);
  return { messageId: String(json.result.message_id) };
}

/** Resolve a file_id to a server file_path via getFile. */
export async function tgGetFilePath(fileId: string): Promise<string> {
  const res = await fetch(apiUrl("getFile"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram getFile failed: ${json.description ?? res.status}`);
  return json.result.file_path as string;
}

/** Download a resolved file_path into a Buffer. */
export async function tgDownloadFile(filePath: string): Promise<Buffer> {
  const url = `https://api.telegram.org/file/bot${token()}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
