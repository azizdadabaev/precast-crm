"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  ShoppingCart,
  RefreshCw,
  Camera,
  Banknote,
  CheckCircle,
  XCircle,
  AtSign,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { useNotifications, type NotificationItem } from "@/hooks/useNotifications";

const TYPE_META: Record<
  string,
  { icon: LucideIcon; color: string; bg: string }
> = {
  ORDER_PLACED:           { icon: ShoppingCart,   color: "text-blue-600",    bg: "bg-blue-50 dark:bg-blue-950/40" },
  ORDER_STATUS_CHANGED:   { icon: RefreshCw,      color: "text-indigo-600",  bg: "bg-indigo-50 dark:bg-indigo-950/40" },
  DELIVERY_PROOF_UPLOADED:{ icon: Camera,         color: "text-teal-600",    bg: "bg-teal-50 dark:bg-teal-950/40" },
  PAYMENT_RECORDED:       { icon: Banknote,       color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-950/40" },
  PAYMENT_CONFIRMED:      { icon: CheckCircle,    color: "text-green-600",   bg: "bg-green-50 dark:bg-green-950/40" },
  PAYMENT_REJECTED:       { icon: XCircle,        color: "text-red-600",     bg: "bg-red-50 dark:bg-red-950/40" },
  COMMENT_MENTION:        { icon: AtSign,         color: "text-purple-600",  bg: "bg-purple-50 dark:bg-purple-950/40" },
  NEW_COMMENT:            { icon: MessageSquare,  color: "text-gray-600",    bg: "bg-gray-50 dark:bg-gray-900/40" },
};

function relativeTime(iso: string, uzOnly: boolean): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return uzOnly ? "ҳозир" : "now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} ${uzOnly ? "дақ" : "min"}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${uzOnly ? "соат" : "h"}`;
  const d = Math.floor(hr / 24);
  return `${d} ${uzOnly ? "кун" : "d"}`;
}

function targetUrl(n: NotificationItem): string | null {
  if (n.orderId) return `/orders/${n.orderId}`;
  if (n.paymentId) return `/payments`;
  if (n.projectId) return `/projects/${n.projectId}`;
  return null;
}

export function NotificationBell() {
  const { notifications, unreadCount, connected, markAllRead, markRead } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const lang = useLang();
  const uzOnly = lang === "uz";

  // Click-outside closes the panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

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
