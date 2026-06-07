import { describe, it, expect } from 'vitest';
import { shouldAgentHandle, DEFAULT_AGENT_RUNTIME } from '@/lib/agent/runtime-config';

const on = { enabled: true, mode: 'shadow' as const };

describe('shouldAgentHandle', () => {
  it('runs only when enabled + AI_HANDLING + not paused', () => {
    expect(shouldAgentHandle({ aiState: 'AI_HANDLING', aiPaused: false }, on)).toBe(true);
  });

  it('is off when the global kill-switch is off (default)', () => {
    expect(shouldAgentHandle({ aiState: 'AI_HANDLING', aiPaused: false }, DEFAULT_AGENT_RUNTIME)).toBe(false);
    expect(DEFAULT_AGENT_RUNTIME.enabled).toBe(false);
  });

  it('is off when a human owns the chat or it is paused', () => {
    expect(shouldAgentHandle({ aiState: 'AI_HANDLING', aiPaused: true }, on)).toBe(false);
    for (const aiState of ['PENDING_HUMAN', 'HUMAN_ACTIVE', 'RESOLVED']) {
      expect(shouldAgentHandle({ aiState, aiPaused: false }, on)).toBe(false);
    }
  });
});
