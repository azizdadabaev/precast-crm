"use client";

import { ToastStack } from "./ToastStack";
import { useNotificationSubscription } from "./useNotificationSubscription";

/**
 * Mount once at the app shell level. Owns the toast/OS-notification
 * subscription side-effects and renders the bottom-right toast stack.
 *
 * Kept as a small wrapper so the app shell layout (a server component)
 * can mount it without itself becoming client-rendered.
 */
export function NotificationListener() {
  const { markRead } = useNotificationSubscription();
  return <ToastStack onMarkRead={markRead} />;
}
