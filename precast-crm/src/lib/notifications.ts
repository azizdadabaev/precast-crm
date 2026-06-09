import { prisma } from "@/lib/prisma";
import { notificationBus } from "@/lib/notification-bus";
import type { NotificationType } from "@prisma/client";

export interface CreateNotificationInput {
  type: NotificationType;
  userIds: string[];
  title: string;
  body?: string | null;
  orderId?: string | null;
  paymentId?: string | null;
  projectId?: string | null;
  commentId?: string | null;
  conversationId?: string | null;
}

/**
 * Persist notifications and broadcast to connected SSE clients.
 * Fire-and-forget — catches all errors so callers don't need to await
 * a try/catch. Mirrors the existing recordAudit() pattern.
 */
export async function emitNotifications(
  input: CreateNotificationInput,
): Promise<void> {
  if (!input.userIds.length) return;

  try {
    const rows = await prisma.$transaction(
      input.userIds.map((userId) =>
        prisma.notification.create({
          data: {
            type: input.type,
            userId,
            title: input.title,
            body: input.body ?? null,
            orderId: input.orderId ?? null,
            paymentId: input.paymentId ?? null,
            projectId: input.projectId ?? null,
            commentId: input.commentId ?? null,
            conversationId: input.conversationId ?? null,
          },
        }),
      ),
    );

    for (const row of rows) {
      notificationBus.emit(
        row.userId,
        JSON.stringify({
          id: row.id,
          type: row.type,
          title: row.title,
          body: row.body,
          orderId: row.orderId,
          paymentId: row.paymentId,
          projectId: row.projectId,
          commentId: row.commentId,
          conversationId: row.conversationId,
          createdAt: row.createdAt.toISOString(),
          readAt: null,
        }),
      );
    }
  } catch (err) {
    console.error("[notifications] emitNotifications failed:", err);
  }
}

/** Resolve active users who have the given permission action. */
export async function usersWithPermission(action: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true, permissions: { has: action } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
