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
 * Plus inline math expressions: type `4*0.58` and on blur (or
 * Enter) it collapses to `2.32`. Supports `+ - * /`, parentheses,
 * unary minus, and comma-as-decimal. The expression is *never*
 * stored — only the evaluated number — so the row model stays
 * pure-numeric. See `tryParseExpression` for the parser.
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
      // `step` is kept in the API for back-compat with existing callers
      // but the new type="text" input ignores it — number-spinner UA
      // affordances are gone anyway since the table has its own round
      // arrow buttons. Lint silenced via void below.
      step: _step = "0.01",
      min,
      max,
      className,
      placeholder,
      title,
      integer = false,
    },
    ref,
  ) {
    void _step;
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

    /** Common commit path used by blur and Enter. Parses whatever's
     *  in `next`; on success, emits onChange + snaps the display to
     *  the formatted result; on failure, restores the canonical
     *  display from `value` (or the default if blanked). */
    function commit(next: string) {
      focused.current = false;
      if (next === "" || next === "-" || next === ".") {
        const fallback = defaultValue ?? 0;
        const clamped = applyConstraints(fallback, { integer, min, max });
        onChange(clamped);
        setDisplay(format(clamped, showZeroAsEmpty));
        return;
      }
      const parsed = tryParseExpression(next);
      if (parsed === null) {
        // Invalid expression — restore the last-known-good value.
        setDisplay(format(value, showZeroAsEmpty));
        return;
      }
      const clamped = applyConstraints(parsed, { integer, min, max });
      onChange(clamped);
      // Re-format from the canonical numeric value so trailing junk
      // like "5." or "4*0.58" normalizes to its computed result.
      setDisplay(format(clamped, showZeroAsEmpty));
    }

    return (
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className={className}
        placeholder={placeholder}
        title={title ?? "Inline math: try 4*0.58 or 1+1.5"}
        value={display}
        onFocus={(e) => {
          focused.current = true;
          // Select-all when the field is at its default zero — typing
          // the next character replaces it cleanly. No-op if already
          // empty (the showZeroAsEmpty case).
          if (display === "0" || display === "0.00" || /^0+([.,]0+)?$/.test(display)) {
            e.target.select();
          }
        }}
        onKeyDown={(e) => {
          // Enter commits like blur. The blur handler then fires on
          // the focus loss; both call `commit` with the same string
          // so the result is idempotent.
          if (e.key === "Enter") {
            e.preventDefault();
            commit(display);
            e.currentTarget.blur();
          }
        }}
        onChange={(e) => {
          let next = e.target.value;
          // Belt-and-braces: strip leading zeros that survive paste
          // (e.g. "02" or "07.5"). Keep "0.x" untouched and don't
          // touch strings that look like expressions (operators
          // present) — leading zeros there are usually meaningful.
          if (
            !/[+\-*/(),]/.test(next.slice(1)) && // no operators after pos 0
            next.length > 1 &&
            next.startsWith("0") &&
            !next.startsWith("0.") &&
            !next.startsWith("0,")
          ) {
            next = next.replace(/^0+/, "") || "0";
          }
          setDisplay(next);

          // While typing, only propagate "simple" inputs — a plain
          // number with no operators. Math expressions wait for blur
          // / Enter so the row doesn't churn through nonsense
          // intermediate states like "4*" → 4.
          if (next === "" || next === "-" || next === ".") return;
          if (hasMathOperator(next)) return;
          const parsed = tryParseExpression(next);
          if (parsed === null) return;
          const clamped = applyConstraints(parsed, { integer, min, max });
          onChange(clamped);
        }}
        onBlur={() => commit(display)}
        min={min}
        max={max}
      />
    );
  },
);

function format(n: number, showZeroAsEmpty: boolean): string {
  if (showZeroAsEmpty && n === 0) return "";
  if (!Number.isFinite(n)) return "";
  return String(n);
}

/**
 * True iff the string contains a math operator OTHER than a
 * leading sign — i.e. anything that means "this is an expression,
 * defer commit until blur/Enter." We deliberately don't count a
 * single leading `-` as a math operator because the user is
 * probably typing a negative number.
 */
function hasMathOperator(s: string): boolean {
  return /[*/()]/.test(s) || /[\d.,]\s*[+\-]/.test(s);
}

function applyConstraints(
  n: number,
  opts: { integer: boolean; min?: string; max?: string },
): number {
  let v = opts.integer ? Math.floor(n) : n;
  if (opts.min !== undefined) {
    const lo = Number(opts.min);
    if (Number.isFinite(lo) && v < lo) v = lo;
  }
  if (opts.max !== undefined) {
    const hi = Number(opts.max);
    if (Number.isFinite(hi) && v > hi) v = hi;
  }
  return v;
}

/**
 * Tiny safe expression evaluator. Recursive-descent parser for the
 * usual four operators + parentheses + unary signs. Comma is
 * accepted as a decimal separator (Uzbek/Russian locale). No
 * identifiers, no function calls, no eval() — the worst an input
 * can do is return NaN/Infinity, which we reject.
 *
 * Grammar:
 *   expression := term (('+' | '-') term)*
 *   term       := factor (('*' | '/') factor)*
 *   factor     := ('+' | '-') factor | '(' expression ')' | NUMBER
 *   NUMBER     := /\d+(\.\d*)? | \.\d+/
 *
 * Returns the computed number, or null if the input doesn't parse
 * to a finite number.
 */
export function tryParseExpression(raw: string): number | null {
  // Normalize: strip whitespace, comma → dot for the parser.
  const src = raw.replace(/\s+/g, "").replace(/,/g, ".");
  if (src === "") return null;

  let pos = 0;
  const peek = () => src[pos];
  const eat = (c: string) => {
    if (src[pos] === c) {
      pos++;
      return true;
    }
    return false;
  };

  function parseExpression(): number {
    let val = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = src[pos++];
      const rhs = parseTerm();
      val = op === "+" ? val + rhs : val - rhs;
    }
    return val;
  }

  function parseTerm(): number {
    let val = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = src[pos++];
      const rhs = parseFactor();
      val = op === "*" ? val * rhs : val / rhs;
    }
    return val;
  }

  function parseFactor(): number {
    if (eat("+")) return parseFactor();
    if (eat("-")) return -parseFactor();
    if (eat("(")) {
      const v = parseExpression();
      if (!eat(")")) throw new Error("missing )");
      return v;
    }
    const start = pos;
    while (pos < src.length && /[\d.]/.test(src[pos])) pos++;
    if (start === pos) throw new Error("expected number");
    const slice = src.slice(start, pos);
    // Reject ambiguous numbers like "1.2.3"
    if ((slice.match(/\./g) ?? []).length > 1) throw new Error("invalid number");
    const n = parseFloat(slice);
    if (!Number.isFinite(n)) throw new Error("invalid number");
    return n;
  }

  try {
    const result = parseExpression();
    if (pos < src.length) return null; // trailing junk
    if (!Number.isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}
