export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isInboxUnlocked } from "@/lib/inbox-auth";
import { inboxBus, INBOX_EVENT } from "@/lib/inbox-bus";

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.isActive || !can(user, "inbox.access")) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!(await isInboxUnlocked())) {
    return new Response("Locked", { status: 403 });
  }

  let closed = false;
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(": connected\n\n"));

      const ping = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { cleanup(); }
      }, 30_000);

      const onEvent = (payload: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${payload}\n\n`)); } catch { cleanup(); }
      };
      inboxBus.on(INBOX_EVENT, onEvent);

      function cleanup() {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        inboxBus.off(INBOX_EVENT, onEvent);
        try { controller.close(); } catch { /* already closed */ }
      }
      _req.signal.addEventListener("abort", cleanup, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
