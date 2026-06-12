// Inbound TEXT burst coalescing + per-conversation serialization.
//
// Customers send thoughts as rapid message bursts ("Narxi qancha?" /
// "Sinovdan o'tganmi?" / "Tayyori bormi?"). Running the agent per message made
// it answer each one independently — and because earlier replies weren't in
// history yet, later runs RE-answered earlier questions (live bug: the starting
// price delivered 3×, the dims-ask 3×, in one minute). A human reads the whole
// burst, then replies once.
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
}

export type BurstRunFn = (
  conversation: BurstConversation,
  joinedText: string,
  /** Every buffered message id — excluded from history; the LAST one keys the proposal. */
  messageIds: string[],
) => Promise<void>;

interface Buffer {
  conversation: BurstConversation;
  texts: string[];
  ids: string[];
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
  opts?: { debounceMs?: number; maxWaitMs?: number },
): void {
  let b = buffers.get(conversation.id);
  if (!b) {
    b = { conversation, texts: [], ids: [], timer: null, firstAt: Date.now(), running: false };
    buffers.set(conversation.id, b);
  }
  b.conversation = conversation; // freshest AI-gate state wins
  if (b.texts.length === 0) b.firstAt = Date.now();
  b.texts.push(text);
  b.ids.push(messageId);
  schedule(b, run, opts);
}

function schedule(b: Buffer, run: BurstRunFn, opts?: { debounceMs?: number; maxWaitMs?: number }): void {
  if (b.running) return; // flushed when the in-flight run finishes
  if (b.timer) clearTimeout(b.timer);
  const debounce = opts?.debounceMs ?? DEBOUNCE_MS;
  const maxWait = opts?.maxWaitMs ?? MAX_WAIT_MS;
  const remaining = Math.max(0, maxWait - (Date.now() - b.firstAt));
  b.timer = setTimeout(() => void fire(b, run, opts), Math.min(debounce, remaining));
}

async function fire(b: Buffer, run: BurstRunFn, opts?: { debounceMs?: number; maxWaitMs?: number }): Promise<void> {
  b.timer = null;
  if (b.running || b.texts.length === 0) return;
  b.running = true;
  const texts = b.texts;
  const ids = b.ids;
  b.texts = [];
  b.ids = [];
  try {
    await run(b.conversation, texts.join('\n'), ids);
  } catch (err) {
    console.error('[agent:burst]', err);
  } finally {
    b.running = false;
    if (b.texts.length > 0) {
      b.firstAt = Date.now();
      schedule(b, run, opts);
    } else {
      buffers.delete(b.conversation.id);
    }
  }
}
