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
 * Send a photo on behalf of the connected business account, by an existing
 * Telegram `file_id` (NOT a fresh upload).
 *
 * IMPORTANT: business connections REJECT fresh media (multipart upload OR a
 * URL Telegram must fetch) with `BUSINESS_PEER_USAGE_MISSING` — the Bot API
 * doesn't scope the upload to the connection. The working path is to pass a
 * `file_id` that already lives on Telegram (see tgUploadPhotoGetFileId).
 * Token is server-only; never logged.
 */
export async function tgSendBusinessPhoto(
  businessConnectionId: string,
  chatId: string,
  fileId: string,
  opts?: { caption?: string },
): Promise<{ messageId: string }> {
  const res = await fetch(apiUrl("sendPhoto"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business_connection_id: businessConnectionId,
      chat_id: chatId,
      photo: fileId,
      ...(opts?.caption ? { caption: opts.caption } : {}),
    }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram sendPhoto failed: ${json.description ?? res.status}`);
  return { messageId: String(json.result.message_id) };
}

/**
 * Upload a photo to a chat the bot can post to normally (a private staging
 * channel where the bot is an admin) and return the resulting `file_id`.
 * This is a plain upload — NO business_connection_id — so it succeeds, and the
 * returned file_id can then be sent over a business connection by
 * tgSendBusinessPhoto. Token is server-only; never logged.
 */
export async function tgUploadPhotoGetFileId(
  chatId: string,
  photo: Buffer,
  opts?: { filename?: string; contentType?: string },
): Promise<string> {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append(
    "photo",
    new Blob([new Uint8Array(photo)], { type: opts?.contentType ?? "image/png" }),
    opts?.filename ?? "quote.png",
  );
  const res = await fetch(apiUrl("sendPhoto"), { method: "POST", body: form });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram staging upload failed: ${json.description ?? res.status}`);
  const sizes = (json.result?.photo ?? []) as Array<{ file_id: string; file_size?: number }>;
  const largest = [...sizes].sort((a, b) => (a.file_size ?? 0) - (b.file_size ?? 0)).pop();
  if (!largest?.file_id) throw new Error("Telegram staging upload returned no photo");
  return largest.file_id;
}

/** Send a document (by existing file_id) on behalf of the business account.
 *  Same business-connection constraint as photos — pass a file_id, not a fresh
 *  upload (see tgUploadDocumentGetFileId). */
export async function tgSendBusinessDocument(
  businessConnectionId: string,
  chatId: string,
  fileId: string,
  opts?: { caption?: string },
): Promise<{ messageId: string }> {
  const res = await fetch(apiUrl("sendDocument"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business_connection_id: businessConnectionId,
      chat_id: chatId,
      document: fileId,
      ...(opts?.caption ? { caption: opts.caption } : {}),
    }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram sendDocument failed: ${json.description ?? res.status}`);
  return { messageId: String(json.result.message_id) };
}

/** Upload a document to a chat the bot can post to normally (the staging
 *  channel) and return its file_id, so it can then be sent over a business
 *  connection. Plain upload — NO business_connection_id. */
export async function tgUploadDocumentGetFileId(
  chatId: string,
  file: Buffer,
  opts?: { filename?: string; contentType?: string },
): Promise<string> {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append(
    "document",
    new Blob([new Uint8Array(file)], { type: opts?.contentType ?? "application/octet-stream" }),
    opts?.filename ?? "document",
  );
  const res = await fetch(apiUrl("sendDocument"), { method: "POST", body: form });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram staging document upload failed: ${json.description ?? res.status}`);
  const fid = json.result?.document?.file_id;
  if (!fid) throw new Error("Telegram staging upload returned no document");
  return String(fid);
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
