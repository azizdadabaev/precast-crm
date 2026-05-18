"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
 * Initial fetch on mount, then SSE for live updates. EventSource
 * auto-reconnects on drop. Last-Event-ID header is sent by the
 * browser automatically — server replays missed events.
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  // 1. Initial fetch (gives us history without waiting for SSE).
  useEffect(() => {
    let alive = true;
    fetch("/api/notifications", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j?.ok) return;
        setNotifications(j.data.items ?? []);
        setUnreadCount(j.data.unreadCount ?? 0);
      })
      .catch(() => { /* ignore — SSE will catch up */ });
    return () => { alive = false; };
  }, []);

  // 2. SSE live stream.
  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    const es = new EventSource("/api/notifications/stream", { withCredentials: true });
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      try {
        const n = JSON.parse(ev.data) as NotificationItem;
        setNotifications((prev) => {
          if (prev.some((p) => p.id === n.id)) return prev;
          return [n, ...prev].slice(0, 100);
        });
        if (!n.readAt) {
          setUnreadCount((c) => c + 1);
          playNotificationSound();
        }
      } catch { /* ignore malformed frame */ }
    };

    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, []);

  const markAllRead = useCallback(async () => {
    setUnreadCount(0);
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: now })),
    );
    try {
      await fetch("/api/notifications/read-all", {
        method: "POST",
        credentials: "include",
      });
    } catch { /* optimistic — ignore */ }
  }, []);

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) => {
      const next = prev.map((n) =>
        n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n,
      );
      return next;
    });
    setUnreadCount((c) => {
      const target = notifications.find((n) => n.id === id);
      return target && !target.readAt ? Math.max(0, c - 1) : c;
    });
    try {
      await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        credentials: "include",
      });
    } catch { /* optimistic — ignore */ }
  }, [notifications]);

  return { notifications, unreadCount, connected, markAllRead, markRead };
}
