"use client";

import {
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
import type { NotificationItem } from "@/hooks/useNotifications";

/**
 * Single source of truth for the icon/color/background applied to each
 * notification type. Used by both the dropdown bell and the in-app
 * toast so the two surfaces stay visually consistent.
 */
export const TYPE_META: Record<
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

/**
 * Maps a notification to its in-app target route. Returns `null` when
 * the notification has no associated entity (kept here so both Bell
 * and Toast share the same routing semantics).
 */
export function targetUrl(n: NotificationItem): string | null {
  if (n.orderId) return `/orders/${n.orderId}`;
  if (n.paymentId) return `/payments`;
  if (n.projectId) return `/projects/${n.projectId}`;
  return null;
}

/**
 * Short relative-time label ("now", "5 min", "2 h", "3 d"). Bilingual
 * — Uzbek-only when `uzOnly` is true, otherwise English short forms.
 */
export function relativeTime(iso: string, uzOnly: boolean): string {
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
