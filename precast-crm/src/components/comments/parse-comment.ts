export type CommentToken =
  | { type: "text"; value: string }
  | { type: "mention"; value: string } // includes the leading "@"
  | { type: "link"; value: string }; // the full URL

// Trailing punctuation chars we strip from the end of a matched URL so that
// e.g. "see (https://x.com)." doesn't swallow the closing paren/period.
const TRAILING_PUNCT = /[).,!?]+$/;

export function parseCommentTokens(body: string): CommentToken[] {
  if (!body) return [];

  const tokens: CommentToken[] = [];

  // Combined regex: group 1 = url, group 2 = @email, group 3 = @username
  const re =
    /(https?:\/\/\S+)|@([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})|@([\w.+-]+)/g;

  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(body)) !== null) {
    // Push any text before this match
    if (m.index > last) {
      tokens.push({ type: "text", value: body.slice(last, m.index) });
    }

    if (m[1] !== undefined) {
      // URL match — strip trailing punctuation and push it back as text
      let url = m[1];
      const trailMatch = TRAILING_PUNCT.exec(url);
      let trail = "";
      if (trailMatch) {
        trail = trailMatch[0];
        url = url.slice(0, url.length - trail.length);
      }
      tokens.push({ type: "link", value: url });
      if (trail) {
        tokens.push({ type: "text", value: trail });
      }
    } else {
      // Mention: reconstruct with leading "@"
      const handle = m[2] ?? m[3];
      tokens.push({ type: "mention", value: `@${handle}` });
    }

    last = m.index + m[0].length;
  }

  if (last < body.length) {
    tokens.push({ type: "text", value: body.slice(last) });
  }

  return tokens;
}
