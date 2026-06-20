// In-process secret gating the /print/sheet render page — mirrors
// QUOTE_CARD_TOKEN in src/lib/agent/quote-card.ts. Puppeteer and the print page
// run in the SAME Node process, but Next bundles this module separately per
// route, so a plain module-level const would differ between them. Pinning it on
// globalThis makes it truly process-global (one value shared across every
// bundle). It rotates on each restart; the page returns Forbidden without the
// exact token, so the print sheet can't be fetched by guessing. No env/config
// needed.

import { randomBytes } from "crypto";

const tokenHolder = globalThis as typeof globalThis & { __sheetPrintToken?: string };
export const SHEET_PRINT_TOKEN: string = (tokenHolder.__sheetPrintToken ??= randomBytes(18).toString("hex"));
