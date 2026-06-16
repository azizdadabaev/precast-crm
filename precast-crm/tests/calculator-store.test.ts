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
