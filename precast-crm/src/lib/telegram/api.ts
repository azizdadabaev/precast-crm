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

/** Send a voice message (by existing file_id) on behalf of the business
 *  account. Same business-connection constraint as photos/documents — pass a
 *  file_id, not a fresh upload (see tgUploadVoiceGetFileId). */
export async function tgSendBusinessVoice(
  businessConnectionId: string,
  chatId: string,
  fileId: string,
  opts?: { caption?: string; duration?: number },
): Promise<{ messageId: string }> {
  const res = await fetch(apiUrl("sendVoice"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business_connection_id: businessConnectionId,
      chat_id: chatId,
      voice: fileId,
      ...(opts?.caption ? { caption: opts.caption } : {}),
      ...(opts?.duration ? { duration: Math.round(opts.duration) } : {}),
    }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram sendVoice failed: ${json.description ?? res.status}`);
  return { messageId: String(json.result.message_id) };
}

/** Upload a voice note to the staging channel and return its file_id, so it
 *  can then be sent over a business connection. Plain upload — NO
 *  business_connection_id. Telegram requires OGG/OPUS for a true voice-message
 *  bubble (with the waveform), so the recorder must produce that format. */
export async function tgUploadVoiceGetFileId(
  chatId: string,
  voice: Buffer,
  opts?: { filename?: string; contentType?: string; duration?: number },
): Promise<string> {
  const form = new FormData();
  form.append("chat_id", chatId);
  if (opts?.duration) form.append("duration", String(Math.round(opts.duration)));
  form.append(
    "voice",
    new Blob([new Uint8Array(voice)], { type: opts?.contentType ?? "audio/ogg" }),
    opts?.filename ?? "voice.ogg",
  );
  const res = await fetch(apiUrl("sendVoice"), { method: "POST", body: form });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram staging voice upload failed: ${json.description ?? res.status}`);
  const fid = json.result?.voice?.file_id;
  if (!fid) throw new Error("Telegram staging upload returned no voice");
  return String(fid);
}

/** Delete messages on behalf of the business account (Bot API 9.0
 *  deleteBusinessMessages). `messageIds` are Telegram message ids. Deletes for
 *  everyone. Requires the bot's delete right in the business connection
 *  (BusinessBotRights) — fails otherwise, which the caller surfaces. */
export async function tgDeleteBusinessMessages(
  businessConnectionId: string,
  messageIds: number[],
): Promise<void> {
  const res = await fetch(apiUrl("deleteBusinessMessages"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business_connection_id: businessConnectionId,
      message_ids: messageIds,
    }),
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(`Telegram deleteBusinessMessages failed: ${json.description ?? res.status}`);
  }
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
