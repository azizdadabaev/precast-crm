import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendEachForMulticast = vi.fn();
vi.mock("firebase-admin/app", () => ({
  initializeApp: vi.fn(() => ({})),
  cert: vi.fn((x: unknown) => x),
  getApps: vi.fn(() => []),
}));
vi.mock("firebase-admin/messaging", () => ({
  getMessaging: () => ({ sendEachForMulticast }),
}));

const deviceFindMany = vi.fn();
const deviceDeleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    device: {
      findMany: (...a: unknown[]) => deviceFindMany(...a),
      deleteMany: (...a: unknown[]) => deviceDeleteMany(...a),
    },
  },
}));

const original = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
afterEach(() => { process.env.FIREBASE_SERVICE_ACCOUNT_JSON = original; vi.resetModules(); });
beforeEach(() => {
  sendEachForMulticast.mockReset();
  deviceFindMany.mockReset();
  deviceDeleteMany.mockReset();
});

describe("sendPushToUsers", () => {
  it("is a silent no-op when Firebase is not configured", async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const { sendPushToUsers, isPushConfigured } = await import("@/lib/push");
    expect(isPushConfigured()).toBe(false);
    await sendPushToUsers(["u1"], { type: "ORDER_PLACED" });
    expect(deviceFindMany).not.toHaveBeenCalled();
    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });

  it("sends one multicast to every device of the given users", async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: "p", client_email: "e", private_key: "k" });
    deviceFindMany.mockResolvedValue([{ fcmToken: "t1" }, { fcmToken: "t2" }]);
    sendEachForMulticast.mockResolvedValue({ responses: [{ success: true }, { success: true }], failureCount: 0 });
    const { sendPushToUsers } = await import("@/lib/push");
    await sendPushToUsers(["u1", "u2"], { type: "PAYMENT_CONFIRMED", orderId: "o1" });
    expect(deviceFindMany).toHaveBeenCalledWith({ where: { userId: { in: ["u1", "u2"] } }, select: { fcmToken: true } });
    const msg = sendEachForMulticast.mock.calls[0][0];
    expect(msg.tokens).toEqual(["t1", "t2"]);
    expect(msg.data).toEqual({ type: "PAYMENT_CONFIRMED", orderId: "o1" });
    expect(msg.android.priority).toBe("high");
  });

  it("deletes tokens FCM reports as unregistered", async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: "p", client_email: "e", private_key: "k" });
    deviceFindMany.mockResolvedValue([{ fcmToken: "dead" }, { fcmToken: "alive" }]);
    sendEachForMulticast.mockResolvedValue({
      failureCount: 1,
      responses: [
        { success: false, error: { code: "messaging/registration-token-not-registered" } },
        { success: true },
      ],
    });
    const { sendPushToUsers } = await import("@/lib/push");
    await sendPushToUsers(["u1"], { type: "X" });
    expect(deviceDeleteMany).toHaveBeenCalledWith({ where: { fcmToken: { in: ["dead"] } } });
  });

  it("never throws when FCM fails", async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: "p", client_email: "e", private_key: "k" });
    deviceFindMany.mockResolvedValue([{ fcmToken: "t" }]);
    sendEachForMulticast.mockRejectedValue(new Error("network"));
    const { sendPushToUsers } = await import("@/lib/push");
    await expect(sendPushToUsers(["u1"], { type: "X" })).resolves.toBeUndefined();
  });
});
