// Public surface for the kenjebaev-sourced Uzbekistan regions data.
// Backed by the auto-generated typed constants in ./data.ts.
//
// Storage convention written by the AddressInput widget:
//   <Viloyat name>, <Tuman name>, <street>
// Examples:
//   "Toshkent shahri, Yunusobod tumani, Yunusobod 12-7"
//   "Andijon viloyati, Andijon tumani, Markaz 1"
//   "Toshkent shahri, Yunusobod 12-7"        (viloyat only)
//   "Yunusobod 12-7"                          (street only)
//
// Legacy fallback in parseAddress:
//   If the stored prefix doesn't match a viloyat or tuman name, we
//   try the older 12/14-city catalog (src/lib/uzbekistan-cities.ts)
//   so addresses written before this widget existed still display
//   correctly in edit mode.

import { VILOYATS, TUMANS, type Viloyat, type Tuman } from "./data";
import {
  UZBEKISTAN_CITIES,
  getProvinceForCity,
} from "@/lib/uzbekistan-cities";

export type { Viloyat, Tuman };
export { VILOYATS, TUMANS };

/** All 14 viloyats, sorted alphabetically by Latin name. */
export function getViloyats(): Viloyat[] {
  return [...VILOYATS].sort((a, b) => a.name.localeCompare(b.name, "en"));
}

/**
 * Tumans for a viloyat (by viloyatId), or every tuman if no id is
 * passed. Sorted alphabetically by Latin name.
 */
export function getTumans(viloyatId?: number | null): Tuman[] {
  const list =
    viloyatId == null ? [...TUMANS] : TUMANS.filter((t) => t.viloyatId === viloyatId);
  return list.sort((a, b) => a.name.localeCompare(b.name, "en"));
}

/** Return the parent viloyat of a tuman id, or null. */
export function getViloyatForTuman(tumanId: number): Viloyat | null {
  const t = TUMANS.find((x) => x.id === tumanId);
  if (!t) return null;
  return VILOYATS.find((v) => v.id === t.viloyatId) ?? null;
}

/** Look up a viloyat by its Latin name (exact match), or null. */
export function findViloyatByName(name: string): Viloyat | null {
  const v = VILOYATS.find((x) => x.name === name || x.nameUz === name);
  return v ?? null;
}

/** Look up a tuman by its Latin or Cyrillic name (exact match). */
export function findTumanByName(name: string): Tuman | null {
  const t = TUMANS.find((x) => x.name === name || x.nameUz === name);
  return t ?? null;
}

/**
 * Parse a stored address string into { viloyat, tuman, streetDetail }.
 *
 * We split on commas, then try to match the first 1-2 parts against
 * viloyat then tuman lookup tables. Whatever doesn't match becomes the
 * street detail.
 *
 * Legacy fallback: if the prefix matches the older capital-city
 * catalog (e.g. "Toshkent, street" or "Samarqand, street" written by
 * yesterday's widget), we resolve to the matching viloyat with an
 * empty tuman so the row still renders correctly in edit mode.
 */
export interface ParsedAddress {
  viloyat: string;
  tuman: string;
  streetDetail: string;
}

export function parseAddress(address: string): ParsedAddress {
  const empty: ParsedAddress = { viloyat: "", tuman: "", streetDetail: "" };
  if (!address) return empty;

  // Split off the first two comma-separated heads if any.
  const parts = address.split(",").map((s) => s.trim());

  // Try [head1=Viloyat, head2=Tuman, rest=Street].
  if (parts.length >= 2) {
    const v = findViloyatByName(parts[0]);
    const t = findTumanByName(parts[1]);
    if (v && t && t.viloyatId === v.id) {
      return {
        viloyat: v.name,
        tuman: t.name,
        streetDetail: parts.slice(2).join(", ").trim(),
      };
    }
  }

  // Try [head1=Viloyat, rest=Street].
  if (parts.length >= 1) {
    const v = findViloyatByName(parts[0]);
    if (v) {
      return {
        viloyat: v.name,
        tuman: "",
        streetDetail: parts.slice(1).join(", ").trim(),
      };
    }
    // Try [head1=Tuman, rest=Street] — accept a bare tuman prefix
    // even without its viloyat (auto-snap on render).
    const t = findTumanByName(parts[0]);
    if (t) {
      const v2 = VILOYATS.find((x) => x.id === t.viloyatId);
      return {
        viloyat: v2?.name ?? "",
        tuman: t.name,
        streetDetail: parts.slice(1).join(", ").trim(),
      };
    }
    // Legacy fallback: old "City, street" addresses from the
    // 14-city widget. Map the city to its viloyat name.
    const legacyCity = UZBEKISTAN_CITIES.find(
      (c) => c.city === parts[0] || c.cityUz === parts[0],
    );
    if (legacyCity) {
      const province = getProvinceForCity(legacyCity.city);
      const v3 = province ? findViloyatByName(province) : null;
      return {
        viloyat: v3?.name ?? "",
        tuman: "",
        streetDetail: parts.slice(1).join(", ").trim(),
      };
    }
  }

  return { viloyat: "", tuman: "", streetDetail: address };
}

/**
 * Compose the address string written to the DB. Mirrors parseAddress's
 * splitting rules.
 *
 *   ('', '', '')            → ''
 *   ('Viloyat', '', '')     → 'Viloyat'
 *   ('Viloyat', '', 'St 1') → 'Viloyat, St 1'
 *   ('V', 'T', '')          → 'V, T'
 *   ('V', 'T', 'St 1')      → 'V, T, St 1'
 */
export function composeAddress(
  viloyat: string,
  tuman: string,
  streetDetail: string,
): string {
  const parts: string[] = [];
  if (viloyat.trim()) parts.push(viloyat.trim());
  if (tuman.trim()) parts.push(tuman.trim());
  if (streetDetail.trim()) parts.push(streetDetail.trim());
  return parts.join(", ");
}

/**
 * Convert a stored address string to Cyrillic for display.
 * Handles both Latin (legacy storage) and already-Cyrillic strings —
 * safe to call on any address regardless of how it was written.
 */
export function addressToCyrillic(address: string): string {
  if (!address) return address;
  const { viloyat, tuman, streetDetail } = parseAddress(address);
  const v = viloyat ? findViloyatByName(viloyat) : null;
  const t = tuman ? findTumanByName(tuman) : null;
  return composeAddress(v?.nameUz ?? viloyat, t?.nameUz ?? tuman, streetDetail);
}

/** Bilingual label "Cyrillic · Latin" for a viloyat. */
export function viloyatLabel(name: string): string {
  const v = VILOYATS.find((x) => x.name === name);
  return v ? `${v.nameUz} · ${v.name}` : name;
}

/** Bilingual label "Cyrillic · Latin" for a tuman. */
export function tumanLabel(name: string): string {
  const t = TUMANS.find((x) => x.name === name);
  return t ? `${t.nameUz} · ${t.name}` : name;
}

/**
 * Expand a free-text search query into Latin + Cyrillic candidates so
 * an address search matches regardless of which alphabet the operator
 * typed vs. which one is stored. Returns the original query plus any
 * alternate-alphabet forms whose viloyat/tuman name contains the query
 * (case-insensitive). Empty/short queries return [q] unchanged.
 *
 * Examples:
 *   "Toshkent" → ["Toshkent", "Тошкент"]
 *   "Тошкент"  → ["Тошкент", "Toshkent"]
 *   "yunus"    → ["yunus", "Yunusobod", "Юнусобод"]
 *
 * Used by API search routes (orders, projects, clients) to widen the
 * `contains` filter so cross-alphabet stored addresses still match.
 */
export function addressSearchForms(q: string): string[] {
  const trimmed = q.trim();
  if (trimmed.length < 2) return trimmed ? [trimmed] : [];

  const lower = trimmed.toLowerCase();
  const out = new Set<string>([trimmed]);

  for (const v of VILOYATS) {
    if (v.name.toLowerCase().includes(lower)) {
      out.add(v.name);
      out.add(v.nameUz);
    }
    if (v.nameUz.toLowerCase().includes(lower)) {
      out.add(v.name);
      out.add(v.nameUz);
    }
  }
  for (const t of TUMANS) {
    if (t.name.toLowerCase().includes(lower)) {
      out.add(t.name);
      out.add(t.nameUz);
    }
    if (t.nameUz.toLowerCase().includes(lower)) {
      out.add(t.name);
      out.add(t.nameUz);
    }
  }
  return [...out];
}
