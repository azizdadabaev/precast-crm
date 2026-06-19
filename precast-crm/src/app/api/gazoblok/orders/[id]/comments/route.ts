export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, created, fail } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";
import { CommentCreateSchema } from "@/lib/validation";
import { extractMentions } from "@/lib/comments";
import { emitNotifications } from "@/lib/notifications";

type Params = { id: string };

const authorSelect = { id: true, name: true, role: true } as const;
const deletedBySelect = { id: true, name: true } as const;

/** GET /api/gazoblok/orders/[id]/comments — any logged-in user (gazoblok is open) */
export const GET = withAuth<Params>(
  async (_req: NextRequest, { params }) => {
    const order = await prisma.gazoblokOrder.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!order) return fail("Order not found", 404);

    const comments = await prisma.comment.findMany({
      where: { deletedAt: null, gazoblokOrderId: params.id },
      orderBy: { createdAt: "asc" },
      include: {
        author: { select: authorSelect },
        deletedBy: { select: deletedBySelect },
      },
    });
    return ok(comments);
  },
);

/** POST /api/gazoblok/orders/[id]/comments — any logged-in user (gazoblok is open) */
export const POST = withAuth<Params>(
  async (req: NextRequest, { params, user }) => {
    const order = await prisma.gazoblokOrder.findUnique({
      where: { id: params.id },
      select: { id: true, orderNumber: true },
    });
    if (!order) return fail("Order not found", 404);

    const body = CommentCreateSchema.parse(await req.json());
    const mentionedUserIds = await extractMentions(body.body);

    const comment = await prisma.comment.create({
      data: {
        gazoblokOrderId: params.id,
        authorId: user.id,
        body: body.body,
        mentionedUserIds,
      },
      include: { author: { select: authorSelect } },
    });

    const recipients = mentionedUserIds.filter((id) => id !== user.id);
    if (recipients.length) {
      // Notification model has no gazoblok-order link, so the mention fires with
      // the order number in the title (no deep link). commentId is still carried.
      void emitNotifications({
        type: "COMMENT_MENTION",
        userIds: recipients,
        title: `${user.name} сизни газоблок буюртма #${order.orderNumber} да эслади · ${user.name} mentioned you on gazoblok order #${order.orderNumber}`,
        body: body.body.slice(0, 160),
        commentId: comment.id,
      });
    }

    return created(comment);
  },
);
