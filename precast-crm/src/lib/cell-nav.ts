import type * as React from "react";

/**
 * Excel-style keyboard navigation for the calculator grid.
 *
 * Every editable cell in `MultiRoomCalculator` is tagged with
 * `data-row="N" data-col="M"`. A single keydown listener on the
 * table reads those attributes off the focused element, computes
 * the target coordinates, and re-focuses the next cell.
 *
 * Behavior matrix:
 *
 *   ↑ / ↓  — always navigate rows (preventDefault).
 *            EXCEPTION: on a <select>, native ↑/↓ cycles options;
 *            we let that through so the operator can change Pattern
 *            or Rate via keyboard exactly like Excel's data validation
 *            dropdowns.
 *   ← / →  — text inputs: only navigate when cursor is at the edge
 *            of the value (preserves intra-cell cursor movement).
 *            Selects / checkboxes / buttons: always navigate.
 *
 * Read-only computed columns are skipped because they have no
 * `data-col` attribute and don't appear in the selector lookup.
 *
 * The next cell is auto-selected (Excel "type-to-overwrite") for
 * <input> elements that support it.
 */

const NAV_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

export function isCellNavKey(key: string): boolean {
  return NAV_KEYS.has(key);
}

function isTextInput(el: Element): el is HTMLInputElement {
  if (el.tagName !== "INPUT") return false;
  const t = (el as HTMLInputElement).type;
  return t === "text" || t === "search" || t === "url" || t === "tel" || t === "email" || t === "password";
}

function cursorAtStart(el: HTMLInputElement): boolean {
  // null selectionStart means the input doesn't support selection
  // (e.g. type=number on some browsers). Treat that as "at edge".
  if (el.selectionStart == null) return true;
  return el.selectionStart === 0 && el.selectionEnd === 0;
}

function cursorAtEnd(el: HTMLInputElement): boolean {
  if (el.selectionStart == null) return true;
  const len = el.value.length;
  return el.selectionStart === len && el.selectionEnd === len;
}

/**
 * Find the next editable cell in a direction, scanning the DOM for
 * `[data-row][data-col]` elements within the supplied root. Returns
 * the element or null if no candidate exists.
 *
 * For ↑/↓: same column, next/prev row.
 * For ←/→: same row, walks columns until it finds one that exists
 *          (handles conditional cells like RateCell which only
 *          renders when the row has a non-extras-only result).
 */
export function findNextCell(
  root: HTMLElement,
  fromRow: number,
  fromCol: number,
  direction: "up" | "down" | "left" | "right",
): HTMLElement | null {
  const select = (row: number, col: number) =>
    root.querySelector<HTMLElement>(
      `[data-cell-row="${row}"][data-cell-col="${col}"]`,
    );

  if (direction === "up") {
    if (fromRow <= 0) return null;
    // Same column, walk up rows until we find a row that has this
    // column present (rate cell can be absent on extras-only rows).
    for (let r = fromRow - 1; r >= 0; r--) {
      const el = select(r, fromCol);
      if (el) return el;
      // If the same column isn't present, fall back to the closest
      // editable cell on that row (Name is always present at col 0).
      const fallback = closestColOnRow(root, r, fromCol);
      if (fallback) return fallback;
    }
    return null;
  }

  if (direction === "down") {
    // Search next rows; rowCount is unbounded, but the DOM is finite.
    // Walk until we either find the same column or run out of rows.
    let r = fromRow + 1;
    while (true) {
      const el = select(r, fromCol);
      if (el) return el;
      const fallback = closestColOnRow(root, r, fromCol);
      if (fallback) return fallback;
      // Heuristic stop: if no cell at any column on this row, we're past the table.
      if (!root.querySelector(`[data-cell-row="${r}"]`)) return null;
      r++;
    }
  }

  if (direction === "left") {
    for (let c = fromCol - 1; c >= 0; c--) {
      const el = select(fromRow, c);
      if (el) return el;
    }
    return null;
  }

  // right
  // Scan a bounded range of columns; the calculator has < 20 editable cols.
  for (let c = fromCol + 1; c < 32; c++) {
    const el = select(fromRow, c);
    if (el) return el;
  }
  return null;
}

/** Closest cell on `row` at or below `preferredCol`, then walks back. */
function closestColOnRow(
  root: HTMLElement,
  row: number,
  preferredCol: number,
): HTMLElement | null {
  // Try the preferred col first (already done by caller, but safe).
  const preferred = root.querySelector<HTMLElement>(
    `[data-cell-row="${row}"][data-cell-col="${preferredCol}"]`,
  );
  if (preferred) return preferred;
  // Walk down from preferredCol-1 to 0, then up from preferredCol+1 to 31.
  for (let c = preferredCol - 1; c >= 0; c--) {
    const el = root.querySelector<HTMLElement>(
      `[data-cell-row="${row}"][data-cell-col="${c}"]`,
    );
    if (el) return el;
  }
  for (let c = preferredCol + 1; c < 32; c++) {
    const el = root.querySelector<HTMLElement>(
      `[data-cell-row="${row}"][data-cell-col="${c}"]`,
    );
    if (el) return el;
  }
  return null;
}

/**
 * Move focus to `next` and select its contents if it's a selectable
 * input. Selects scroll into view via `focus({ preventScroll: false })`
 * which is the browser default — important on the <lg sticky-columns
 * layout so off-screen cells slide into view.
 */
export function focusAndSelect(next: HTMLElement) {
  next.focus();
  if (isTextInput(next)) {
    // Defer to next microtask so the focus has settled — some browsers
    // wipe the selection on focus.
    queueMicrotask(() => {
      try {
        (next as HTMLInputElement).select();
      } catch {
        /* ignore — type=number sometimes throws */
      }
    });
  }
}

/**
 * Handle a keydown event on the calculator table. Returns true if
 * navigation was applied (and the event should be considered
 * consumed), false if the event should bubble normally.
 *
 * Selects (Pattern, Rate) keep native ↑/↓ for cycling options; only
 * ←/→ navigates from a select. Text inputs only navigate via ←/→
 * when the cursor is at the edge.
 */
export function handleCellNavKeyDown(
  e: KeyboardEvent | React.KeyboardEvent,
  root: HTMLElement,
): boolean {
  const key = e.key;
  if (!NAV_KEYS.has(key)) return false;

  const target = e.target as HTMLElement | null;
  if (!target) return false;
  const rowAttr = target.getAttribute("data-cell-row");
  const colAttr = target.getAttribute("data-cell-col");
  if (rowAttr == null || colAttr == null) return false;

  const fromRow = Number(rowAttr);
  const fromCol = Number(colAttr);
  if (!Number.isFinite(fromRow) || !Number.isFinite(fromCol)) return false;

  const tag = target.tagName;
  const isSelect = tag === "SELECT";

  // SELECT: ↑/↓ cycles options natively. ←/→ navigates cells.
  if (isSelect && (key === "ArrowUp" || key === "ArrowDown")) {
    return false;
  }

  // Text inputs: ←/→ only nav at cursor edges.
  if (isTextInput(target)) {
    if (key === "ArrowLeft" && !cursorAtStart(target as HTMLInputElement)) {
      return false;
    }
    if (key === "ArrowRight" && !cursorAtEnd(target as HTMLInputElement)) {
      return false;
    }
  }

  const dir =
    key === "ArrowUp"
      ? "up"
      : key === "ArrowDown"
      ? "down"
      : key === "ArrowLeft"
      ? "left"
      : "right";

  const next = findNextCell(root, fromRow, fromCol, dir);
  if (!next) return false;

  e.preventDefault();
  focusAndSelect(next);
  return true;
}

