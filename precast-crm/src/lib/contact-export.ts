/**
 * Contact-export formatter (pure).
 *
 * Turns a list of clients into a plain-text block the operator can paste
 * into WhatsApp / Telegram. The format is paste-friendly by design:
 *
 *   Client Name
 *   +998 90 111 22 33
 *   Address line
 *
 *   Next Client
 *   +998 93 555 44 66
 *   (address not on file)
 *
 * Rules (enforced by tests in tests/contact-export.test.ts):
 *   - Phone is rendered via `formatPhone` (digits-only DB → "+998 XX XXX XX XX").
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

import { formatPhone } from "./phone";

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
    const block = [c.name, formatPhone(c.phone), addr].join("\n");
    // Trim trailing whitespace per block (but keep internal whitespace).
    return block.replace(/[ \t]+$/gm, "");
  });

  return blocks.join("\n\n").replace(/\s+$/g, "");
}
