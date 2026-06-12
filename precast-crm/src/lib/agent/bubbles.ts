// Split an auto-reply into 1–3 chat "bubbles" so the agent texts like a person
// (a few short messages with a typing pause between) instead of one wall of text.
// Also a markdown-strip safety net: the prompt bans bold/headers/bullets, but the
// model still occasionally emits them — Telegram/Instagram show raw "**", so we
// clean it here on the send path.

/** Strip the markdown the model shouldn't emit (bold/italic/headers/bullets/
 *  backticks), keeping the text. Conservative — only well-formed markers. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1') // **bold**
    .replace(/__(.+?)__/g, '$1') // __bold__
    .replace(/`([^`]+)`/g, '$1') // `code`
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, '') // # headers
        .replace(/^\s*[-*•]\s+/, '') // - / * / • bullets
        .replace(/^\s*\d+[.)]\s+/, ''), // 1. / 1) numbered
    )
    .join('\n');
}

const MAX_BUBBLES = 3;
const LONG_LINE = 140; // a single line longer than this may split once at a sentence end

/**
 * Split a reply into ≤3 bubbles. Lines (blank-line or single-newline separated)
 * become separate bubbles; overflow beyond 3 is merged back into the last. A
 * one-line reply stays one bubble unless it's long and has a clear sentence
 * break. Pure; always returns ≥1 non-empty bubble.
 */
export function splitIntoBubbles(text: string): string[] {
  const cleaned = stripMarkdown(text).trim();
  if (!cleaned) return [text.trim()].filter(Boolean);

  let parts = cleaned
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // One line but long with a sentence boundary → split once.
  if (parts.length === 1 && parts[0].length > LONG_LINE) {
    const m = parts[0].match(/^(.*?[.!?])\s+(\S.*)$/s);
    if (m) parts = [m[1].trim(), m[2].trim()];
  }

  if (parts.length <= MAX_BUBBLES) return parts;
  // Merge overflow into the last allowed bubble.
  const head = parts.slice(0, MAX_BUBBLES - 1);
  const tail = parts.slice(MAX_BUBBLES - 1).join(' ');
  return [...head, tail];
}

/** Human-ish pause before a follow-up bubble, scaled to its length, capped so the
 *  whole reply still lands quickly (speed converts better than realism). */
export function bubbleDelayMs(bubble: string): number {
  return Math.min(400 + bubble.length * 25, 2200);
}
