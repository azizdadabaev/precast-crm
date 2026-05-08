/**
 * Contact-export formatter (pure).
 *
 * Turns a list of clients into a plain-text block the operator can paste
 * into WhatsApp / Telegram. The format is paste-friendly by design:
 *
 *   Client Name
 *   +998901112233
 *   Address line
 *
 *   Next Client
 *   +998935554466
 *   (address not on file)
 *
 * Rules (enforced by tests in tests/contact-export.test.ts):
 *   - Phone is rendered via `formatPhoneCompact` (digits-only DB →
 *     "+998901112233"). The unspaced form is what WhatsApp / Telegram
 *     auto-detect as a clickable phone link, so the operator can paste
 *     and the recipient can tap-to-call. Other UI surfaces (clients
 *     table, order detail, etc.) still use the spaced format for
 *     human readability.
 *   - Missing/empty address renders the literal string "(address not on file)"
 *     so the operator knows to ask. Whitespace-only addresses are treated
 *     as missing.
 *   - Blocks are separated by exactly one blank line.
 *   - The output has no trailing whitespace and no trailing blank lines.
 *   - The whitespace WITHIN a name or address is preserved as-is — only
 *     the END of each block is trimmed.
 *
 * No DOM, no fetch, no Prisma. Use it client-side AND server-side.
 */

import { formatPhoneCompact } from "./phone";

export interface ClientForExport {
  name: string;
  phone: string;            // digits-only DB value
  address: string | null;
}

const NO_ADDRESS = "(address not on file)";

export function formatContactsForExport(clients: ClientForExport[]): string {
  if (!clients.length) return "";

  const blocks = clients.map((c) => {
    const addr = c.address && c.address.trim() ? c.address : NO_ADDRESS;
    const block = [c.name, formatPhoneCompact(c.phone), addr].join("\n");
    // Trim trailing whitespace per block (but keep internal whitespace).
    return block.replace(/[ \t]+$/gm, "");
  });

  return blocks.join("\n\n").replace(/\s+$/g, "");
}
