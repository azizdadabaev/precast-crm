"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import type { NotificationItem } from "@/hooks/useNotifications";
import { TYPE_META, relativeTime } from "./notification-meta";

interface NotificationToastProps {
  notification: NotificationItem;
  onDismiss: () => void;
  onClick: () => void;
}

/**
 * Single bottom-right toast card. Slides in from the right on mount
 * and animates out on dismiss. Placement is delegated to ToastStack;
 * this component only handles its own enter/exit transition.
 *
 * Click anywhere on the body → navigate + mark read (`onClick`).
 * Click the corner × → dismiss only (`onDismiss`), keeping the
 * notification unread in the bell.
 */
export function NotificationToast({
  notification: n,
  onDismiss,
  onClick,
}: NotificationToastProps) {
  // Two-phase mount so the initial frame paints with `translate-x-full`
  // and the next frame transitions to `translate-x-0`. Without this
  // delay the browser collapses both frames into the final state and
  // the slide-in is invisible.
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const lang = useLang();
  const uzOnly = lang === "uz";

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Wrap dismiss/click so we play the slide-out animation before the
  // parent removes us from the queue. 300ms matches `duration-300`.
  function handleDismiss() {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onDismiss, 300);
  }

  function handleClick() {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onClick, 300);
  }

  const meta = TYPE_META[n.type] ?? TYPE_META.NEW_COMMENT;
  const Icon = meta.icon;
  const visible = entered && !leaving;

  return (
    <div
      role="alert"
      onClick={handleClick}
      className={cn(
        "relative w-80 rounded-xl border border-border bg-card p-3.5",
        "shadow-2xl shadow-black/20 dark:shadow-black/40",
        "cursor-pointer select-none",
        "transition-all duration-300 ease-out",
        visible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0",
      )}
    >
      <button
        type="button"
        aria-label={uzOnly ? "Ёпиш" : "Dismiss"}
        onClick={(e) => {
          e.stopPropagation();
          handleDismiss();
        }}
        className="absolute top-2 right-2 h-6 w-6 inline-flex items-center justify-center rounded-md text-text-tertiary hover:text-foreground hover:bg-accent transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "h-7 w-7 shrink-0 rounded-md grid place-items-center",
            meta.bg,
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", meta.color)} />
        </div>
        <div className="flex-1 min-w-0 pr-6">
          <div className="text-sm font-semibold text-foreground line-clamp-2">
            {n.title}
          </div>
          {n.body && (
            <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {n.body}
            </div>
          )}
          <div className="text-[10px] text-text-tertiary mt-1">
            {relativeTime(n.createdAt, uzOnly)}
          </div>
        </div>
      </div>
    </div>
  );
}
