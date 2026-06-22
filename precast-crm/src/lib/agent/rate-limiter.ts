// Per-user + global rate / token-budget limiter for the AI agent (spec §8).
// In-memory fixed-window counters with an injected clock so it unit-tests
// deterministically. A later plan swaps the in-memory store for a shared
// (Postgres/Redis) backend; the check()/record() contract stays the same.

export interface RateLimitConfig {
  perMinute: number; // messages per user per minute
  perHour: number; // messages per user per hour
  perUserDailyMessages: number; // messages per user per day (Meta volume guard)
  globalDailyMessages: number; // org-wide messages per day (outbound circuit-breaker)
  userDailyTokens: number; // model tokens per user per day
  globalDailyTokens: number; // org-wide model tokens per day
}

export interface RateDecision {
  allowed: boolean;
  reason?: string;
  retryAfterSec?: number;
}

interface CountWindow {
  start: number;
  count: number;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export class RateLimiter {
  // Entries accumulate one-per-userId until process restart; acceptable until
  // a later plan swaps this for a shared (Redis/Postgres) store.
  private perMinute = new Map<string, CountWindow>();
  private perHour = new Map<string, CountWindow>();
  private perUserDayMsg = new Map<string, CountWindow>();
  private globalDayMsg: CountWindow = { start: 0, count: 0 };
  private userTokensDay = new Map<string, CountWindow>();
  private globalTokensDay: CountWindow = { start: 0, count: 0 };

  constructor(
    private cfg: RateLimitConfig,
    private now: () => number = () => Date.now(),
  ) {}

  /**
   * Call BEFORE any paid model call. `estTokens` is a rough estimate of this
   * turn's spend; it gates against the daily budgets without recording.
   * Message-rate windows ARE incremented here (one check == one message).
   *
   * Order is intentional: the per-minute/per-hour message gates run (and
   * increment) BEFORE the token-budget gates. So an inbound message still
   * consumes a message slot even if the call is ultimately denied by the
   * token budget — an abuser cannot dodge rate limits by exhausting tokens.
   */
  check(userId: string, estTokens: number): RateDecision {
    const t = this.now();

    const minute = this.bump(this.perMinute, userId, t, MINUTE);
    if (minute.count > this.cfg.perMinute)
      return deny('per-minute message cap', remaining(minute, t, MINUTE));

    const hour = this.bump(this.perHour, userId, t, HOUR);
    if (hour.count > this.cfg.perHour)
      return deny('per-hour message cap', remaining(hour, t, HOUR));

    // Daily MESSAGE caps (Meta "high-frequency machine activity" guard) — counted
    // here with the other message windows, before the token budgets.
    const userDayMsg = this.bump(this.perUserDayMsg, userId, t, DAY);
    if (userDayMsg.count > this.cfg.perUserDailyMessages)
      return deny('per-user daily message cap', remaining(userDayMsg, t, DAY));

    const globalDayMsg = this.bumpGlobalMsg(t);
    if (globalDayMsg.count > this.cfg.globalDailyMessages)
      return deny('global daily message ceiling', remaining(globalDayMsg, t, DAY));

    const userDay = this.window(this.userTokensDay, userId, t, DAY);
    if (userDay.count + estTokens > this.cfg.userDailyTokens)
      return deny('per-user daily token budget', remaining(userDay, t, DAY));

    const global = this.globalWindow(t);
    if (global.count + estTokens > this.cfg.globalDailyTokens)
      return deny('global daily token ceiling', remaining(global, t, DAY));

    return { allowed: true };
  }

  /** Call AFTER a model call to record the actual tokens spent. */
  record(userId: string, actualTokens: number): void {
    const t = this.now();
    this.window(this.userTokensDay, userId, t, DAY).count += actualTokens;
    this.globalWindow(t).count += actualTokens;
  }

  private bump(map: Map<string, CountWindow>, key: string, t: number, windowMs: number): CountWindow {
    const w = this.window(map, key, t, windowMs);
    w.count += 1;
    return w;
  }

  private window(map: Map<string, CountWindow>, key: string, t: number, windowMs: number): CountWindow {
    let w = map.get(key);
    if (!w || t - w.start >= windowMs) {
      w = { start: t, count: 0 };
      map.set(key, w);
    }
    return w;
  }

  private globalWindow(t: number): CountWindow {
    if (t - this.globalTokensDay.start >= DAY) this.globalTokensDay = { start: t, count: 0 };
    return this.globalTokensDay;
  }

  /** Org-wide daily message window — rolls each DAY and increments once per call. */
  private bumpGlobalMsg(t: number): CountWindow {
    if (t - this.globalDayMsg.start >= DAY) this.globalDayMsg = { start: t, count: 0 };
    this.globalDayMsg.count += 1;
    return this.globalDayMsg;
  }
}

function deny(reason: string, retryAfterSec: number): RateDecision {
  return { allowed: false, reason, retryAfterSec };
}

function remaining(w: CountWindow, t: number, windowMs: number): number {
  return Math.max(1, Math.ceil((w.start + windowMs - t) / 1000));
}
