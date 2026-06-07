// Pre-LLM inbound text screen (spec §6.4 / §7). Cheap, deterministic checks that
// run BEFORE any paid model call: normalize the text, cap its length, and flag
// prompt-injection / lure attempts so the agent can back off or escalate. The
// ML injection classifier is a separate (later) layer; the bot has no
// web-browsing tool, so a flagged link is informational, not auto-suspicious.

export interface ScreenResult {
  normalized: string;
  flags: { tooLong: boolean; injection: boolean; link: boolean };
  verdict: 'ok' | 'suspicious';
}

const MAX_LEN = 2000;

// Injection / "you are now a different bot" lures across en / uz-latin / ru.
const INJECTION_RES: readonly RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)/i,
  /disregard\s+(the\s+)?(previous|above|instructions?)/i,
  /forget\s+(everything|all|previous)/i,
  /you\s+are\s+now\b/i,
  /system\s+prompt/i,
  /\boldingi\b.{0,80}\bko.?rsatma/i, // uz-latin: "(forget) previous ... instruction" (bounded span)
  /забудь\s+(все|всё|предыдущ\w*)/i, // ru: forget all/previous
  /игнорируй\s+(все|всё|предыдущ\w*)/i, // ru: ignore all/previous
  /ты\s+теперь\b/i, // ru: you are now
  /систем\w*\s+промпт/i, // ru: system prompt
];

const URL_RE = /(https?:\/\/\S+|\bwww\.\S+|\bt\.me\/\S+)/i;

// Codepoint-based normalize — avoids any literal invisible chars in source.
// Drops zero-width chars + BOM and non-whitespace control chars, keeping
// tab/LF/CR so the whitespace-collapse pass can fold them into single spaces.
function normalize(raw: string): string {
  let out = '';
  for (const ch of raw) {
    const c = ch.codePointAt(0)!;
    if (c === 0x200b || c === 0x200c || c === 0x200d || c === 0xfeff) continue; // zero-width + BOM
    if (c === 0x7f) continue; // DEL
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) continue; // control (keep tab/LF/CR)
    out += ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function screenInbound(raw: string): ScreenResult {
  let normalized = normalize(raw);
  const tooLong = normalized.length > MAX_LEN;
  if (tooLong) normalized = normalized.slice(0, MAX_LEN);

  const injection = INJECTION_RES.some((re) => re.test(normalized));
  const link = URL_RE.test(normalized);

  return {
    normalized,
    flags: { tooLong, injection, link },
    verdict: injection ? 'suspicious' : 'ok',
  };
}
