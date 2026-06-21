import { create } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";
import {
  recomputeRow,
  type SlabRow,
} from "@/components/calculation/MultiRoomCalculator";
import type { ClientDraft } from "@/components/calculation/ClientInfoBar";
import type { Pt, BeamDir, RoomShape } from "@/lib/cad/geometry";

/**
 * Calculator state — auto-saved to localStorage so in-app navigation,
 * browser refresh, and tab close don't drop the operator's work.
 *
 * Independent of the Save Project / /projects DB persistence: that flow
 * is the canonical permanent storage. This store is just a draft that
 * lives between save points.
 *
 * Per-user keying is wired via `useCalculatorScopeKey` (consumed at app
 * mount). Until /api/auth/me resolves, the anon key is used; the hook
 * then re-points the persist storage at `calculator-draft-${userId}`
 * and rehydrates from there.
 */

export type RoundingGrid = 0.05 | 0.1;

/**
 * In-progress floor plan from the Draw-room dialog. Persisted alongside the
 * rest of the draft so closing the dialog (or a refresh) before "Add rooms"
 * doesn't lose the outlines, and reopening "Draw room" restores them. Cleared on
 * a successful Add (the outlines became calculator rows) and by Clear.
 *  - `rooms`: every room outline on the canvas (one priced room each).
 *  - `globalDir`: whole-drawing beam-direction choice (null = Auto/short-side).
 *  - `dirOverrides`: per-bay beam-direction overrides, keyed "roomIndex:bayIndex".
 */
export interface CalculatorDrawing {
  rooms: RoomShape[];
  globalDir: BeamDir | null;
  dirOverrides: Record<string, BeamDir>;
  /** Wall thickness (cm). The drawn outline is the TRUE INNER (clear) dimension —
   *  beam/block counts come from it and are NOT affected by the thickness. When
   *  > 0 the wall renders as a band OUTWARD around the room (visual only); beams
   *  seat onto it by the bearing. 0/absent = single-line slab. */
  wallThickCm?: number;
  /** Infinite construction guides (non-printing reference lines), each defined
   *  by two points on it. Snap targets only; never part of a room outline. */
  guides?: Array<{ a: Pt; b: Pt }>;
}

/** Mint a stable, unique room id. Kept here (not in the pure geometry module)
 *  because it uses randomness; preserved across edits for diff/identity. */
export function newRoomId(): string {
  return "r" + Math.random().toString(36).slice(2, 10);
}

/**
 * Coerce a persisted/loaded drawing value into the current rooms[] shape. An
 * earlier build stored a single `points` outline; convert any such legacy value
 * into one closed room so old drafts still open. Ensures every room has a stable
 * `id` (preserving existing ids, minting only for legacy id-less rooms). Returns
 * null for empty/garbage.
 */
export function normalizeDrawing(d: unknown): CalculatorDrawing | null {
  if (!d || typeof d !== "object") return null;
  const obj = d as Record<string, unknown>;
  const globalDir = (obj.globalDir as BeamDir | null) ?? null;
  if (Array.isArray(obj.rooms)) {
    const rooms = (obj.rooms as Partial<RoomShape>[])
      .filter((r) => r && Array.isArray(r.points))
      .map((r) => ({
        id: r.id || newRoomId(),
        points: r.points as Pt[],
        closed: !!r.closed,
        holes: Array.isArray(r.holes) ? (r.holes as Pt[][]) : undefined,
      }));
    if (!rooms.length) return null;
    return {
      rooms,
      globalDir,
      dirOverrides: (obj.dirOverrides as Record<string, BeamDir>) ?? {},
      wallThickCm: typeof obj.wallThickCm === "number" ? obj.wallThickCm : 0,
      guides: Array.isArray(obj.guides)
        ? (obj.guides as Array<{ a: Pt; b: Pt }>)
        : undefined,
    };
  }
  // Legacy single-outline shape → wrap as one closed room.
  if (Array.isArray(obj.points)) {
    if (!(obj.points as Pt[]).length) return null;
    return {
      rooms: [{ id: newRoomId(), points: obj.points as Pt[], closed: true }],
      globalDir,
      dirOverrides: {},
    };
  }
  return null;
}

export const ANON_PERSIST_KEY = "calculator-draft-anon";
/** The pre-Zustand autosave key. Migrated on first rehydrate, then deleted. */
const LEGACY_KEY = "calc:autosave:v1";
/** The pre-Zustand standalone rounding-grid key. Migrated, then deleted. */
const LEGACY_GRID_KEY = "calculator.roundingGrid";

interface CalculatorState {
  // ── Persisted ──────────────────────────────────────────────
  client: ClientDraft;
  matchedClientId: string | null;
  rows: SlabRow[];
  // Two ways to express the grand-total discount; mutually exclusive
  // at the UI level (one is disabled while the other is non-zero).
  // See projectTotal() in calculation-engine.ts for the resolution
  // rule: amount > 0 wins, else percent.
  discountPercent: number;
  discountAmount: number;
  /** When opening a project from /projects, this carries the project id so
   *  that "Save Project" UPDATES the existing draft instead of creating a
   *  duplicate. Persisted so it survives in-app navigation. */
  draftProjectId: string | null;
  /** When opening an existing order via "Edit Order Details" on the order
   *  detail page (?fromOrder=<id>), this carries the order id. While set,
   *  the calculator runs in edit-mode: Save Project hides, "Place Order"
   *  becomes "Save edits", and submit PATCHes the existing order instead
   *  of creating a new one. Persisted so a refresh during edit doesn't
   *  drop the user out of edit-mode silently. */
  editingOrderId: string | null;
  /** When the calculator was opened from an inbox conversation
   *  (?fromConversation=<id>), this carries that conversation id so Save
   *  links the resulting Project back to the chat and the drawing dock
   *  knows which conversation's images to show. Reset by loadFrom/clearAll. */
  sourceConversationId: string | null;
  /** Operator dismissed the drawing dock (✕) to work on a clean full-width
   *  table. Hides the dock WITHOUT dropping the chat link — only Clear wipes
   *  the link. Persisted so the clean table survives a refresh. Reset by
   *  loadFrom/clearAll so a fresh handoff or reopened project shows the dock. */
  dockHidden: boolean;
  /** Drawing URLs the operator drag-dropped onto a non-chat (custom)
   *  calculation. Unlike conversation images (re-fetched from the chat on
   *  reload), these have no re-fetch source, so they're persisted here to
   *  survive a refresh. Each is a `/uploads/drafts/<userId>/…` URL. Cleared by
   *  loadFrom/clearAll; on Save the captured ones are copied into project media. */
  droppedImages: string[];
  /** Per-column width overrides keyed by column id (px). null = use
   *  default widths. Wiped by the calculator's "Reset to defaults"
   *  button. Order is fixed; only widths are user-customizable. */
  columnWidths: Record<string, number> | null;
  roundingGrid: RoundingGrid;
  /** In-progress Draw-room sketch (outline + beam-direction choices). null when
   *  nothing is being drawn. Persisted like the rest of the draft so it survives
   *  closing the dialog and a refresh. Reset by loadFrom/clearAll. */
  drawing: CalculatorDrawing | null;

  // ── Actions ────────────────────────────────────────────────
  setClient: (next: ClientDraft) => void;
  setMatchedClientId: (id: string | null) => void;
  setRows: (rows: SlabRow[]) => void;
  setDiscountPercent: (pct: number) => void;
  setDiscountAmount: (amount: number) => void;
  setDraftProjectId: (id: string | null) => void;
  setEditingOrderId: (id: string | null) => void;
  setSourceConversationId: (id: string | null) => void;
  setDockHidden: (hidden: boolean) => void;
  /** Append drag-dropped drawing URLs to the dock, de-duplicated. */
  addDroppedImages: (urls: string[]) => void;
  setColumnWidths: (widths: Record<string, number> | null) => void;
  setRoundingGrid: (grid: RoundingGrid) => void;
  setDrawing: (drawing: CalculatorDrawing | null) => void;
  /**
   * Replace the entire calculator session. Used by /projects "open draft"
   * and by hydration migration. Pass partial state; everything else
   * resets to defaults so a draft load can't leak prior session bits.
   */
  loadFrom: (next: Partial<Omit<CalculatorState, "loadFrom" | "clearAll" | "setClient" | "setMatchedClientId" | "setRows" | "setDiscountPercent" | "setDiscountAmount" | "setDraftProjectId" | "setEditingOrderId" | "setSourceConversationId" | "setDockHidden" | "addDroppedImages" | "setColumnWidths" | "setRoundingGrid" | "setDrawing">>) => void;
  /** Wipe all draft state. Called from the Clear button and after a
   *  successful Place Order. */
  clearAll: () => void;
}

const EMPTY_CLIENT: ClientDraft = {
  name: "",
  phone: "",
  address: "",
};

const INITIAL_STATE = {
  client: EMPTY_CLIENT,
  matchedClientId: null,
  rows: [] as SlabRow[],
  discountPercent: 0,
  discountAmount: 0,
  draftProjectId: null,
  editingOrderId: null as string | null,
  sourceConversationId: null as string | null,
  dockHidden: false,
  droppedImages: [] as string[],
  columnWidths: null as Record<string, number> | null,
  roundingGrid: 0.1 as RoundingGrid,
  drawing: null as CalculatorDrawing | null,
};

interface PersistedShape {
  client: ClientDraft;
  matchedClientId: string | null;
  rows: SlabRow[];
  discountPercent: number;
  discountAmount: number;
  draftProjectId: string | null;
  editingOrderId: string | null;
  sourceConversationId: string | null;
  dockHidden: boolean;
  droppedImages: string[];
  columnWidths: Record<string, number> | null;
  roundingGrid: RoundingGrid;
  drawing: CalculatorDrawing | null;
}

/**
 * SSR-safe storage adapter. The default `createJSONStorage(() => localStorage)`
 * dereferences `localStorage` eagerly at module init — in Node-side test
 * environments and during SSR, that throws and the whole persist API
 * silently fails to attach to the store. This adapter checks `typeof
 * window` per call so the store stays safe in all three environments
 * (browser → real storage, SSR → no-op, vitest → reads `window.localStorage`
 * once jsdom or a manual stub provides it).
 */
const safeJSONStorage: PersistStorage<PersistedShape> = {
  getItem: (name) => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(name);
      if (raw === null) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(name, JSON.stringify(value));
    } catch {
      /* quota / disabled — ignore */
    }
  },
  removeItem: (name) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

/**
 * One-shot migration from the pre-Zustand autosave keys. Runs only when
 * the new store's persisted slot is empty for this scope. Reads
 * `calc:autosave:v1` (rooms + client + discount + matchedClientId) and
 * `calculator.roundingGrid`, returns a merged payload, and deletes both
 * legacy keys so we don't double-migrate.
 */
function readLegacyMigration(): Partial<PersistedShape> | null {
  if (typeof window === "undefined") return null;
  let migrated: Partial<PersistedShape> | null = null;

  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedShape>;
      migrated = {
        client: parsed.client ?? EMPTY_CLIENT,
        matchedClientId: parsed.matchedClientId ?? null,
        rows: Array.isArray(parsed.rows) ? parsed.rows : [],
        discountPercent:
          typeof parsed.discountPercent === "number" ? parsed.discountPercent : 0,
      };
      window.localStorage.removeItem(LEGACY_KEY);
    }
  } catch {
    /* malformed legacy payload — fall through */
  }

  try {
    const rawGrid = window.localStorage.getItem(LEGACY_GRID_KEY);
    const parsedGrid = rawGrid === "0.05" ? 0.05 : rawGrid === "0.1" ? 0.1 : null;
    if (parsedGrid !== null) {
      migrated = { ...(migrated ?? {}), roundingGrid: parsedGrid };
      window.localStorage.removeItem(LEGACY_GRID_KEY);
    }
  } catch {
    /* ignore */
  }

  return migrated;
}

export const useCalculatorStore = create<CalculatorState>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      setClient: (next) => set({ client: next }),
      setMatchedClientId: (id) => set({ matchedClientId: id }),
      setRows: (rows) => set({ rows }),
      setDiscountPercent: (pct) =>
        // Mutex with discountAmount — setting percent to >0 clears
        // the amount, mirroring the UI disable rule.
        set((s) => ({
          discountPercent: pct,
          discountAmount: pct > 0 ? 0 : s.discountAmount,
        })),
      setDiscountAmount: (amount) =>
        set((s) => ({
          discountAmount: amount,
          discountPercent: amount > 0 ? 0 : s.discountPercent,
        })),
      setDraftProjectId: (id) => set({ draftProjectId: id }),
      setEditingOrderId: (id) => set({ editingOrderId: id }),
      setSourceConversationId: (id) => set({ sourceConversationId: id }),
      setDockHidden: (hidden) => set({ dockHidden: hidden }),
      addDroppedImages: (urls) =>
        set((s) => ({
          droppedImages: Array.from(new Set([...s.droppedImages, ...urls])),
          // A newly dropped drawing should be visible — un-hide the dock.
          dockHidden: false,
        })),
      setColumnWidths: (widths) => set({ columnWidths: widths }),
      setRoundingGrid: (grid) => set({ roundingGrid: grid }),
      setDrawing: (drawing) => set({ drawing }),

      loadFrom: (next) =>
        set((s) => ({
          // Reset everything to initial first so a draft-load can't leak
          // prior session state (e.g. a prior client phone), then layer
          // the new slice on top.
          ...INITIAL_STATE,
          // Preserve the rounding-grid preference across loadFrom — it's
          // a workspace setting, not session data.
          roundingGrid: s.roundingGrid,
          ...next,
        })),

      clearAll: () =>
        set((s) => ({
          ...INITIAL_STATE,
          // Same reasoning as loadFrom — Clear wipes session data, not
          // workspace preferences.
          roundingGrid: s.roundingGrid,
        })),
    }),
    {
      name: ANON_PERSIST_KEY,
      storage: safeJSONStorage,
      version: 1,
      // SSR safety: don't auto-hydrate during render. The page calls
      // `useHydrateCalculator` from a client effect, which decides between
      // the per-user key and the anon key once /api/auth/me resolves.
      skipHydration: true,
      partialize: (s): PersistedShape => ({
        client: s.client,
        matchedClientId: s.matchedClientId,
        rows: s.rows,
        discountPercent: s.discountPercent,
        discountAmount: s.discountAmount,
        draftProjectId: s.draftProjectId,
        editingOrderId: s.editingOrderId,
        sourceConversationId: s.sourceConversationId,
        dockHidden: s.dockHidden,
        droppedImages: s.droppedImages,
        columnWidths: s.columnWidths,
        roundingGrid: s.roundingGrid,
        drawing: s.drawing,
      }),
      // Re-run the engine on each row after rehydrating. Defends against
      // a calculation rule changing between sessions (rare in production
      // but worth it for the next time we touch the engine). Mirrors the
      // pre-store autosave's `setRows(parsed.rows.map(recomputeRow))`.
      // Rehydrate uses engine-default pricing; MultiRoomCalculator's
      // useLivePricing effect re-bills the rows once the /api/pricing
      // payload lands so the first render's tier values don't stick.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (Array.isArray(state.rows) && state.rows.length > 0) {
          state.rows = state.rows.map((r) => ({
            ...recomputeRow(r),
            name: r.name.replace(/^Row\s+(\d+)$/i, "Хона $1"),
          }));
        }
        // Coerce a legacy single-outline drawing into the rooms[] shape.
        if (state.drawing) state.drawing = normalizeDrawing(state.drawing);
      },
    },
  ),
);

/**
 * Point the store's persist storage at the per-user key WITHOUT rehydrating.
 * Used on a sandbox prefill handoff (?prefill=…): the prefill replaces the
 * draft, so we must NOT load the old draft — rehydrating would race with and
 * clobber the prefill (React Strict Mode double-invokes the hydration effect,
 * and a discarded invocation's async rehydrate can land after the prefill's
 * loadFrom). Future autosaves still persist to the correct per-user key.
 */
export function setCalculatorPersistKeyForUser(userId: string): void {
  if (typeof window === "undefined") return;
  useCalculatorStore.persist.setOptions({ name: `calculator-draft-${userId}` });
}

/**
 * Re-point the store's persist storage at a per-user key, then rehydrate
 * from it. Called once /api/auth/me resolves on app mount. If the
 * per-user slot is empty AND the legacy autosave key still exists, copies
 * the legacy payload into the per-user slot in the same step.
 *
 * Safe to call repeatedly with the same id; the inner setOptions+rehydrate
 * is cheap.
 */
export async function scopeCalculatorPersistToUser(userId: string): Promise<void> {
  if (typeof window === "undefined") return;
  const key = `calculator-draft-${userId}`;

  // If the per-user slot is empty, seed it from the legacy autosave keys.
  // This is the one-shot migration path — once the seed write happens,
  // legacy keys are removed and never read again.
  const existing = window.localStorage.getItem(key);
  if (!existing) {
    const legacy = readLegacyMigration();
    if (legacy) {
      const seed = {
        state: { ...INITIAL_STATE, ...legacy },
        version: 1,
      };
      try {
        window.localStorage.setItem(key, JSON.stringify(seed));
      } catch {
        /* quota / disabled — fall through, persist will write on next change */
      }
    }
  }

  useCalculatorStore.persist.setOptions({ name: key });
  await useCalculatorStore.persist.rehydrate();
}

/**
 * Hydrate from the anon key. Used as a fallback when /api/auth/me fails
 * (e.g. the operator is logged out). Also runs the legacy migration
 * against the anon slot if needed.
 */
export async function hydrateCalculatorAnon(): Promise<void> {
  if (typeof window === "undefined") return;
  const existing = window.localStorage.getItem(ANON_PERSIST_KEY);
  if (!existing) {
    const legacy = readLegacyMigration();
    if (legacy) {
      try {
        window.localStorage.setItem(
          ANON_PERSIST_KEY,
          JSON.stringify({ state: { ...INITIAL_STATE, ...legacy }, version: 1 }),
        );
      } catch {
        /* ignore */
      }
    }
  }
  // Anon is already the default name; no setOptions call needed.
  await useCalculatorStore.persist.rehydrate();
}
