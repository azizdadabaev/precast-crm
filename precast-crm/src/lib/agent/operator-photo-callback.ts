// Encodes/parses the callback_data carried by the operator-photo
// [🧾 Receipt]/[🚚 Truck] inline-keyboard buttons. Telegram limits callback_data
// to 64 BYTES, so we keep it short: "op:<token>:<r|t>" — `op` namespaces it away
// from the approval buttons ("approve:"/"reject:"), `token` keys the pending
// session, and the last char is the chosen kind.

export type PhotoKind = "RECEIPT" | "LOADED";

export interface PhotoCallback {
  token: string;
  kind: PhotoKind;
}

const PREFIX = "op";
const SEP = ":";
const MAX_CALLBACK_BYTES = 64; // Telegram hard limit on callback_data
const KIND_CODE: Record<PhotoKind, string> = { RECEIPT: "r", LOADED: "t" };

/** Build callback_data for an operator-photo button. Throws if it would exceed
 *  Telegram's 64-byte limit (our tokens are ~12 chars, so this never trips in
 *  practice — it guards a future token-format change). */
export function encodePhotoCallback(token: string, kind: PhotoKind): string {
  if (!token) throw new Error("encodePhotoCallback: token is required");
  if (token.includes(SEP)) throw new Error("encodePhotoCallback: token must not contain ':'");
  const data = `${PREFIX}${SEP}${token}${SEP}${KIND_CODE[kind]}`;
  if (Buffer.byteLength(data, "utf8") > MAX_CALLBACK_BYTES) {
    throw new Error(`callback_data exceeds ${MAX_CALLBACK_BYTES} bytes`);
  }
  return data;
}

/** Parse callback_data back into a PhotoCallback, or null if it is not a
 *  well-formed operator-photo callback — so unrelated callbacks (approval
 *  buttons, anything else) are simply ignored by this handler. */
export function parsePhotoCallback(data: string | null | undefined): PhotoCallback | null {
  if (!data) return null;
  const parts = data.split(SEP);
  if (parts.length !== 3) return null;
  const [prefix, token, code] = parts;
  if (prefix !== PREFIX || !token) return null;
  if (code === "r") return { token, kind: "RECEIPT" };
  if (code === "t") return { token, kind: "LOADED" };
  return null;
}
