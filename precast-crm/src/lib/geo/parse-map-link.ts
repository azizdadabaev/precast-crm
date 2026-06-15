/**
 * Parse a pasted Google Maps link (or plain "lat, lng" text) into coordinates.
 *
 * Staff paste links clients send via Telegram/WhatsApp. Full links carry
 * coordinates we can read with a regex; short links (maps.app.goo.gl, …) don't
 * and must be redirect-followed server-side first (see resolve-link route).
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Hostnames Google itself uses for short/place/map links — the ONLY hosts the
 * resolver endpoint is ever allowed to fetch (SSRF guard). */
const ALLOWED_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "g.co",
  "maps.google.com",
  "www.google.com",
]);

function inRange(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function toLatLng(latStr: string, lngStr: string): LatLng | null {
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!inRange(lat, lng)) return null;
  return { lat, lng };
}

const NUM = "-?\\d+(?:\\.\\d+)?";

/**
 * Parse the FIRST matching coordinate pattern, else null. Order:
 *   1. @lat,lng        (/@40.633,72.408,16z)
 *   2. q/query/ll/destination = lat,lng  (URL-decoded query values)
 *   3. !3d<lat>!4d<lng>  (place URLs)
 *   4. whole input is just "lat, lng" / "lat,lng"
 * Out-of-range values are rejected (null).
 */
export function parseMapLink(input: string): LatLng | null {
  const decoded = safeDecode(input);

  // 1. @lat,lng
  const at = new RegExp(`@(${NUM}),\\s*(${NUM})`).exec(decoded);
  if (at) {
    const r = toLatLng(at[1], at[2]);
    if (r) return r;
  }

  // 2. q / query / ll / destination = lat,lng
  const q = new RegExp(
    `[?&](?:q|query|ll|destination)=(${NUM}),\\s*(${NUM})`,
    "i",
  ).exec(decoded);
  if (q) {
    const r = toLatLng(q[1], q[2]);
    if (r) return r;
  }

  // 3. !3d<lat>!4d<lng>
  const place = new RegExp(`!3d(${NUM})!4d(${NUM})`).exec(decoded);
  if (place) {
    const r = toLatLng(place[1], place[2]);
    if (r) return r;
  }

  // 4. whole input is just two numbers
  const plain = new RegExp(`^\\s*(${NUM}),\\s*(${NUM})\\s*$`).exec(decoded);
  if (plain) {
    const r = toLatLng(plain[1], plain[2]);
    if (r) return r;
  }

  return null;
}

function safeDecode(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

/**
 * True only when the URL's hostname is EXACTLY one of Google's short/map-link
 * hosts. The resolver endpoint fetches a user-supplied URL only when this
 * returns true — so a non-URL, an IP, localhost, an internal host, or a
 * subdomain spoof (goo.gl.evil.com) all return false and are never fetched.
 */
export function isGoogleShortLinkHost(input: string): boolean {
  try {
    const { hostname } = new URL(input);
    return ALLOWED_HOSTS.has(hostname.toLowerCase());
  } catch {
    return false;
  }
}
