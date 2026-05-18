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

/** GET /api/projects/[id]/comments — calculator.use */
export const GET = withPermission<Params>(
  "calculator.use",
  async (_req: NextRequest, { params }) => {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!project) return fail("Project not found", 404);

    const comments = await prisma.comment.findMany({
      where: { projectId: params.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: {
        author: { select: authorSelect },
        deletedBy: { select: deletedBySelect },
      },
    });
    return ok(comments);
  },
);

/** POST /api/projects/[id]/comments — calculator.use */
export const POST = withPermission<Params>(
  "calculator.use",
  async (req: NextRequest, { params, user }) => {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!project) return fail("Project not found", 404);

    const body = CommentCreateSchema.parse(await req.json());
    const mentionedUserIds = await extractMentions(body.body);

    const comment = await prisma.comment.create({
      data: {
        projectId: params.id,
        authorId: user.id,
        body: body.body,
        mentionedUserIds,
      },
      include: { author: { select: authorSelect } },
    });

    const recipients = mentionedUserIds.filter((id) => id !== user.id);
    if (recipients.length) {
      const p = await prisma.project.findUnique({
        where: { id: params.id },
        select: { id: true, draftNumber: true, name: true },
      });
      const label = p?.draftNumber ? `${p.draftNumber}D` : (p?.name ?? "draft");
      void emitNotifications({
        type: "COMMENT_MENTION",
        userIds: recipients,
        title: `${user.name} сизни лойиҳа ${label} да эслади · ${user.name} mentioned you on draft ${label}`,
        body: body.body.slice(0, 160),
        projectId: params.id,
        commentId: comment.id,
      });
    }

    return created(comment);
  },
);
