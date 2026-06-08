import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { withInboxAccess } from "@/lib/inbox-auth";
import { sendBusinessReply } from "@/lib/inbox-send";

const Body = z.object({ text: z.string().trim().min(1).max(4000) });

export const POST = withInboxAccess<{ id: string }>(async (req: NextRequest, { params, user }) => {
  const { text } = Body.parse(await req.json());

  const res = await sendBusinessReply({ conversationId: params.id, text, userId: user.id });
  if (!res.ok) {
    if (res.reason === "NOT_FOUND") return fail("Суҳбат топилмади · Conversation not found", 404);
    if (res.reason === "NO_CONNECTION") return fail("Бизнес уланиш мавжуд эмас · No business connection for this chat", 400);
    return fail("Юборилмади · Send failed", 502, { message: res.message });
  }
  return ok(res.message);
});
