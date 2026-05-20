"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { playNotificationSound } from "@/lib/notification-sound";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  orderId: string | null;
  paymentId: string | null;
  projectId: string | null;
  commentId: string | null;
  createdAt: string;
  readAt: string | null;
}

/**
 * Module-level singleton store for notifications.
 *
 * One SSE connection per browser tab, regardless of how many
 * components mount `useNotifications()`. Without this, the Bell +
 * the toast Listener each opened their own EventSource — duplicate
 * traffic AND duplicate sound on every event.
 *
 * The hook below uses `useSyncExternalStore` so React stays
 * subscribed to changes here without us juggling refs.
 *
 * `onNotification` is a public broadcast point — used by the toast /
 * Web-Notifications subscription to react to brand-new items
 * (not initial-fetch backfill).
 */
type State = {
  notifications: NotificationItem[];
  unreadCount: number;
  connected: boolean;
};

type Listener = (s: State) => void;
type NotificationListener = (n: NotificationItem) => void;

let state: State = {
  notifications: [],
  unreadCount: 0,
  connected: false,
};

const stateListeners = new Set<Listener>();
const notificationListeners = new Set<NotificationListener>();
let initialized = false;
let es: EventSource | null = null;

function setState(next: Partial<State>) {
  state = { ...state, ...next };
  stateListeners.forEach((l) => l(state));
}

function subscribeState(l: Listener): () => void {
  stateListeners.add(l);
  return () => stateListeners.delete(l);
}

/**
 * Open the SSE connection + run the initial fetch. Idempotent —
 * additional calls are no-ops once the connection is live.
 */
function ensureInitialized() {
  if (initialized) return;
  if (typeof window === "undefined" || typeof EventSource === "undefined") return;
  initialized = true;

  // 1. Initial REST fetch — populates history without waiting for SSE.
  fetch("/api/notifications", { credentials: "include" })
    .then((r) => r.json())
    .then((j) => {
      if (!j?.ok) return;
      setState({
        notifications: j.data.items ?? [],
        unreadCount: j.data.unreadCount ?? 0,
      });
    })
    .catch(() => {
      /* SSE will catch up */
    });

  // 2. SSE live stream. EventSource auto-reconnects on drop and the
  // browser sends Last-Event-ID automatically so the server replays
  // any missed events.
  es = new EventSource("/api/notifications/stream", { withCredentials: true });

  es.onopen = () => setState({ connected: true });
  es.onerror = () => setState({ connected: false });
  es.onmessage = (ev) => {
    try {
      const n = JSON.parse(ev.data) as NotificationItem;
      // Dedup against the existing list; if already present, ignore.
      if (state.notifications.some((p) => p.id === n.id)) return;
      setState({
        notifications: [n, ...state.notifications].slice(0, 100),
        unreadCount: n.readAt ? state.unreadCount : state.unreadCount + 1,
      });
      if (!n.readAt) {
        playNotificationSound();
        // Broadcast to toast / Web-Notifications subscribers.
        notificationListeners.forEach((l) => l(n));
      }
    } catch {
      /* ignore malformed frame */
    }
  };
}

/**
 * Subscribe to brand-new notifications (post-initial-fetch).
 * Used by the toast + Web-Notifications surfaces. Returns an
 * unsubscribe function.
 */
export function subscribeToNewNotifications(
  cb: NotificationListener,
): () => void {
  ensureInitialized();
  notificationListeners.add(cb);
  return () => {
    notificationListeners.delete(cb);
  };
}

async function markAllReadImpl() {
  const now = new Date().toISOString();
  setState({
    unreadCount: 0,
    notifications: state.notifications.map((n) =>
      n.readAt ? n : { ...n, readAt: now },
    ),
  });
  try {
    await fetch("/api/notifications/read-all", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    /* optimistic */
  }
}

async function markReadImpl(id: string) {
  const target = state.notifications.find((n) => n.id === id);
  const wasUnread = target && !target.readAt;
  setState({
    notifications: state.notifications.map((n) =>
      n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n,
    ),
    unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
  });
  try {
    await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      credentials: "include",
    });
  } catch {
    /* optimistic */
  }
}

function getSnapshot(): State {
  return state;
}

// SSR-safe snapshot — state is module-level and identical on every
// call. React's useSyncExternalStore demands a stable reference per
// render path; returning `state` directly is fine because it's only
// mutated via setState which creates a new object.
function getServerSnapshot(): State {
  return state;
}

export function useNotifications() {
  // Ensure the singleton is started before subscribing. Idempotent.
  useEffect(() => {
    ensureInitialized();
  }, []);

  const snap = useSyncExternalStore(subscribeState, getSnapshot, getServerSnapshot);

  const markAllRead = useCallback(() => markAllReadImpl(), []);
  const markRead = useCallback((id: string) => markReadImpl(id), []);

  return {
    notifications: snap.notifications,
    unreadCount: snap.unreadCount,
    connected: snap.connected,
    markAllRead,
    markRead,
  };
}
