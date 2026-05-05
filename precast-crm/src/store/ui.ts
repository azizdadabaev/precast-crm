import { create } from "zustand";

interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  toast: { message: string; type: "info" | "success" | "error" } | null;
  setToast: (t: UIState["toast"]) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toast: null,
  setToast: (toast) => {
    set({ toast });
    if (toast) setTimeout(() => set({ toast: null }), 3000);
  },
}));
