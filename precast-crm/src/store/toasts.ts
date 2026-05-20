import { create } from "zustand";
import type { NotificationItem } from "@/hooks/useNotifications";

/** Hard cap on simultaneously-visible toasts. When a fourth arrives the
 *  oldest is shifted out of view (it remains in the bell). */
export const MAX_VISIBLE_TOASTS = 3;

interface ToastStore {
  /** Currently displayed toasts. Order: oldest → newest. */
  active: NotificationItem[];
  show: (n: NotificationItem) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  active: [],
  show: (n) =>
    set((state) => {
      // Dedup: if a toast with the same id is already showing, do nothing.
      if (state.active.some((t) => t.id === n.id)) return state;
      const next = [...state.active, n];
      // Cap visible: drop the oldest if we exceed the limit.
      while (next.length > MAX_VISIBLE_TOASTS) next.shift();
      return { active: next };
    }),
  dismiss: (id) =>
    set((state) => ({ active: state.active.filter((t) => t.id !== id) })),
}));
