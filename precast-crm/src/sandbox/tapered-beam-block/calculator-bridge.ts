/**
 * One-way handoff from the sandbox into the main calculator.
 *
 * Why a separate key from the calculator's autosave?
 * The calculator's two useEffects (autosave on every change, restore
 * on mount) race on first mount — autosave fires before restore and
 * overwrites whatever's in `calc:autosave:v1` with the default empty
 * state. Writing the bridge payload to that same key gets clobbered.
 * So we use a distinct, single-use key the calculator's restore
 * effect checks BEFORE its autosave restore, and consumes on read.
 *
 * Calculator-side coupling: `src/app/(app)/calculations/page.tsx`
 * checks `BRIDGE_KEY` at the top of its restore useEffect and
 * deletes it after use. Removing the sandbox requires reverting
 * that block (see sandbox README).
 *
 * Mapping rule the operator asked for:
 *   group.innerWidth → row.innerWidth   (Width column)
 *   group.qty × beamSpacing → row.innerLength  (Length column)
 *   bearing = 0.15, correction = 0, extras = 0, pattern AUTO.
 */

import type { BeamGroup } from "./engine";

/** Single-use handoff key the calculator's restore consumes. */
const BRIDGE_KEY = "calc:bridge-import:v1";
/** The calculator's existing autosave key — read only, never written here. */
const AUTOSAVE_KEY = "calc:autosave:v1";
const DEFAULT_BEARING = 0.15;

/** Shape we hand to the calculator. Matches its `AutosaveState`. */
interface BridgePayload {
  client: {
    name: string;
    phone: string;
    address: string;
    consentGranted: boolean;
  };
  rows: Array<{
    id: string;
    name: string;
    innerWidth: number;
    innerLength: number;
    bearing: number;
    correction: number;
    extraBeams: number;
    forceStartBeam: boolean;
    patternOverride: "GB" | "BGB" | "GBG" | "AUTO";
    // `result` is set to null; the calculator's restore re-runs
    // `recomputeRow` for every row, so the in-app preview populates
    // immediately.
    result: null;
  }>;
  discountPercent: number;
  matchedClientId: string | null;
}

export function buildBridgePayload(args: {
  groups: BeamGroup[];
  beamSpacing: number;
}): BridgePayload {
  const rows = args.groups.map((g, i) => ({
    id: `bridge-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
    name: `Group ${i + 1}`,
    innerWidth: g.innerWidth,
    innerLength: roundTo(g.qty * args.beamSpacing, 3),
    bearing: DEFAULT_BEARING,
    correction: 0,
    extraBeams: 0,
    forceStartBeam: false,
    patternOverride: "AUTO" as const,
    result: null,
  }));

  return {
    client: { name: "", phone: "", address: "", consentGranted: false },
    rows,
    discountPercent: 0,
    matchedClientId: null,
  };
}

/** Persist the payload to the bridge key. SSR-safe. */
export function sendGroupsToCalculator(args: {
  groups: BeamGroup[];
  beamSpacing: number;
}): void {
  if (typeof window === "undefined") return;
  const payload = buildBridgePayload(args);
  try {
    localStorage.setItem(BRIDGE_KEY, JSON.stringify(payload));
  } catch {
    /* storage quota / disabled — fall back silently; navigation still happens */
  }
}

/**
 * True iff the calculator already has a non-empty AUTOSAVE draft —
 * i.e. the user has work-in-progress that this handoff will override
 * once the bridge import lands.
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
