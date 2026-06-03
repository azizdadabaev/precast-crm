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
 * Send a photo on behalf of the connected business account (multipart
 * upload via sendPhoto). Used to push a rendered quote image back into the
 * customer's chat. Token is server-only; never logged.
 */
export async function tgSendBusinessPhoto(
  businessConnectionId: string,
  chatId: string,
  photo: Buffer,
  opts?: { filename?: string; caption?: string; contentType?: string },
): Promise<{ messageId: string }> {
  const form = new FormData();
  form.append("business_connection_id", businessConnectionId);
  form.append("chat_id", chatId);
  if (opts?.caption) form.append("caption", opts.caption);
  form.append(
    "photo",
    new Blob([new Uint8Array(photo)], { type: opts?.contentType ?? "image/png" }),
    opts?.filename ?? "quote.png",
  );
  const res = await fetch(apiUrl("sendPhoto"), { method: "POST", body: form });
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
