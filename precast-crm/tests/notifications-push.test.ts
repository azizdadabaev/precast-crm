import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn();
const $transaction = vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (...a: unknown[]) => $transaction(...(a as [Promise<unknown>[]])), notification: { create: (...a: unknown[]) => create(...a) } },
}));
const emit = vi.fn();
vi.mock("@/lib/notification-bus", () => ({ notificationBus: { emit: (...a: unknown[]) => emit(...a) } }));
const sendPushToUsers = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@/lib/push", () => ({ sendPushToUsers: (...a: unknown[]) => sendPushToUsers(...a) }));

import { emitNotifications } from "@/lib/notifications";

beforeEach(() => { create.mockReset(); emit.mockReset(); sendPushToUsers.mockClear(); });

describe("emitNotifications push fan-out", () => {
  it("sends one push per created row with string-only data", async () => {
    const now = new Date("2026-09-02T10:00:00Z");
    create.mockImplementation(async (args: { data: { userId: string } }) => ({
      id: `n-${args.data.userId}`, type: "PAYMENT_CONFIRMED", userId: args.data.userId,
      title: "Тўлов тасдиқланди", body: null, orderId: "o1", paymentId: "p1",
      projectId: null, commentId: null, conversationId: null, createdAt: now,
    }));
    await emitNotifications({ type: "PAYMENT_CONFIRMED", userIds: ["u1", "u2"], title: "Тўлов тасдиқланди", orderId: "o1", paymentId: "p1" });
    // Let the fire-and-forget promise settle.
    await new Promise((r) => setTimeout(r, 0));
    expect(sendPushToUsers).toHaveBeenCalledTimes(2);
    const [userIds, data] = sendPushToUsers.mock.calls[0] as [string[], Record<string, string>];
    expect(userIds).toEqual(["u1"]);
    expect(data).toEqual({
      type: "PAYMENT_CONFIRMED", notificationId: "n-u1", title: "Тўлов тасдиқланди", body: "",
      orderId: "o1", paymentId: "p1", projectId: "", commentId: "", conversationId: "",
      createdAt: now.toISOString(),
    });
    expect(emit).toHaveBeenCalledTimes(2); // SSE path unchanged
  });
});
