"use client";

import * as React from "react";
import { useLanguageStore } from "@/store/language";

/**
 * Display-language helpers.
 *
 * Two scenarios in this codebase:
 *   1) Bilingual pairs — `"Калькулятор · Calculator"`. The English half
 *      is decorative + secondary; in UZ mode we hide it.
 *   2) English-only strings — button labels like "Save Project",
 *      placeholders, helper text. In UZ mode we want the Узбекча
 *      equivalent (`Сақлаш`, `Сақланг`…). `useT(uz, en)` picks one.
 *
 * Both helpers reach into useLanguageStore so any component subscribed
 * via Zustand re-renders on toggle without prop drilling.
 *
 * Keep the public surface tiny: <Bi/>, useLang, useT. If a third
 * mode (RU, EN-only) is ever needed, this is the spot to grow.
 */

export function useLang() {
  return useLanguageStore((s) => s.lang);
}

/**
 * Bilingual text pair. In `bilingual` mode renders `${uz} · ${en}`
 * with the English half styled as secondary text (matches the
 * existing header pattern). In `uz` mode renders only `uz`.
 *
 * Pass `enClassName` to override the English-half styling — useful
 * when embedding in a chip / pill where the parent already controls
 * color.
 */
export function Bi({
  uz,
  en,
  sep = " · ",
  enClassName = "text-muted-foreground font-normal",
}: {
  uz: React.ReactNode;
  en: React.ReactNode;
  sep?: string;
  enClassName?: string;
}) {
  // The CSS rule `html[data-lang="uz"] .lang-en { display:none }`
  // does the heavy lifting; the lang check here is a belt-and-suspenders
  // for SSR (the data-lang attr lives on <html> after rehydrate).
  return (
    <>
      {uz}
      <span className={`lang-en ${enClassName}`}>
        {sep}
        {en}
      </span>
    </>
  );
}

/**
 * Picks one of two strings based on the current language. Returns a
 * function so callers can use it repeatedly in a single component
 * without re-subscribing N times.
 *
 * Convention: `t(uz, en)` — Cyrillic first, English second. Mirrors
 * the order of every bilingual pair we already have in source.
 *
 *   const t = useT();
 *   <Button>{t("Сақлаш", "Save Project")}</Button>
 */
export function useT() {
  const lang = useLang();
  return React.useCallback(
    (uz: string, en: string) => (lang === "uz" ? uz : en),
    [lang],
  );
}
