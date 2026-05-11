import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Display-language preference.
 *
 * `bilingual` (default) — every label renders as "Узбекча · English".
 *                          Operator can read in either tongue.
 * `uz`                   — Узбекча only. The English half of bilingual
 *                          pairs is hidden, and English-only strings
 *                          (button labels, helper text) are swapped
 *                          for their Cyrillic equivalents via useT.
 *
 * Persisted to localStorage so the choice survives refresh + nav.
 * Source of truth for the UI; the Settings page label, /api shapes,
 * and dataset values stay in English regardless.
 */
export type Lang = "bilingual" | "uz";

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
}

export const useLanguageStore = create<LangState>()(
  persist(
    (set, get) => ({
      lang: "bilingual",
      setLang: (lang) => set({ lang }),
      toggle: () =>
        set({ lang: get().lang === "uz" ? "bilingual" : "uz" }),
    }),
    { name: "precast.language" },
  ),
);
