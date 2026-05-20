"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { useNotifications, type NotificationItem } from "@/hooks/useNotifications";
import {
  TYPE_META,
  targetUrl,
  relativeTime,
} from "@/components/notifications/notification-meta";
import {
  getNotificationPermission,
  requestNotificationPermission,
  type NotificationPermission,
} from "@/lib/web-notifications";

export function NotificationBell() {
  const { notifications, unreadCount, connected, markAllRead, markRead } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const lang = useLang();
  const uzOnly = lang === "uz";

  // Track Web Notifications permission so we can offer the CTA only
  // while the user hasn't decided yet ("default"). Granted/denied both
  // hide the row — no nagging, no re-prompt loops.
  const [permission, setPermission] =
    useState<NotificationPermission>("unsupported");

  useEffect(() => {
    setPermission(getNotificationPermission());
  }, []);

  // Click-outside closes the panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function handleEnableNotifications() {
    const result = await requestNotificationPermission();
    setPermission(result);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label={uzOnly ? "Хабарномалар" : "Notifications"}
        title={uzOnly ? "Хабарномалар" : "Notifications"}
        onClick={() => setOpen((v) => !v)}
        className="relative h-8 w-8 inline-flex items-center justify-center rounded-md border border-border bg-background text-text-tertiary hover:text-foreground hover:bg-accent transition-colors"
      >
        <Bell className="h-3.5 w-3.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 rounded-md border border-border bg-card shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <div className="text-xs font-semibold">
              {uzOnly ? "Хабарномалар" : "Хабарномалар · Notifications"}
            </div>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="text-[11px] text-primary hover:underline disabled:text-text-tertiary disabled:no-underline"
            >
              {uzOnly ? "Барчасини ўқидим" : "Барчасини ўқидим · Mark all read"}
            </button>
          </div>

          {/* Optional CTA: ask for OS-level notification permission. Only
              shows while the choice is still "default" — once granted or
              denied we hide the row to avoid being annoying. */}
          {permission === "default" && (
            <button
              type="button"
              onClick={handleEnableNotifications}
              className="w-full flex items-center gap-2 px-3 py-2 border-b border-border bg-primary/5 hover:bg-primary/10 transition-colors text-left"
            >
              <BellRing className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-[11px] text-primary">
                {uzOnly
                  ? "Браузер хабарномаларини ёқиш"
                  : "Браузер хабарномаларини ёқиш · Enable browser notifications"}
              </span>
            </button>
          )}

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-text-tertiary">
                {uzOnly ? "Хабарномалар йўқ" : "No notifications"}
              </div>
            ) : (
              notifications.map((n) => (
                <NotificationRow
                  key={n.id}
                  n={n}
                  uzOnly={uzOnly}
                  onClick={() => {
                    markRead(n.id);
                    setOpen(false);
                  }}
                />
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-3 py-1.5 border-t border-border bg-muted/40">
            <span className="text-[10px] text-text-tertiary">
              {connected
                ? (uzOnly ? "● реал вақт" : "● live")
                : (uzOnly ? "○ узилди" : "○ disconnected")}
            </span>
            <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-green-500" : "bg-gray-400")} />
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  n,
  uzOnly,
  onClick,
}: {
  n: NotificationItem;
  uzOnly: boolean;
  onClick: () => void;
}) {
  const meta = TYPE_META[n.type] ?? TYPE_META.NEW_COMMENT;
  const Icon = meta.icon;
  const url = targetUrl(n);
  const unread = !n.readAt;

  const inner = (
    <>
      <div className={cn("h-7 w-7 shrink-0 rounded-md grid place-items-center", meta.bg)}>
        <Icon className={cn("h-3.5 w-3.5", meta.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-1.5">
          <div className="text-xs font-medium text-foreground line-clamp-2 flex-1">
            {n.title}
          </div>
          {unread && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
        </div>
        {n.body && (
          <div className="text-[11px] text-text-tertiary line-clamp-2 mt-0.5">
            {n.body}
          </div>
        )}
        <div className="text-[10px] text-text-tertiary mt-1">
          {relativeTime(n.createdAt, uzOnly)}
        </div>
      </div>
    </>
  );

  const className = cn(
    "flex items-start gap-2.5 px-3 py-2.5 border-b border-border last:border-b-0 hover:bg-accent transition-colors cursor-pointer",
    unread && "bg-primary/5",
  );

  // Industry-default: navigate in the current tab. Cmd/Ctrl+Click
  // automatically opens in a new tab (browser-native behavior on
  // <Link>, no extra code). The lost-work concern is addressed by
  // per-user/per-thread draft autosave in CommentThread.
  return url ? (
    <Link href={url} onClick={onClick} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className} onClick={onClick}>
      {inner}
    </div>
  );
}
