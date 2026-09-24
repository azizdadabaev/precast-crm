// Inbound burst coalescing + per-conversation serialization.
//
// Customers send thoughts as rapid message bursts ("Narxi qancha?" /
// "Sinovdan o'tganmi?" / "Tayyori bormi?"). Running the agent per message made
// it answer each one independently — and because earlier replies weren't in
// history yet, later runs RE-answered earlier questions (live bug: the starting
// price delivered 3×, the dims-ask 3×, in one minute). A human reads the whole
// burst, then replies once.
//
// Voice transcripts and floor-plan reads join the SAME buffer: they used to run
// the agent directly, in parallel with the text burst (live bug 0575D: a voice
// note and a typed "7×5" a minute apart got two different quotes back to back).
// A transcript is ready only seconds after its message was sent, so each entry
// carries its send time and the batch is read in the order the customer sent it.
//
// Mechanics: messages buffer per conversation; the agent fires after DEBOUNCE_MS
// of silence (capped at MAX_WAIT_MS from the first buffered message), with the
// batch joined into one inbound. While a run is in flight, new messages buffer
// for the NEXT run — never two concurrent runs per conversation. In-process
// state (single-container deployment).

const DEBOUNCE_MS = 12_000;
const MAX_WAIT_MS = 30_000;

export interface BurstConversation {
  id: string;
  aiState: string;
  aiPaused: boolean;
  sharedContactPhone: string | null;
  channel: 'TELEGRAM' | 'INSTAGRAM';
}

export type BurstSource = 'text' | 'voice' | 'image';

export interface BurstMeta {
  /** 'voice' / 'image' when the batch holds a transcript / plan read, else 'text'. */
  source: BurstSource;
  /** Only the voice/image-derived text of the batch — what the media itself said. */
  mediaText: string;
}

export type BurstRunFn = (
  conversation: BurstConversation,
  joinedText: string,
  /** Every buffered message id — excluded from history; the LAST one keys the proposal. */
  messageIds: string[],
  meta: BurstMeta,
) => Promise<void>;

interface BurstOptions {
  debounceMs?: number;
  maxWaitMs?: number;
  /** Where the text came from. Default 'text'. */
  source?: BurstSource;
  /** When the customer SENT it (ms epoch). Default now. */
  at?: number;
}

interface Entry {
  text: string;
  id: string;
  source: BurstSource;
  at: number;
}

interface Buffer {
  conversation: BurstConversation;
  entries: Entry[];
  timer: ReturnType<typeof setTimeout> | null;
  firstAt: number;
  running: boolean;
}

const buffers = new Map<string, Buffer>();

/** Test hook — clears all buffered state. */
export function _resetBurstsForTest(): void {
  for (const b of buffers.values()) if (b.timer) clearTimeout(b.timer);
  buffers.clear();
}

export function enqueueInboundText(
  conversation: BurstConversation,
  text: string,
  messageId: string,
  run: BurstRunFn,
  opts?: BurstOptions,
): void {
  let b = buffers.get(conversation.id);
  if (!b) {
    b = { conversation, entries: [], timer: null, firstAt: Date.now(), running: false };
    buffers.set(conversation.id, b);
  }
  b.conversation = conversation; // freshest AI-gate state wins
  if (b.entries.length === 0) b.firstAt = Date.now();
  b.entries.push({ text, id: messageId, source: opts?.source ?? 'text', at: opts?.at ?? Date.now() });
  schedule(b, run, opts);
}

function schedule(b: Buffer, run: BurstRunFn, opts?: BurstOptions): void {
  if (b.running) return; // flushed when the in-flight run finishes
  if (b.timer) clearTimeout(b.timer);
  const debounce = opts?.debounceMs ?? DEBOUNCE_MS;
  const maxWait = opts?.maxWaitMs ?? MAX_WAIT_MS;
  const remaining = Math.max(0, maxWait - (Date.now() - b.firstAt));
  b.timer = setTimeout(() => void fire(b, run, opts), Math.min(debounce, remaining));
}

function batchMeta(entries: Entry[]): BurstMeta {
  const media = entries.filter((e) => e.source !== 'text');
  const source = media.some((e) => e.source === 'voice') ? 'voice' : media.length > 0 ? 'image' : 'text';
  return { source, mediaText: media.map((e) => e.text).join('\n') };
}

async function fire(b: Buffer, run: BurstRunFn, opts?: BurstOptions): Promise<void> {
  b.timer = null;
  if (b.running || b.entries.length === 0) return;
  b.running = true;
  // Stable sort: the order the customer sent them, not the order they got ready.
  const entries = [...b.entries].sort((x, y) => x.at - y.at);
  b.entries = [];
  try {
    await run(b.conversation, entries.map((e) => e.text).join('\n'), entries.map((e) => e.id), batchMeta(entries));
  } catch (err) {
    console.error('[agent:burst]', err);
  } finally {
    b.running = false;
    if (b.entries.length > 0) {
      b.firstAt = Date.now();
      schedule(b, run, opts);
    } else {
      buffers.delete(b.conversation.id);
    }
  }
}
