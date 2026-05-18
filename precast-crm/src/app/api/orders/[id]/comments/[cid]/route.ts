export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { can } from "@/lib/permissions";
import { CommentEditSchema } from "@/lib/validation";
import { extractMentions } from "@/lib/comments";

type Params = { id: string; cid: string };

// Edits are disallowed after this window — keeps the audit trail honest.
const EDIT_WINDOW_MINUTES = 30;

const authorSelect = { id: true, name: true, role: true } as const;

/** PATCH /api/orders/[id]/comments/[cid] — order.view (author only, 30-min window) */
export const PATCH = withPermission<Params>(
  "order.view",
  async (req: NextRequest, { params, user }) => {
    const existing = await prisma.comment.findUnique({
      where: { id: params.cid },
      select: {
        id: true,
        orderId: true,
        authorId: true,
        body: true,
        editHistory: true,
        createdAt: true,
        deletedAt: true,
      },
    });
    if (!existing || existing.orderId !== params.id) {
      return fail("Comment not found", 404);
    }
    if (existing.deletedAt) return fail("Comment is deleted", 422);
    if (existing.authorId !== user.id) return fail("Not your comment", 403);

    const ageMs = Date.now() - existing.createdAt.getTime();
    if (ageMs > EDIT_WINDOW_MINUTES * 60_000) {
      return fail(`Edit window expired (${EDIT_WINDOW_MINUTES} min)`, 422);
    }

    const body = CommentEditSchema.parse(await req.json());
    const mentionedUserIds = await extractMentions(body.body);

    // Json[] doesn't support `push` in Prisma — read-modify-write.
    const prevHistory = (existing.editHistory ?? []) as Prisma.InputJsonValue[];
    const nextHistory: Prisma.InputJsonValue[] = [
      { body: existing.body, editedAt: new Date().toISOString() },
      ...prevHistory,
    ];

    const updated = await prisma.comment.update({
      where: { id: params.cid },
      data: {
        body: body.body,
        mentionedUserIds,
        editHistory: nextHistory,
      },
      include: { author: { select: authorSelect } },
    });
    return ok(updated);
  },
);

/** DELETE /api/orders/[id]/comments/[cid] — order.view (author OR comment.moderate) */
export const DELETE = withPermission<Params>(
  "order.view",
  async (_req: NextRequest, { params, user }) => {
    const existing = await prisma.comment.findUnique({
      where: { id: params.cid },
      select: { id: true, orderId: true, authorId: true, deletedAt: true },
    });
    if (!existing || existing.orderId !== params.id) {
      return fail("Comment not found", 404);
    }
    if (existing.deletedAt) return fail("Comment already deleted", 422);

    const isModerator = can(user, "comment.moderate");
    if (!isModerator && existing.authorId !== user.id) {
      return fail("Not authorized to delete this comment", 403);
    }

    const updated = await prisma.comment.update({
      where: { id: params.cid },
      data: { deletedAt: new Date(), deletedById: user.id },
      select: { id: true, deletedAt: true, deletedById: true },
    });
    return ok(updated);
  },
);
