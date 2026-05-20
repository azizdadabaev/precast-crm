"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  useNotifications,
  subscribeToNewNotifications,
} from "@/hooks/useNotifications";
import { useToastStore } from "@/store/toasts";
import { fireBrowserNotification } from "@/lib/web-notifications";
import { targetUrl } from "./notification-meta";

/**
 * Bridges the SSE stream to the two notification surfaces:
 *   1. In-app toasts (ToastStack) — shown when the tab is visible
 *   2. OS-level Web Notifications — shown when the tab is hidden
 *
 * Exactly one of the two fires per event. Both are suppressed when
 * the user is already on the notification's target page (no point
 * alerting them about something they're looking at).
 *
 * Subscribes via `subscribeToNewNotifications` rather than diffing
 * the `notifications` array on every render — the broadcast only
 * fires for genuinely new SSE messages, never on the initial fetch
 * backfill, so there's no "spam on page load" problem to guard
 * against.
 */
export function useNotificationSubscription() {
  const { markRead } = useNotifications();
  const show = useToastStore((s) => s.show);
  const pathname = usePathname();

  useEffect(() => {
    const unsub = subscribeToNewNotifications((n) => {
      // Don't disturb the user about something they're already viewing.
      const url = targetUrl(n);
      if (
        url &&
        typeof window !== "undefined" &&
        window.location.pathname === url
      ) {
        return;
      }

      if (typeof document !== "undefined" && document.hidden) {
        // Tab in background → OS-level banner via Web Notifications API.
        fireBrowserNotification({
          title: n.title,
          body: n.body ?? undefined,
          tag: n.id,
          url: url ?? undefined,
        });
      } else {
        // Tab visible → in-app slide-in toast.
        show(n);
      }
    });
    return unsub;
    // Reading window.location.pathname inside the listener avoids
    // re-subscribing on every client-side route change (which would
    // otherwise miss the brief window between subscriptions).
  }, [show, pathname]);

  return { markRead };
}
