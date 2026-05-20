"use client";

/**
 * Thin wrapper around the Web Notifications API for OS-level banners
 * (Windows action center, macOS notification center). Used when the
 * tab is backgrounded so the user gets a Slack/Discord-style alert.
 *
 * Safe to import on the server: every entry point guards `window` /
 * `Notification` so it no-ops in SSR.
 */

export type NotificationPermission =
  | "default"
  | "granted"
  | "denied"
  | "unsupported";

export function getNotificationPermission(): NotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission as NotificationPermission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  if (
    Notification.permission === "granted" ||
    Notification.permission === "denied"
  ) {
    return Notification.permission as NotificationPermission;
  }
  const result = await Notification.requestPermission();
  return result as NotificationPermission;
}

interface FireNotificationOpts {
  title: string;
  body?: string;
  /** Dedup key — a later notification with the same `tag` replaces the prior one. */
  tag?: string;
  /** Where to send the user when the OS banner is clicked. */
  url?: string;
}

/**
 * Fire a browser/OS notification. Returns the `Notification` instance
 * (for callers that want to call `.close()` early) or `null` if the
 * API is unavailable, permission isn't granted, or construction fails.
 */
export function fireBrowserNotification(
  opts: FireNotificationOpts,
): Notification | null {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return null;
  }
  if (Notification.permission !== "granted") return null;
  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag,
      // These files may not exist in /public — browsers gracefully
      // fall back to the page favicon when the URL 404s.
      icon: "/icon-192.png",
      badge: "/icon-96.png",
      requireInteraction: false,
      silent: false,
    });
    if (opts.url) {
      const url = opts.url;
      n.onclick = () => {
        window.focus();
        window.location.href = url;
        n.close();
      };
    }
    // Most browsers honor an explicit close after a few seconds; on
    // Windows the action-center retains it regardless, which is fine.
    setTimeout(() => {
      try {
        n.close();
      } catch {
        /* already closed */
      }
    }, 8000);
    return n;
  } catch {
    return null;
  }
}
