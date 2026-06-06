// Encodes/parses the callback_data carried by the staff [Approve]/[Reject]
// inline-keyboard buttons. Telegram limits callback_data to 64 BYTES, so we keep
// it short: "<action>:<pendingOrderId>". Spec §5 (notify_staff / request_approval).

export type ApprovalAction = 'approve' | 'reject';

export interface ApprovalCallback {
  action: ApprovalAction;
  pendingOrderId: string;
}

const SEP = ':';
const MAX_CALLBACK_BYTES = 64; // Telegram hard limit on callback_data

/**
 * Build the callback_data for an approval button. Throws if it would exceed
 * Telegram's 64-byte limit (a cuid id is ~25 bytes, so this never trips in
 * practice — it guards against a future id-format change).
 */
export function encodeApprovalCallback(action: ApprovalAction, pendingOrderId: string): string {
  if (!pendingOrderId) throw new Error('pendingOrderId is required');
  const data = `${action}${SEP}${pendingOrderId}`;
  if (Buffer.byteLength(data, 'utf8') > MAX_CALLBACK_BYTES) {
    throw new Error(`callback_data exceeds ${MAX_CALLBACK_BYTES} bytes`);
  }
  return data;
}

/**
 * Parse callback_data back into an ApprovalCallback, or null if it is not a
 * well-formed approval callback — so unrelated callbacks are simply ignored.
 */
export function parseApprovalCallback(data: string | null | undefined): ApprovalCallback | null {
  if (!data) return null;
  const idx = data.indexOf(SEP);
  if (idx <= 0) return null; // no separator, or empty action
  const action = data.slice(0, idx);
  const pendingOrderId = data.slice(idx + 1);
  if (action !== 'approve' && action !== 'reject') return null;
  if (!pendingOrderId) return null;
  return { action, pendingOrderId };
}
