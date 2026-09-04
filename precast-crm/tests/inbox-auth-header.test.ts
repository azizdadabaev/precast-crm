import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
const headerStore = { get: vi.fn() };
vi.mock("next/headers", () => ({ cookies: () => cookieStore, headers: () => headerStore }));

import { mintInboxUnlockToken, isInboxUnlocked, INBOX_UNLOCK_HEADER } from "@/lib/inbox-auth";

beforeEach(() => { cookieStore.get.mockReturnValue(undefined); headerStore.get.mockReset(); });

describe("isInboxUnlocked via header", () => {
  it("accepts a freshly minted token in X-Inbox-Unlock", async () => {
    const tok = await mintInboxUnlockToken();
    headerStore.get.mockImplementation((k: string) => (k === INBOX_UNLOCK_HEADER ? tok : null));
    expect(await isInboxUnlocked()).toBe(true);
  });
  it("rejects garbage in the header", async () => {
    headerStore.get.mockReturnValue("nope");
    expect(await isInboxUnlocked()).toBe(false);
  });
  it("still honours the cookie", async () => {
    cookieStore.get.mockReturnValue({ value: await mintInboxUnlockToken() });
    headerStore.get.mockReturnValue(null);
    expect(await isInboxUnlocked()).toBe(true);
  });
});
