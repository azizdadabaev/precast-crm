import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Minimal localStorage shim — vitest's default node environment has none.
class MemoryStorage {
  store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
  key(i: number) {
    return Array.from(this.store.keys())[i] ?? null;
  }
  get length() {
    return this.store.size;
  }
}

const memStorage = new MemoryStorage();
vi.stubGlobal("localStorage", memStorage);
// Zustand persist checks `typeof window` to skip on SSR; we make it a thing.
vi.stubGlobal("window", { localStorage: memStorage });

import {
  ANON_PERSIST_KEY,
  hydrateCalculatorAnon,
  scopeCalculatorPersistToUser,
  useCalculatorStore,
} from "../src/store/calculator";

const INITIAL_STATE = useCalculatorStore.getState();

beforeEach(() => {
  memStorage.clear();
  // Reset the store between tests — persist's rehydrate path can leave
  // state from a prior test's storage.
  useCalculatorStore.setState({
    client: { name: "", phone: "", address: "" },
    matchedClientId: null,
    rows: [],
    discountPercent: 0,
    draftProjectId: null,
    roundingGrid: 0.1,
  });
  // Restore the default persist key so per-user tests don't leak.
  useCalculatorStore.persist.setOptions({ name: ANON_PERSIST_KEY });
});

afterEach(() => {
  memStorage.clear();
});

describe("calculator store — actions", () => {
  it("setClient stores the client draft", () => {
    useCalculatorStore.getState().setClient({
      name: "Doston",
      phone: "+998 90 123 45 67",
      address: "Andijon",
    });
    expect(useCalculatorStore.getState().client.name).toBe("Doston");
  });

  it("setRows replaces the entire rows array", () => {
    const r1 = makeRoom("a", 3.0);
    const r2 = makeRoom("b", 4.0);
    useCalculatorStore.getState().setRows([r1, r2]);
    expect(useCalculatorStore.getState().rows).toHaveLength(2);
    expect(useCalculatorStore.getState().rows[0].id).toBe("a");
  });

  it("setDiscountPercent stores the value", () => {
    useCalculatorStore.getState().setDiscountPercent(15);
    expect(useCalculatorStore.getState().discountPercent).toBe(15);
  });

  it("setRoundingGrid swaps between 0.05 and 0.1", () => {
    useCalculatorStore.getState().setRoundingGrid(0.05);
    expect(useCalculatorStore.getState().roundingGrid).toBe(0.05);
    useCalculatorStore.getState().setRoundingGrid(0.1);
    expect(useCalculatorStore.getState().roundingGrid).toBe(0.1);
  });

  it("setDraftProjectId stores the id", () => {
    useCalculatorStore.getState().setDraftProjectId("proj-123");
    expect(useCalculatorStore.getState().draftProjectId).toBe("proj-123");
  });

  it("setSourceConversationId stores the id; clearAll and loadFrom reset it", () => {
    useCalculatorStore.getState().setSourceConversationId("conv-1");
    expect(useCalculatorStore.getState().sourceConversationId).toBe("conv-1");
    useCalculatorStore.getState().clearAll();
    expect(useCalculatorStore.getState().sourceConversationId).toBeNull();

    useCalculatorStore.getState().setSourceConversationId("conv-2");
    useCalculatorStore.getState().loadFrom({ draftProjectId: "p9" });
    expect(useCalculatorStore.getState().sourceConversationId).toBeNull();
  });
});

describe("calculator store — clearAll", () => {
  it("resets session fields to defaults", () => {
    useCalculatorStore.setState({
      client: { name: "X", phone: "+998 90", address: "Y" },
      matchedClientId: "c1",
      rows: [makeRoom("a", 3.0)],
      discountPercent: 10,
      draftProjectId: "p1",
      roundingGrid: 0.05,
    });
    useCalculatorStore.getState().clearAll();
    const s = useCalculatorStore.getState();
    expect(s.client).toEqual({ name: "", phone: "", address: "" });
    expect(s.matchedClientId).toBeNull();
    expect(s.rows).toEqual([]);
    expect(s.discountPercent).toBe(0);
    expect(s.draftProjectId).toBeNull();
  });

  it("preserves roundingGrid as a workspace preference", () => {
    useCalculatorStore.getState().setRoundingGrid(0.05);
    useCalculatorStore.getState().clearAll();
    expect(useCalculatorStore.getState().roundingGrid).toBe(0.05);
  });
});

describe("calculator store — loadFrom", () => {
  it("merges the partial slice on top of fresh defaults", () => {
    useCalculatorStore.setState({ matchedClientId: "leftover" });
    useCalculatorStore.getState().loadFrom({
      draftProjectId: "p1",
      client: { name: "Bobur", phone: "x", address: "y" },
      rows: [makeRoom("a", 3.5)],
    });
    const s = useCalculatorStore.getState();
    expect(s.draftProjectId).toBe("p1");
    expect(s.client.name).toBe("Bobur");
    expect(s.rows).toHaveLength(1);
    // matchedClientId was reset by loadFrom (defaults overrode the leftover).
    expect(s.matchedClientId).toBeNull();
  });

  it("preserves roundingGrid through loadFrom (workspace preference)", () => {
    useCalculatorStore.getState().setRoundingGrid(0.05);
    useCalculatorStore.getState().loadFrom({
      client: { name: "X", phone: "p", address: "a" },
    });
    expect(useCalculatorStore.getState().roundingGrid).toBe(0.05);
  });
});

describe("calculator store — persist", () => {
  it("writes to the configured key on state change (anon)", async () => {
    useCalculatorStore.getState().setDiscountPercent(7);
    // Persist middleware is sync-write but uses microtasks; flush.
    await Promise.resolve();
    const raw = memStorage.getItem(ANON_PERSIST_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.discountPercent).toBe(7);
  });

  it("writes to a user-scoped key after scopeCalculatorPersistToUser", async () => {
    await scopeCalculatorPersistToUser("u1");
    useCalculatorStore.getState().setDiscountPercent(11);
    await Promise.resolve();
    const raw = memStorage.getItem("calculator-draft-u1");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.discountPercent).toBe(11);
  });

  it("hydrateCalculatorAnon migrates from the legacy calc:autosave:v1 key", async () => {
    memStorage.setItem(
      "calc:autosave:v1",
      JSON.stringify({
        client: { name: "Legacy", phone: "p", address: "a" },
        matchedClientId: null,
        rows: [],
        discountPercent: 22,
      }),
    );
    await hydrateCalculatorAnon();
    expect(useCalculatorStore.getState().client.name).toBe("Legacy");
    expect(useCalculatorStore.getState().discountPercent).toBe(22);
    // Legacy key is consumed and removed.
    expect(memStorage.getItem("calc:autosave:v1")).toBeNull();
  });

  it("scopeCalculatorPersistToUser migrates legacy data into the per-user slot", async () => {
    memStorage.setItem(
      "calc:autosave:v1",
      JSON.stringify({
        client: { name: "Legacy2", phone: "p", address: "a" },
        matchedClientId: null,
        rows: [],
        discountPercent: 33,
      }),
    );
    await scopeCalculatorPersistToUser("u2");
    expect(useCalculatorStore.getState().client.name).toBe("Legacy2");
    expect(useCalculatorStore.getState().discountPercent).toBe(33);
    expect(memStorage.getItem("calc:autosave:v1")).toBeNull();
    expect(memStorage.getItem("calculator-draft-u2")).not.toBeNull();
  });

  it("scopeCalculatorPersistToUser is no-op-y when the per-user slot already has data", async () => {
    memStorage.setItem(
      "calculator-draft-u3",
      JSON.stringify({
        state: {
          client: { name: "Existing", phone: "p", address: "a" },
          matchedClientId: null,
          rows: [],
          discountPercent: 5,
          draftProjectId: null,
          roundingGrid: 0.1,
        },
        version: 1,
      }),
    );
    memStorage.setItem(
      "calc:autosave:v1",
      JSON.stringify({
        client: { name: "Should not win", phone: "p", address: "a" },
        matchedClientId: null,
        rows: [],
        discountPercent: 99,
      }),
    );
    await scopeCalculatorPersistToUser("u3");
    // The existing per-user slot wins; legacy is NOT migrated when the
    // slot is non-empty so we don't clobber the operator's saved draft.
    expect(useCalculatorStore.getState().client.name).toBe("Existing");
    expect(useCalculatorStore.getState().discountPercent).toBe(5);
    // Legacy stays around since it wasn't consumed for u3.
    expect(memStorage.getItem("calc:autosave:v1")).not.toBeNull();
  });
});

// Suppress the "INITIAL_STATE captured at import time" warning — used as a
// sanity check that nothing else mutates module-level defaults across tests.
describe("module sanity", () => {
  it("module-level INITIAL_STATE has the expected shape", () => {
    expect(INITIAL_STATE.discountPercent).toBe(0);
    expect(INITIAL_STATE.rows).toEqual([]);
    expect(INITIAL_STATE.roundingGrid).toBe(0.1);
  });
});

// ── helpers ──────────────────────────────────────────────────
function makeRoom(id: string, innerWidth: number) {
  return {
    id,
    name: `Room ${id}`,
    innerWidth,
    innerLength: 5,
    bearing: 0.15,
    correction: 0,
    extraBeams: 0,
    forceStartBeam: false,
    patternOverride: "AUTO" as const,
    result: null,
    originalWidth: innerWidth,
    m2PriceOverride: false,
    m2PriceOverrideValue: null,
    m2PriceReason: null,
  };
}

describe("calculator store — layout board", () => {
  const room = (id: string) => ({ ...makeRoom(id, 4.6), innerLength: 4 });

  it("placeRoom puts a row on the board and edits keep its position", async () => {
    const { recomputeRow } = await import("../src/components/calculation/MultiRoomCalculator");
    const s = useCalculatorStore.getState();
    s.setRows([room("a"), room("b")]);
    useCalculatorStore.getState().placeRoom("a", { x: 10, y: 20, rot: 0 });
    const placed = useCalculatorStore.getState().rows[0];
    expect(placed.layout).toEqual({ x: 10, y: 20, rot: 0 });
    expect(recomputeRow({ ...placed, innerLength: 4.2 }).layout).toEqual({ x: 10, y: 20, rot: 0 });
  });

  it("deleting a row leaves the other rows' positions alone", () => {
    const s = useCalculatorStore.getState();
    s.setRows([room("a"), room("b"), room("c")]);
    useCalculatorStore.getState().placeRoom("b", { x: 1, y: 2, rot: 0 });
    useCalculatorStore.getState().placeRoom("c", { x: 3, y: 4, rot: 90 });
    useCalculatorStore.getState().setRows(useCalculatorStore.getState().rows.filter((r) => r.id !== "a"));
    expect(useCalculatorStore.getState().rows.map((r) => r.layout)).toEqual([
      { x: 1, y: 2, rot: 0 },
      { x: 3, y: 4, rot: 90 },
    ]);
  });

  it("rotateRoom turns 90° about the room centre", () => {
    useCalculatorStore.getState().setRows([room("a")]);
    useCalculatorStore.getState().placeRoom("a", { x: 0, y: 0, rot: 0 });
    useCalculatorStore.getState().rotateRoom("a");
    expect(useCalculatorStore.getState().rows[0].layout).toEqual({ x: -30, y: 30, rot: 90 });
  });

  it("unplaceRoom sends the room back to the tray (null)", () => {
    useCalculatorStore.getState().setRows([room("a")]);
    useCalculatorStore.getState().placeRoom("a", { x: 0, y: 0, rot: 0 });
    useCalculatorStore.getState().unplaceRoom("a");
    expect(useCalculatorStore.getState().rows[0].layout).toBeNull();
  });

  it("undoLayout and redoLayout step through board moves", () => {
    useCalculatorStore.getState().setRows([room("a")]);
    useCalculatorStore.getState().placeRoom("a", { x: 0, y: 0, rot: 0 });
    useCalculatorStore.getState().placeRoom("a", { x: 50, y: 0, rot: 0 });
    useCalculatorStore.getState().undoLayout();
    expect(useCalculatorStore.getState().rows[0].layout).toEqual({ x: 0, y: 0, rot: 0 });
    useCalculatorStore.getState().undoLayout();
    expect(useCalculatorStore.getState().rows[0].layout ?? null).toBeNull();
    useCalculatorStore.getState().redoLayout();
    expect(useCalculatorStore.getState().rows[0].layout).toEqual({ x: 0, y: 0, rot: 0 });
  });

  it("applyLayouts places several rooms in one undo step", () => {
    useCalculatorStore.getState().setRows([room("a"), room("b")]);
    useCalculatorStore.getState().applyLayouts(new Map([["a", { x: 0, y: 0, rot: 0 as const }], ["b", { x: 430, y: 0, rot: 0 as const }]]));
    expect(useCalculatorStore.getState().rows.map((r) => r.layout?.x)).toEqual([0, 430]);
    useCalculatorStore.getState().undoLayout();
    expect(useCalculatorStore.getState().rows.every((r) => !r.layout)).toBe(true);
  });

  it("persists the wall thickness and row layouts", async () => {
    useCalculatorStore.getState().setRows([room("a")]);
    useCalculatorStore.getState().placeRoom("a", { x: 5, y: 6, rot: 0 });
    useCalculatorStore.getState().setLayoutWallCm(40);
    await Promise.resolve();
    const parsed = JSON.parse(memStorage.getItem(ANON_PERSIST_KEY)!);
    expect(parsed.state.layoutWallCm).toBe(40);
    expect(parsed.state.rows[0].layout).toEqual({ x: 5, y: 6, rot: 0 });
  });
});
