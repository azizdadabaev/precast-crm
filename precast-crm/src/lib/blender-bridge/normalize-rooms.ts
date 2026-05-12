// Blender Bridge — rooms normalizer.
//
// The CRM stores rooms on `Calculation` rows with camelCase columns
// and Prisma Decimal types. The Blender precast addon's
// `calculate_slab()` expects snake_case fields with plain numbers
// and `pattern` either "GB" / "BGB" / "GBG" or null (= auto).
//
// This helper is the single source of truth for that conversion.
// Used by:
//   - POST /api/drawings/request → snapshot rooms into roomsJson
//   - validation (validateRoomsForBlender) → 400 reject if shape is wrong
//
// The input is intentionally typed as `unknown[]` so we can accept
// either Prisma-shaped rows OR pre-normalized payloads (e.g. when the
// calculator hands us its in-memory rows). The shape is sniffed via
// fallback keys.

import type { LayoutPattern } from "@prisma/client";

export type BlenderRoom = {
  name: string;
  inner_width: number;
  inner_length: number;
  bearing: number;
  pattern: "GB" | "BGB" | "GBG" | null;
  correction: number;
  extra_beams: number;
  force_start_beam: boolean;
};

/** Maximum rooms accepted in one DrawingRequest. Generous for a real
 *  construction project but small enough that a bug or a paste-bomb
 *  won't lock up the bridge. */
export const MAX_ROOMS_PER_REQUEST = 50;

/** Coerce a Prisma Decimal / string / number to a finite JS number.
 *  Returns NaN on failure so the caller can validate. */
function toNumber(v: unknown): number {
  if (v == null) return NaN;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** Snap an arbitrary pattern value (Prisma enum or string) to one of
 *  the four supported values, returning null for AUTO / unknown. */
function pickPattern(v: unknown): BlenderRoom["pattern"] {
  if (v === "GB" || v === "BGB" || v === "GBG") return v;
  // "AUTO", null, undefined, etc. all map to null (= let the addon
  // re-derive the pattern on its side).
  return null;
}

/** Normalize one raw room (Prisma Calculation row OR calculator
 *  in-memory shape OR a previously-normalized payload) to the
 *  Blender shape. Coerces Decimals, snake_cases keys. */
export function normalizeRoomForBlender(raw: Record<string, unknown>): BlenderRoom {
  // Accept both camelCase (Prisma) and snake_case (already normalized).
  const get = (camel: string, snake?: string): unknown =>
    raw[camel] ?? (snake ? raw[snake] : undefined);

  const name =
    (typeof raw.name === "string" && raw.name) ||
    (typeof raw.roomName === "string" && raw.roomName) ||
    "Room";

  // Pattern source: prefer the operator's override (`patternOverride`
  // on Calculation rows). When the override is null the operator chose
  // AUTO — emit null to Blender so the addon re-derives.
  const patternRaw =
    raw.patternOverride !== undefined && raw.patternOverride !== null
      ? raw.patternOverride
      : raw.pattern;

  return {
    name,
    inner_width: toNumber(get("innerWidth", "inner_width") ?? raw.width),
    inner_length: toNumber(get("innerLength", "inner_length") ?? raw.length),
    bearing: toNumber(raw.bearing) || 0.15,
    pattern: pickPattern(patternRaw),
    correction: toNumber(raw.correction) || 0,
    extra_beams: Number(
      raw.extraBeams ?? raw.extra_beams ?? 0,
    ) | 0,
    force_start_beam: Boolean(
      raw.forceStartBeam ?? raw.force_start_beam ?? false,
    ),
  };
}

export function normalizeRoomsForBlender(
  rooms: ReadonlyArray<Record<string, unknown>>,
): BlenderRoom[] {
  return rooms.map(normalizeRoomForBlender);
}

/** Hard validation. Returns the first error, or null when valid.
 *  Designed for the POST route to surface a clear 400 before the row
 *  ever lands in the database. */
export function validateRoomsForBlender(
  rooms: BlenderRoom[],
): string | null {
  if (!Array.isArray(rooms)) return "rooms must be an array";
  if (rooms.length === 0) return "rooms array is empty";
  if (rooms.length > MAX_ROOMS_PER_REQUEST) {
    return `too many rooms (max ${MAX_ROOMS_PER_REQUEST}, got ${rooms.length})`;
  }

  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    const tag = `room[${i}]${r.name ? ` (${r.name})` : ""}`;
    if (!Number.isFinite(r.inner_width) || r.inner_width <= 0) {
      return `${tag}: inner_width must be > 0`;
    }
    if (!Number.isFinite(r.inner_length) || r.inner_length <= 0) {
      return `${tag}: inner_length must be > 0`;
    }
    if (!Number.isFinite(r.bearing) || r.bearing < 0) {
      return `${tag}: bearing must be ≥ 0`;
    }
    if (
      r.pattern !== null &&
      r.pattern !== "GB" &&
      r.pattern !== "BGB" &&
      r.pattern !== "GBG"
    ) {
      return `${tag}: pattern must be one of "GB" | "BGB" | "GBG" | null`;
    }
    if (!Number.isInteger(r.extra_beams) || r.extra_beams < 0) {
      return `${tag}: extra_beams must be a non-negative integer`;
    }
  }
  return null;
}

// Re-export the Prisma enum for callers that want to construct patterns
// from typed values.
export type { LayoutPattern };
