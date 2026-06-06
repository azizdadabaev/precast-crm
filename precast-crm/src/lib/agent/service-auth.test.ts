import { describe, it, expect } from 'vitest';
import {
  isValidServiceToken,
  serviceTokenFromAuthHeader,
  authorizeServiceRequest,
} from './service-auth';

describe('isValidServiceToken', () => {
  it('returns true only for an exact match', () => {
    expect(isValidServiceToken('s3cret-token', 's3cret-token')).toBe(true);
    expect(isValidServiceToken('s3cret-token', 'other-token')).toBe(false);
  });

  it('returns false on length mismatch (never throws)', () => {
    expect(isValidServiceToken('short', 'a-much-longer-token')).toBe(false);
  });

  it('returns false when either side is empty/null/undefined', () => {
    expect(isValidServiceToken('', 'x')).toBe(false);
    expect(isValidServiceToken('x', '')).toBe(false);
    expect(isValidServiceToken(null, 'x')).toBe(false);
    expect(isValidServiceToken('x', undefined)).toBe(false);
    expect(isValidServiceToken(undefined, undefined)).toBe(false);
  });
});

describe('serviceTokenFromAuthHeader', () => {
  it('extracts the token from a Bearer header', () => {
    expect(serviceTokenFromAuthHeader('Bearer abc123')).toBe('abc123');
  });

  it('trims surrounding whitespace on the token', () => {
    expect(serviceTokenFromAuthHeader('Bearer   abc123  ')).toBe('abc123');
  });

  it('returns null when the prefix is missing or the token is empty', () => {
    expect(serviceTokenFromAuthHeader('abc123')).toBeNull();
    expect(serviceTokenFromAuthHeader('Bearer ')).toBeNull();
    expect(serviceTokenFromAuthHeader('Bearer    ')).toBeNull();
    expect(serviceTokenFromAuthHeader(null)).toBeNull();
    expect(serviceTokenFromAuthHeader(undefined)).toBeNull();
  });

  it('returns null for non-Bearer schemes and case-mismatched prefix', () => {
    expect(serviceTokenFromAuthHeader('Basic abc123')).toBeNull();
    expect(serviceTokenFromAuthHeader('bearer abc123')).toBeNull(); // case-sensitive
    expect(serviceTokenFromAuthHeader('BEARER abc123')).toBeNull();
  });
});

describe('authorizeServiceRequest', () => {
  it('authorizes a correct Bearer token against the expected secret', () => {
    expect(authorizeServiceRequest('Bearer the-expected', 'the-expected')).toBe(true);
  });

  it('rejects a wrong token, a missing header, or an unset expected secret', () => {
    expect(authorizeServiceRequest('Bearer wrong', 'the-expected')).toBe(false);
    expect(authorizeServiceRequest(null, 'the-expected')).toBe(false);
    expect(authorizeServiceRequest('Bearer the-expected', undefined)).toBe(false);
    expect(authorizeServiceRequest('Bearer the-expected', '')).toBe(false);
  });
});
