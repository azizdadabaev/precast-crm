import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkBearer } from './auth';

const REAL_TOKEN = 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd';

function makeReq(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set('Authorization', authHeader);
  return new Request('http://localhost/api/mcp', { method: 'POST', headers });
}

describe('checkBearer', () => {
  beforeEach(() => {
    process.env.MCP_API_TOKEN = REAL_TOKEN;
  });
  afterEach(() => {
    delete process.env.MCP_API_TOKEN;
  });

  it('returns true for a correct bearer token', () => {
    expect(checkBearer(makeReq(`Bearer ${REAL_TOKEN}`))).toBe(true);
  });

  it('returns false for a wrong token', () => {
    expect(checkBearer(makeReq('Bearer wrongtoken'))).toBe(false);
  });

  it('returns false when Authorization header is missing', () => {
    expect(checkBearer(makeReq())).toBe(false);
  });

  it('returns false when format is not Bearer', () => {
    expect(checkBearer(makeReq(`Basic ${REAL_TOKEN}`))).toBe(false);
  });

  it('returns false when MCP_API_TOKEN env var is unset (fail closed)', () => {
    delete process.env.MCP_API_TOKEN;
    expect(checkBearer(makeReq(`Bearer ${REAL_TOKEN}`))).toBe(false);
  });

  it('does not throw when provided token has a different length than expected', () => {
    expect(() => checkBearer(makeReq('Bearer short'))).not.toThrow();
    expect(checkBearer(makeReq('Bearer short'))).toBe(false);
  });
});
