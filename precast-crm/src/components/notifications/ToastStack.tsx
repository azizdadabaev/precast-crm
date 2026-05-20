"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToastStore } from "@/store/toasts";
import { targetUrl } from "./notification-meta";
import { NotificationToast } from "./NotificationToast";

/** How long each toast stays on screen before it auto-dismisses. */
const AUTO_DISMISS_MS = 6000;

interface ToastStackProps {
  /** Called when the user clicks a toast body (not the X). Optimistic
   *  in the caller; the wrapper component owns the SSE hook so we
   *  don't open a second EventSource by re-calling useNotifications. */
  onMarkRead: (id: string) => void | Promise<void>;
}

/**
 * Fixed bottom-right container that owns the visible toast queue.
 * Renders nothing while the queue is empty so it doesn't intercept
 * any pointer events on an idle page.
 *
 * Hovering ANY toast pauses every active auto-dismiss timer — this
 * lets the user actually read the stack when several arrive at once.
 */
export function ToastStack({ onMarkRead }: ToastStackProps) {
  const active = useToastStore((s) => s.active);
  const dismiss = useToastStore((s) => s.dismiss);
  const router = useRouter();

  // One timer per visible toast id. We rebuild this set whenever the
  // active queue changes, and tear timers down on unmount.
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    // Clear any stale timers for ids that left the queue.
    for (const [id, t] of timers.current) {
      if (!active.some((n) => n.id === id)) {
        clearTimeout(t);
        timers.current.delete(id);
      }
    }
    if (paused) return;
    // Start a timer for every visible toast that doesn't already have one.
    for (const n of active) {
      if (timers.current.has(n.id)) continue;
      const t = setTimeout(() => {
        dismiss(n.id);
        timers.current.delete(n.id);
      }, AUTO_DISMISS_MS);
      timers.current.set(n.id, t);
    }
  }, [active, paused, dismiss]);

  // Tear down all timers on unmount.
  useEffect(() => {
    return () => {
      for (const t of timers.current.values()) clearTimeout(t);
      timers.current.clear();
    };
  }, []);

  if (active.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2 pointer-events-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {active.map((n) => (
        <div key={n.id} className="pointer-events-auto">
          <NotificationToast
            notification={n}
            onDismiss={() => dismiss(n.id)}
            onClick={() => {
              const url = targetUrl(n);
              // Mark read regardless of whether there's a URL — the
              // user has consciously interacted with this toast.
              void onMarkRead(n.id);
              dismiss(n.id);
              if (url) router.push(url);
            }}
          />
        </div>
      ))}
    </div>
  );
}
