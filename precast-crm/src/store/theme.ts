import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Theme preference — `light` (default) or `dark`. Like the language
 * store, this mirrors to `<html data-theme="…">` so a parallel set of
 * CSS variables under `html[data-theme="dark"] { … }` takes over
 * without per-component plumbing.
 *
 * Persisted to localStorage. Phase 1 prototype for the dark-mode color
 * balance — same primary/destructive/success accents, only the
 * surface/text tokens change.
 */
export type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

function syncDom(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "light",
      setTheme: (theme) => {
        syncDom(theme);
        set({ theme });
      },
      toggle: () => {
        const next: Theme = get().theme === "dark" ? "light" : "dark";
        syncDom(next);
        set({ theme: next });
      },
    }),
    {
      name: "precast.theme",
      onRehydrateStorage: () => (state) => {
        if (state) syncDom(state.theme);
      },
    },
  ),
);
