// Blender Bridge — rooms normalizer.
//
// The CRM stores rooms on `Calculation` rows with camelCase columns
// and Prisma Decimal types. The Blender precast addon's
// `calculate_slab()` expects snake_case fields with plain numbers.
//
// This helper is the single source of truth for that conversion.
// Used by:
//   - POST /api/drawings/request → snapshot rooms into roomsJson
//   - validation (validateRoomsForBlender) → 400 reject if shape is wrong
//
// PROTOCOL v2: pattern is always resolved (never null), and we also
// emit `pitches` — the post-auto-pick, post-remainder-bump pitch count
// the CRM committed to. The addon should trust both values verbatim
// and skip its own auto-pick / bump math, so the PDF totals match the
// invoice byte-for-byte.
//
// Why v2 exists: in v1 we sent pattern=null to mean AUTO, expecting
// the addon to re-derive. But the addon's auto-pick disagreed with the
// CRM's (different correction handling), causing per-room totals to
// drift up to ~5% on rows with correction > 0. Rather than keep two
// auto-pick implementations in lock-step forever, we send the CRM's
// authoritative result and have the addon render exactly what's billed.
//
// The input is intentionally typed as `unknown[]` so we can accept
// either Prisma-shaped rows OR pre-normalized payloads. The shape is
// sniffed via fallback keys.

import type { LayoutPattern } from "@prisma/client";

// Uzbek Cyrillic → Latin transliteration used to make room names
// ASCII-safe before they reach Blender (which can't render Cyrillic).
const CYRILLIC_MAP: Record<string, string> = {
  А: "A", а: "a", Б: "B", б: "b", В: "V", в: "v", Г: "G", г: "g",
  Д: "D", д: "d", Е: "E", е: "e", Ё: "Yo", ё: "yo", Ж: "Zh", ж: "zh",
  З: "Z", з: "z", И: "I", и: "i", Й: "Y", й: "y", К: "K", к: "k",
  Л: "L", л: "l", М: "M", м: "m", Н: "N", н: "n", О: "O", о: "o",
  П: "P", п: "p", Р: "R", р: "r", С: "S", с: "s", Т: "T", т: "t",
  У: "U", у: "u", Ф: "F", ф: "f", Х: "X", х: "x", Ц: "Ts", ц: "ts",
  Ч: "Ch", ч: "ch", Ш: "Sh", ш: "sh", Щ: "Shch", щ: "shch",
  Ъ: "", ъ: "", Ы: "I", ы: "i", Ь: "", ь: "",
  Э: "E", э: "e", Ю: "Yu", ю: "yu", Я: "Ya", я: "ya",
  // Uzbek-specific letters
  Ҳ: "H", ҳ: "h", Қ: "Q", қ: "q", Ғ: "G", ғ: "g", Ў: "O", ў: "o",
};

function latinize(s: string): string {
  return s.replace(/[А-яЁёҲҳҚқҒғЎў]/gu, (ch) => CYRILLIC_MAP[ch] ?? ch);
}

export type BlenderRoom = {
  name: string;
  inner_width: number;
  inner_length: number;
  bearing: number;
  /** Resolved pattern — what the CRM committed to after auto-pick and
   *  force_start_beam handling. Never null on outbound payloads. */
  pattern: "GB" | "BGB" | "GBG";
  correction: number;
  extra_beams: number;
  force_start_beam: boolean;
  /** Resolved pitch count, post-bump. Trust this verbatim; do NOT
   *  re-derive from effective_length. */
  pitches: number;
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

/** Snap a pattern value (Prisma enum or string) to the three supported
 *  resolved patterns, or undefined for any other input. The caller
 *  decides whether undefined is an error or a missing-data signal. */
function resolvePattern(v: unknown): BlenderRoom["pattern"] | undefined {
  if (v === "GB" || v === "BGB" || v === "GBG") return v;
  return undefined;
}

/** Normalize one raw room (Prisma Calculation row OR calculator
 *  in-memory shape OR a previously-normalized payload) to the
 *  Blender shape. Coerces Decimals, snake_cases keys.
 *
 *  Note: this function trusts the caller's resolved `pattern` and
 *  `pitches` — both are the CRM's committed values from the
 *  Calculation row. We do NOT re-run autoPickPattern() here. If those
 *  fields are missing or invalid, the room is forwarded with the best
 *  available data and the validator (validateRoomsForBlender) will
 *  surface the error. */
export function normalizeRoomForBlender(raw: Record<string, unknown>): BlenderRoom {
  // Accept both camelCase (Prisma) and snake_case (already normalized).
  const get = (camel: string, snake?: string): unknown =>
    raw[camel] ?? (snake ? raw[snake] : undefined);

  const rawName =
    (typeof raw.name === "string" && raw.name) ||
    (typeof raw.roomName === "string" && raw.roomName) ||
    "Room";
  // Normalize English default "Room N" → "Xona N" so rooms created before
  // the Uzbek-default change produce the same output as Cyrillic "Хона N".
  const name = latinize(rawName.replace(/^Room\s+(\d+)$/i, "Xona $1"));

  // Resolved pattern — Prisma's `pattern` column holds it post-auto-pick.
  // Fallback to snake-case `pattern` for already-normalized payloads.
  const patternResolved =
    resolvePattern(raw.pattern) ?? resolvePattern((raw as { pattern?: unknown }).pattern);

  // Resolved pitch count from the calculator. Required by the protocol
  // so the addon doesn't have to re-derive. NaN here will be caught by
  // the validator and surface a clear 400.
  const pitches = toNumber(get("pitches", "pitches"));

  return {
    name,
    inner_width: toNumber(get("innerWidth", "inner_width") ?? raw.width),
    inner_length: toNumber(get("innerLength", "inner_length") ?? raw.length),
    bearing: toNumber(raw.bearing) || 0.15,
    pattern: patternResolved ?? "GB", // validator will reject if upstream missed it
    correction: toNumber(raw.correction) || 0,
    extra_beams: Number(
      raw.extraBeams ?? raw.extra_beams ?? 0,
    ) | 0,
    force_start_beam: Boolean(
      raw.forceStartBeam ?? raw.force_start_beam ?? false,
    ),
    pitches: Number.isFinite(pitches) ? Math.trunc(pitches) : NaN,
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
    if (r.pattern !== "GB" && r.pattern !== "BGB" && r.pattern !== "GBG") {
      return `${tag}: pattern must be one of "GB" | "BGB" | "GBG"`;
    }
    if (!Number.isInteger(r.extra_beams) || r.extra_beams < 0) {
      return `${tag}: extra_beams must be a non-negative integer`;
    }
    if (!Number.isInteger(r.pitches) || r.pitches < 1) {
      return `${tag}: pitches must be a positive integer`;
    }
  }
  return null;
}

// Re-export the Prisma enum for callers that want to construct patterns
// from typed values.
export type { LayoutPattern };
