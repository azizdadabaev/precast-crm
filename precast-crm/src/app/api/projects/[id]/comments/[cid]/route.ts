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

const EDIT_WINDOW_MINUTES = 30;

const authorSelect = { id: true, name: true, role: true } as const;

/** PATCH /api/projects/[id]/comments/[cid] — calculator.use (author only, 30-min window) */
export const PATCH = withPermission<Params>(
  "calculator.use",
  async (req: NextRequest, { params, user }) => {
    const existing = await prisma.comment.findUnique({
      where: { id: params.cid },
      select: {
        id: true,
        projectId: true,
        authorId: true,
        body: true,
        editHistory: true,
        createdAt: true,
        deletedAt: true,
      },
    });
    if (!existing || existing.projectId !== params.id) {
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

/** DELETE /api/projects/[id]/comments/[cid] — calculator.use (author OR comment.moderate) */
export const DELETE = withPermission<Params>(
  "calculator.use",
  async (_req: NextRequest, { params, user }) => {
    const existing = await prisma.comment.findUnique({
      where: { id: params.cid },
      select: { id: true, projectId: true, authorId: true, deletedAt: true },
    });
    if (!existing || existing.projectId !== params.id) {
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
