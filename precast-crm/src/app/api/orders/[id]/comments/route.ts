export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, created, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { CommentCreateSchema } from "@/lib/validation";
import { extractMentions } from "@/lib/comments";
import { emitNotifications } from "@/lib/notifications";

type Params = { id: string };

const authorSelect = { id: true, name: true, role: true } as const;
const deletedBySelect = { id: true, name: true } as const;

/** GET /api/orders/[id]/comments — order.view */
export const GET = withPermission<Params>(
  "order.view",
  async (_req: NextRequest, { params }) => {
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!order) return fail("Order not found", 404);

    const comments = await prisma.comment.findMany({
      where: { orderId: params.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: {
        author: { select: authorSelect },
        deletedBy: { select: deletedBySelect },
      },
    });
    return ok(comments);
  },
);

/** POST /api/orders/[id]/comments — order.view */
export const POST = withPermission<Params>(
  "order.view",
  async (req: NextRequest, { params, user }) => {
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!order) return fail("Order not found", 404);

    const body = CommentCreateSchema.parse(await req.json());
    const mentionedUserIds = await extractMentions(body.body);

    const comment = await prisma.comment.create({
      data: {
        orderId: params.id,
        authorId: user.id,
        body: body.body,
        mentionedUserIds,
      },
      include: { author: { select: authorSelect } },
    });

    // Fire @mention notifications (excluding self-mentions). The order's
    // orderNumber goes into the title so the recipient can locate the
    // thread without opening the bell panel first.
    const recipients = mentionedUserIds.filter((id) => id !== user.id);
    if (recipients.length) {
      const o = await prisma.order.findUnique({
        where: { id: params.id },
        select: { id: true, orderNumber: true },
      });
      void emitNotifications({
        type: "COMMENT_MENTION",
        userIds: recipients,
        title: `${user.name} сизни буюртма #${o?.orderNumber ?? ""} да эслади · ${user.name} mentioned you on order #${o?.orderNumber ?? ""}`,
        body: body.body.slice(0, 160),
        orderId: params.id,
        commentId: comment.id,
      });
    }

    return created(comment);
  },
);
