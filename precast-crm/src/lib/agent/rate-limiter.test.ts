import { describe, it, expect } from 'vitest';
import { RateLimiter, type RateLimitConfig } from './rate-limiter';

const CFG: RateLimitConfig = {
  perMinute: 3,
  perHour: 10,
  perUserDailyMessages: 1000,
  globalDailyMessages: 5000,
  userDailyTokens: 1000,
  globalDailyTokens: 5000,
};

// A controllable clock so windows are deterministic.
function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('RateLimiter', () => {
  it('allows up to perMinute messages, then denies with a retryAfter', () => {
    const clock = fakeClock();
    const rl = new RateLimiter(CFG, clock.now);
    expect(rl.check('u1', 1).allowed).toBe(true);
    expect(rl.check('u1', 1).allowed).toBe(true);
    expect(rl.check('u1', 1).allowed).toBe(true);
    const denied = rl.check('u1', 1);
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toContain('minute');
    expect(denied.retryAfterSec).toBeGreaterThan(0);
    expect(denied.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it('resets the per-minute window after 60s', () => {
    const clock = fakeClock();
    const rl = new RateLimiter(CFG, clock.now);
    rl.check('u1', 1);
    rl.check('u1', 1);
    rl.check('u1', 1);
    expect(rl.check('u1', 1).allowed).toBe(false);
    clock.advance(60_000);
    expect(rl.check('u1', 1).allowed).toBe(true);
  });

  it('isolates users from each other', () => {
    const clock = fakeClock();
    const rl = new RateLimiter(CFG, clock.now);
    rl.check('u1', 1);
    rl.check('u1', 1);
    rl.check('u1', 1);
    expect(rl.check('u1', 1).allowed).toBe(false);
    expect(rl.check('u2', 1).allowed).toBe(true);
  });

  it('denies when the estimated tokens would exceed the per-user daily budget', () => {
    const clock = fakeClock();
    const rl = new RateLimiter(CFG, clock.now);
    rl.record('u1', 900); // already spent 900 of 1000
    const d = rl.check('u1', 200); // 900 + 200 > 1000
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('per-user daily token');
  });

  it('denies when estimated tokens would exceed the global daily ceiling', () => {
    const clock = fakeClock();
    const rl = new RateLimiter(CFG, clock.now);
    rl.record('whoever', 4900); // global now 4900 of 5000
    const d = rl.check('u1', 200); // 4900 + 200 > 5000
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('global daily token');
  });

  it('record() accumulates user + global token spend and resets after 24h', () => {
    const clock = fakeClock();
    const rl = new RateLimiter(CFG, clock.now);
    rl.record('u1', 500);
    expect(rl.check('u1', 600).allowed).toBe(false); // 500 + 600 > 1000
    clock.advance(86_400_000); // +24h
    expect(rl.check('u1', 600).allowed).toBe(true); // window reset
  });

  it('denies when the per-hour cap is exceeded (independent of the minute cap)', () => {
    const clock = fakeClock();
    // High per-minute + big token budgets so ONLY the per-hour cap can fire.
    const rl = new RateLimiter(
      { perMinute: 1000, perHour: 10, perUserDailyMessages: 1_000_000, globalDailyMessages: 1_000_000, userDailyTokens: 1_000_000, globalDailyTokens: 1_000_000 },
      clock.now,
    );
    for (let i = 0; i < 10; i++) {
      expect(rl.check('u1', 1).allowed).toBe(true);
    }
    const denied = rl.check('u1', 1); // 11th within the hour
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toContain('hour');
    expect(denied.retryAfterSec).toBeGreaterThan(0);
  });

  it('denies when the per-user daily MESSAGE cap is exceeded, and resets after 24h', () => {
    const clock = fakeClock();
    // High minute/hour + big token budgets so ONLY the daily message cap can fire.
    const cfg: RateLimitConfig = {
      perMinute: 1000, perHour: 1000, perUserDailyMessages: 3, globalDailyMessages: 1_000_000,
      userDailyTokens: 1_000_000, globalDailyTokens: 1_000_000,
    };
    const rl = new RateLimiter(cfg, clock.now);
    expect(rl.check('u1', 0).allowed).toBe(true);
    expect(rl.check('u1', 0).allowed).toBe(true);
    expect(rl.check('u1', 0).allowed).toBe(true);
    const denied = rl.check('u1', 0); // 4th in the day
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toContain('per-user daily message');
    clock.advance(86_400_000); // +24h
    expect(rl.check('u1', 0).allowed).toBe(true); // window reset
  });

  it('denies when the GLOBAL daily message ceiling is exceeded (across users)', () => {
    const clock = fakeClock();
    const cfg: RateLimitConfig = {
      perMinute: 1000, perHour: 1000, perUserDailyMessages: 1_000_000, globalDailyMessages: 3,
      userDailyTokens: 1_000_000, globalDailyTokens: 1_000_000,
    };
    const rl = new RateLimiter(cfg, clock.now);
    expect(rl.check('u1', 0).allowed).toBe(true);
    expect(rl.check('u2', 0).allowed).toBe(true);
    expect(rl.check('u3', 0).allowed).toBe(true);
    const denied = rl.check('u4', 0); // 4th org-wide, different user
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toContain('global daily message');
  });
});
