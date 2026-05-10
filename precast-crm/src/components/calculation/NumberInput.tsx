"use client";

import { forwardRef, useEffect, useRef, useState } from "react";

/**
 * Calculator-grade number input with three behaviors the inline
 * `<input type="number">` doesn't give us out of the box:
 *
 *   1. Select-on-focus when the displayed value is "0" (or the
 *      empty-display equivalent of 0). Lets the operator click into
 *      a default-zero field and have the next keystroke replace it
 *      cleanly — no more "02" because the leading 0 stayed.
 *
 *   2. Leading-zero strip in onChange (defense in depth — paste
 *      from clipboard can deliver "02" without firing onFocus).
 *
 *   3. Blur-restores-default — clearing the field and tabbing out
 *      snaps the value back to 0 (or whatever `defaultValue` is) so
 *      the row never carries a NaN downstream.
 *
 * Renders as an uncontrolled string internally so we can show
 * exactly what the user typed (number-typed inputs auto-normalize
 * trailing dots etc.). The numeric `value` from the parent is the
 * source of truth on mount + when it changes externally.
 */

interface NumberInputProps {
  value: number;
  onChange: (n: number) => void;
  /**
   * What value to snap back to when the user blurs an empty field.
   * Defaults to 0; pass `null` to leave the field blank on blur
   * (matches the previous `value={row.innerLength || ""}` pattern).
   */
  defaultValue?: number | null;
  /**
   * Render "" instead of "0" when the numeric value is 0. Matches
   * the previous `|| ""` pattern for length/width that show
   * a placeholder. Select-on-focus still works — selecting an
   * empty input is a no-op.
   */
  showZeroAsEmpty?: boolean;
  step?: string;
  min?: string;
  max?: string;
  className?: string;
  placeholder?: string;
  title?: string;
  integer?: boolean;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput(
    {
      value,
      onChange,
      defaultValue = 0,
      showZeroAsEmpty = false,
      step = "0.01",
      min,
      max,
      className,
      placeholder,
      title,
      integer = false,
    },
    ref,
  ) {
    // Internal display string — what the input element actually
    // shows. Synced from `value` whenever the parent updates it.
    const [display, setDisplay] = useState(() => format(value, showZeroAsEmpty));
    const focused = useRef(false);

    useEffect(() => {
      // Don't fight the user while they're typing — only sync from
      // the prop when the field isn't focused.
      if (!focused.current) {
        setDisplay(format(value, showZeroAsEmpty));
      }
    }, [value, showZeroAsEmpty]);

    return (
      <input
        ref={ref}
        type="number"
        step={step}
        min={min}
        max={max}
        className={className}
        placeholder={placeholder}
        title={title}
        value={display}
        onFocus={(e) => {
          focused.current = true;
          // Select-all when the field is at its default zero — typing
          // the next character replaces it cleanly. No-op if already
          // empty (the showZeroAsEmpty case).
          if (display === "0" || display === "0.00" || /^0+(\.0+)?$/.test(display)) {
            e.target.select();
          }
        }}
        onChange={(e) => {
          let next = e.target.value;
          // Belt-and-braces: strip leading zeros that survive paste
          // (e.g. "02" or "07.5"). Keep "0.x" untouched.
          if (next.length > 1 && next.startsWith("0") && !next.startsWith("0.")) {
            next = next.replace(/^0+/, "") || "0";
          }
          setDisplay(next);

          if (next === "" || next === "-" || next === ".") {
            // User is mid-edit — don't propagate a NaN. Wait until
            // they either type a valid number or blur.
            return;
          }
          const parsed = Number(next);
          if (!Number.isFinite(parsed)) return;
          if (integer) {
            onChange(Math.max(0, Math.floor(parsed)));
          } else {
            onChange(parsed);
          }
        }}
        onBlur={() => {
          focused.current = false;
          if (display === "" || display === "-" || display === ".") {
            const fallback = defaultValue ?? 0;
            onChange(fallback);
            setDisplay(format(fallback, showZeroAsEmpty));
          } else {
            // Re-format from the canonical numeric value so trailing
            // junk like "5." normalizes to "5" / "0.00" etc.
            setDisplay(format(value, showZeroAsEmpty));
          }
        }}
      />
    );
  },
);

function format(n: number, showZeroAsEmpty: boolean): string {
  if (showZeroAsEmpty && n === 0) return "";
  if (!Number.isFinite(n)) return "";
  return String(n);
}
