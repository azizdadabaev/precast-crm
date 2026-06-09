// "Typing…" presence while the agent prepares an AUTO reply, so the customer
// sees the chat is being answered instead of a silent gap. Telegram's typing
// chat action expires after ~5s, so we send it immediately and re-send on a
// heartbeat until the work finishes (sending the reply also clears it). Gated to
// AUTO mode by the caller — in shadow/suggest no auto-reply goes out, so a typing
// hint would mislead. Entirely best-effort (sendBusinessTyping swallows errors):
// it must never delay or break the real reply.

const HEARTBEAT_MS = 4500; // just under Telegram's ~5s expiry

export interface TypingHandle {
  stop: () => void;
}

/** Start a typing heartbeat for a conversation; call stop() in a finally. */
export function startTyping(conversationId: string): TypingHandle {
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    void import('@/lib/inbox-send').then((m) => {
      if (!stopped) void m.sendBusinessTyping(conversationId);
    });
  };
  tick(); // show it immediately
  const interval = setInterval(tick, HEARTBEAT_MS);
  return {
    stop: () => {
      stopped = true;
      clearInterval(interval);
    },
  };
}
