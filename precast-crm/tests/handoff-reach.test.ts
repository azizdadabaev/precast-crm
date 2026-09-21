import { describe, it, expect, vi, beforeEach } from "vitest";

const conversationFindFirst = vi.fn();
const conversationFindMany = vi.fn();
const clientFindUnique = vi.fn();
const projectFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: {
      findFirst: (...a: unknown[]) => conversationFindFirst(...a),
      findMany: (...a: unknown[]) => conversationFindMany(...a),
    },
    client: { findUnique: (...a: unknown[]) => clientFindUnique(...a) },
    project: { findFirst: (...a: unknown[]) => projectFindFirst(...a) },
  },
}));

import { findReachableChats } from "@/lib/handoff-reach";

const chat = (id: string, displayName: string) => ({
  id,
  displayName,
  username: null,
  lastMessageAt: new Date("2026-09-20T10:00:00Z"),
});

beforeEach(() => {
  conversationFindFirst.mockReset().mockResolvedValue(null);
  conversationFindMany.mockReset().mockResolvedValue([]);
  clientFindUnique.mockReset().mockResolvedValue(null);
  projectFindFirst.mockReset().mockResolvedValue(null);
});

/**
 * The line this module exists to hold: a PROVEN match is sent to without asking,
 * a LIKELY one never is. Names repeat in this CRM by design — the client identity
 * is the phone — so a name match is a guess, and a wrong guess puts one
 * customer's price list in another customer's chat.
 */
describe("findReachableChats", () => {
  it("proves a chat that carries the phone itself", async () => {
    conversationFindFirst.mockResolvedValue(chat("c1", "Азиз"));
    const r = await findReachableChats("901112233");
    expect(r.proven?.conversationId).toBe("c1");
    expect(r.likely).toEqual([]);
    // A proven match must not go on to scan for lookalikes.
    expect(conversationFindMany).not.toHaveBeenCalled();
  });

  it("proves a chat a quote was already saved against for this client", async () => {
    clientFindUnique.mockResolvedValue({ id: "cl1", name: "Азиз Дадамов" });
    projectFindFirst.mockResolvedValue({ conversation: chat("c2", "Aziz") });
    const r = await findReachableChats("901112233");
    expect(r.proven?.conversationId).toBe("c2");
    expect(r.likely).toEqual([]);
  });

  it("offers a same-name chat as LIKELY, never as proven", async () => {
    clientFindUnique.mockResolvedValue({ id: "cl1", name: "Азиз Дадамов" });
    conversationFindMany.mockResolvedValue([chat("c3", "Азиз Дадамов"), chat("c4", "Бошқа одам")]);
    const r = await findReachableChats("901112233");
    expect(r.proven).toBeNull();
    expect(r.likely.map((c) => c.conversationId)).toEqual(["c3"]);
  });

  /** «Азиз Дадамов» and «азиз  дадамов 🏠» are one person typing in a hurry. */
  it("compares names on letters only", async () => {
    clientFindUnique.mockResolvedValue({ id: "cl1", name: "Азиз Дадамов" });
    conversationFindMany.mockResolvedValue([chat("c5", "азиз  дадамов 🏠")]);
    const r = await findReachableChats("901112233");
    expect(r.likely.map((c) => c.conversationId)).toEqual(["c5"]);
  });

  it("returns nothing for a number the CRM has never seen", async () => {
    const r = await findReachableChats("901112233");
    expect(r).toEqual({ proven: null, likely: [] });
  });

  /** A client with no name cannot be matched by name — that would match everyone. */
  it("does not guess for a nameless client", async () => {
    clientFindUnique.mockResolvedValue({ id: "cl1", name: "   " });
    conversationFindMany.mockResolvedValue([chat("c6", "Кимдир")]);
    const r = await findReachableChats("901112233");
    expect(r.likely).toEqual([]);
  });

  it("caps the shortlist so it stays something a person reads", async () => {
    clientFindUnique.mockResolvedValue({ id: "cl1", name: "Азиз" });
    conversationFindMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => chat(`c${i}`, "Азиз")),
    );
    const r = await findReachableChats("901112233");
    expect(r.likely).toHaveLength(3);
  });

  it("is nothing at all for an unparseable number", async () => {
    expect(await findReachableChats("")).toEqual({ proven: null, likely: [] });
  });

  /** Only chats the bot can actually send to are ever offered. */
  it("asks only for chats with a live business connection", async () => {
    await findReachableChats("901112233");
    const where = conversationFindFirst.mock.calls[0][0].where;
    expect(where.businessConnectionId).toEqual({ not: null });
  });
});
