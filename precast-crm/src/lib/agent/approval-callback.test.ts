import { describe, it, expect } from 'vitest';
import { encodeApprovalCallback, parseApprovalCallback } from './approval-callback';

describe('encodeApprovalCallback', () => {
  it('builds "<action>:<id>" for approve and reject', () => {
    expect(encodeApprovalCallback('approve', 'abc123')).toBe('approve:abc123');
    expect(encodeApprovalCallback('reject', 'abc123')).toBe('reject:abc123');
  });

  it('throws on an empty id', () => {
    expect(() => encodeApprovalCallback('approve', '')).toThrow();
  });

  it('throws when the data would exceed Telegram 64-byte callback limit', () => {
    const longId = 'x'.repeat(60); // 'approve:' (8) + 60 = 68 > 64
    expect(() => encodeApprovalCallback('approve', longId)).toThrow();
  });
});

describe('parseApprovalCallback', () => {
  it('parses a valid approve/reject callback', () => {
    expect(parseApprovalCallback('approve:abc123')).toEqual({ action: 'approve', pendingOrderId: 'abc123' });
    expect(parseApprovalCallback('reject:abc123')).toEqual({ action: 'reject', pendingOrderId: 'abc123' });
  });

  it('round-trips with encode', () => {
    const data = encodeApprovalCallback('reject', 'cuid_xyz');
    expect(parseApprovalCallback(data)).toEqual({ action: 'reject', pendingOrderId: 'cuid_xyz' });
  });

  it('round-trips an id that contains a colon (parser splits on the first colon only)', () => {
    const data = encodeApprovalCallback('approve', 'ns:cuid_abc');
    expect(parseApprovalCallback(data)).toEqual({ action: 'approve', pendingOrderId: 'ns:cuid_abc' });
  });

  it('returns null for unrelated / malformed callback_data (so other callbacks are ignored)', () => {
    expect(parseApprovalCallback(null)).toBeNull();
    expect(parseApprovalCallback(undefined)).toBeNull();
    expect(parseApprovalCallback('')).toBeNull();
    expect(parseApprovalCallback('approve')).toBeNull(); // no separator
    expect(parseApprovalCallback('approve:')).toBeNull(); // empty id
    expect(parseApprovalCallback(':abc')).toBeNull(); // empty action
    expect(parseApprovalCallback('delete:abc')).toBeNull(); // unknown action
  });
});
