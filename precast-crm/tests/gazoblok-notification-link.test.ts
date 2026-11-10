import { describe, it, expect } from "vitest";
import { targetUrl } from "@/components/notifications/notification-meta";
import type { NotificationItem } from "@/hooks/useNotifications";

function item(over: Partial<NotificationItem>): NotificationItem {
  return {
    id: "n1",
    type: "PAYMENT_RECORDED",
    title: "t",
    body: null,
    orderId: null,
    paymentId: null,
    projectId: null,
    commentId: null,
    conversationId: null,
    gazoblokOrderId: null,
    createdAt: "2026-11-10T07:00:00.000Z",
    readAt: null,
    ...over,
  };
}

describe("gazoblok notification link", () => {
  it("targetUrl prefers gazoblokOrderId", () => {
    expect(targetUrl(item({ gazoblokOrderId: "g1", orderId: null, paymentId: "p1" }))).toBe("/gazoblok/orders/g1");
  });

  it("beam order link is unchanged", () => {
    expect(targetUrl(item({ orderId: "o1" }))).toBe("/orders/o1");
  });
});
