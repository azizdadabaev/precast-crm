// A quote card rendered from a payload instead of from a saved Project.
//
// The headless card already existed, but only for rows that are in the database
// (`/internal/quote-card/[projectId]`). The Android calculator needs the same
// picture for a quote that has NOT been saved: pressing «Юбориш» shows a customer
// a price, it does not create a project, and it is deliberately usable by an
// operator who has `calculator.use` but not `order.create`.
//
// So the payload is handed in, parked in this process for a few seconds, and the
// same `CalculationShareCard` is screenshotted off it. One card definition, one
// renderer, and no rows created as a side effect of showing someone a price.
//
// Parked in memory rather than in the database for the same reason QUOTE_CARD_TOKEN
// lives on globalThis: puppeteer and the render page run in the SAME Node process,
// so a module-level Map reaches both, and nothing about a quote that was never
// saved deserves to outlive the screenshot of it.

import { randomBytes } from "crypto";
import { z } from "zod";
import type { ShareData } from "@/components/share/CalculationShareCard";

/** Long enough that the render page cannot be reached by guessing, short enough to log. */
const NONCE_BYTES = 16;

/**
 * How long a parked payload stays readable. The screenshot happens within a second
 * of the POST; a minute is slack for a cold Chromium launch on the 1-vCPU host,
 * and short enough that a leaked URL is worthless by the time it is read.
 */
const TTL_MS = 60_000;

const PATTERN = z.enum(["GB", "BGB", "GBG"]);

/**
 * Mirrors `ShareRow` in src/components/share/CalculationShareCard.tsx. Every field
 * is required except the two the card itself treats as optional, because a card
 * with a missing figure is worse than a refused request: the customer cannot tell
 * that a number is absent rather than zero.
 */
const RowSchema = z.object({
  name: z.string(),
  innerWidth: z.number().finite(),
  innerLength: z.number().finite(),
  bearing: z.number().finite(),
  pattern: PATTERN,
  patternAuto: PATTERN.nullish(),
  beamLength: z.number().finite(),
  blocksPerRow: z.number().finite().nullable(),
  totalBlocks: z.number().finite(),
  beamCount: z.number().finite(),
  monolithLength: z.number().finite(),
  monolithArea: z.number().finite(),
  m2Price: z.number().finite(),
  subtotal: z.number().finite(),
});

export const QuoteCardPayloadSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  clientName: z.string(),
  clientPhone: z.string().nullish(),
  clientAddress: z.string().nullish(),
  /** Present only when an adjustment is non-zero — the card hides the block otherwise. */
  pricing: z
    .object({
      subtotal: z.number().finite(),
      discountAmount: z.number().finite(),
      discountPercent: z.number().finite(),
      deliveryCost: z.number().finite(),
      otherCost: z.number().finite(),
      total: z.number().finite(),
    })
    .optional(),
  /** At least one: a card with no rows is a company header and nothing else. */
  rows: z.array(RowSchema).min(1).max(40),
  totals: z.object({
    blocks: z.number().finite(),
    beams: z.number().finite(),
    monolithLength: z.number().finite(),
    monolithArea: z.number().finite(),
    sum: z.number().finite(),
  }),
});

export type QuoteCardPayload = z.infer<typeof QuoteCardPayloadSchema>;

type Parked = { data: ShareData; expiresAt: number };

// Pinned on globalThis, not a module const: Next bundles this module separately
// per route, so the API route and the render page would otherwise each get their
// own empty Map and the screenshot would always 404.
const holder = globalThis as typeof globalThis & { __quoteCardPayloads?: Map<string, Parked> };
const parked: Map<string, Parked> = (holder.__quoteCardPayloads ??= new Map());

function sweep(now: number): void {
  for (const [k, v] of parked) if (v.expiresAt <= now) parked.delete(k);
}

/** Park a payload and return the nonce the render page will be asked for. */
export function parkQuoteCardPayload(data: ShareData): string {
  const now = Date.now();
  sweep(now);
  const nonce = randomBytes(NONCE_BYTES).toString("hex");
  parked.set(nonce, { data, expiresAt: now + TTL_MS });
  return nonce;
}

/** Read a parked payload. Null when unknown or expired — the page then 404s. */
export function readQuoteCardPayload(nonce: string): ShareData | null {
  const now = Date.now();
  sweep(now);
  return parked.get(nonce)?.data ?? null;
}

/**
 * Drop a payload the moment its screenshot is taken, rather than waiting for the
 * TTL: the render is one-shot, and a quote that has been photographed has no
 * reason to stay readable for another minute.
 */
export function dropQuoteCardPayload(nonce: string): void {
  parked.delete(nonce);
}
