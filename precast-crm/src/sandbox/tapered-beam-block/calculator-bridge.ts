/**
 * One-way handoff from the sandbox into the main calculator.
 *
 * URL-based: the payload is base64-encoded JSON in a `?prefill=…`
 * query param. The calculator's restore effect parses it on mount,
 * applies the rooms, then `router.replace`s the URL clean so a
 * refresh doesn't re-prefill.
 *
 * Why URL and not localStorage:
 *   - Fully scoped to the navigation, no cross-tab pollution.
 *   - Survives port changes during dev (localStorage is per-origin,
 *     and the dev server bumps ports).
 *   - The payload is right there in the URL, easy to inspect/replay.
 *
 * Mapping rules:
 *   Per-row mode:  one calculator row per slab row.
 *     name = "Row N", innerWidth = perRowDetails[n].innerWidth,
 *     innerLength = beamSpacing (one pitch).
 *   Grouped mode:  one calculator row per beam SKU.
 *     name = "Group N", innerWidth = group.innerWidth,
 *     innerLength = group.qty × beamSpacing.
 *
 * In both modes the inner width passes through unchanged — no bearing
 * subtraction, the calculator does its own beam-length math.
 */

import type { BeamGroup, PerRowDetail } from "./engine";

/** Calculator's autosave key — read-only here, used to detect drafts. */
const AUTOSAVE_KEY = "calc:autosave:v1";

export type PrefillMode = "per-row" | "grouped";

export interface PrefillRoom {
  name: string;
  innerWidth: number;
  innerLength: number;
}

export interface PrefillPayload {
  source: "tapered-sandbox";
  mode: PrefillMode;
  rooms: PrefillRoom[];
}

export function buildPerRowRooms(
  perRowDetails: PerRowDetail[],
  beamSpacing: number,
): PrefillRoom[] {
  return perRowDetails.map((d) => ({
    name: `Row ${d.rowIndex + 1}`,
    innerWidth: roundTo(Math.abs(d.innerWidth), 3),
    innerLength: roundTo(beamSpacing, 3),
  }));
}

export function buildGroupedRooms(
  groups: BeamGroup[],
  beamSpacing: number,
): PrefillRoom[] {
  return groups.map((g, i) => ({
    name: `Group ${i + 1}`,
    innerWidth: roundTo(Math.abs(g.innerWidth), 3),
    innerLength: roundTo(g.qty * beamSpacing, 3),
  }));
}

/**
 * Build the `?prefill=` query string for the calculator. Returns the
 * full path (e.g. `/calculations?prefill=...`) for `router.push`.
 */
export function buildPrefillUrl(payload: PrefillPayload): string {
  const json = JSON.stringify(payload);
  // encodeURIComponent first so non-ASCII / multi-byte characters
  // survive btoa (which only handles Latin-1).
  const encoded = btoa(encodeURIComponent(json));
  return `/calculations?prefill=${encoded}`;
}

/**
 * Inverse of `buildPrefillUrl`. Returns null on any decode failure;
 * callers should treat null as "no prefill" and fall back to the
 * normal restore path.
 */
export function decodePrefillParam(raw: string): unknown | null {
  try {
    return JSON.parse(decodeURIComponent(atob(raw)));
  } catch {
    return null;
  }
}

/**
 * True iff the calculator already has a non-empty AUTOSAVE draft —
 * the operator's work-in-progress that this handoff will override.
 */
export function hasExistingCalculatorDraft(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as {
      rows?: unknown[];
      client?: { name?: string; phone?: string };
    };
    const hasRows = Array.isArray(parsed.rows) && parsed.rows.length > 0;
    const hasClient =
      !!parsed.client &&
      ((parsed.client.name?.trim() ?? "") !== "" ||
        (parsed.client.phone?.trim() ?? "") !== "");
    return hasRows || hasClient;
  } catch {
    return false;
  }
}

function roundTo(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
