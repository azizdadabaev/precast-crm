import { describe, it, expect } from 'vitest';
import {
  runLookupClient,
  toPhoneMatch,
  toNameMatch,
  lookupClientDefinition,
  type ClientRow,
  type LookupClientDb,
} from './lookup-client';

const AKMAL: ClientRow = {
  id: 'c_1',
  name: 'Akmal',
  phone: '998901112233',
  address: 'Tashkent, Yunusobod',
  language: 'UZ',
};
const BOBUR: ClientRow = { id: 'c_2', name: 'Bobur', phone: '998935556677', address: 'Samarqand', language: 'RU' };

function fakeDb(rows: ClientRow[] = [AKMAL, BOBUR]): LookupClientDb & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async findClientByPhone(phone) {
      calls.push(`phone:${phone}`);
      return rows.find((r) => r.phone === phone) ?? null;
    },
    async findClientsByName(name) {
      calls.push(`name:${name}`);
      return rows.filter((r) => r.name.toLowerCase().includes(name.toLowerCase()));
    },
  };
}

describe('PII shaping helpers', () => {
  it('toPhoneMatch returns id + name + language only (no phone/address)', () => {
    expect(toPhoneMatch(AKMAL)).toEqual({ client_id: 'c_1', name: 'Akmal', language: 'UZ' });
  });
  it('toNameMatch returns id + name only (no phone/address/language)', () => {
    expect(toNameMatch(AKMAL)).toEqual({ client_id: 'c_1', name: 'Akmal' });
  });
});

describe('runLookupClient', () => {
  it('matches by explicit phone (any format) after normalization', async () => {
    const db = fakeDb();
    const res = await runLookupClient({ phone: '+998 90 111 22 33' }, { db });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.matchedBy).toBe('phone');
    expect(res.data.clients).toEqual([{ client_id: 'c_1', name: 'Akmal', language: 'UZ' }]);
    expect(db.calls).toContain('phone:998901112233'); // normalized
  });

  it('falls back to the conversation shared-contact phone when none is given', async () => {
    const db = fakeDb();
    const res = await runLookupClient({}, { db, sharedContactPhone: '998935556677' });
    expect(res.ok && res.data.clients[0]).toEqual({ client_id: 'c_2', name: 'Bobur', language: 'RU' });
  });

  it('a phone with no match is a normal new-customer result (matchedBy phone, empty)', async () => {
    const db = fakeDb();
    const res = await runLookupClient({ phone: '998900000000' }, { db });
    expect(res.ok && res.data).toEqual({ matchedBy: 'phone', clients: [] });
  });

  it('name-only search returns minimal matches with NO phone/address/language', async () => {
    const db = fakeDb();
    const res = await runLookupClient({ name: 'ak' }, { db }); // matches Akmal
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.matchedBy).toBe('name');
    expect(res.data.clients.length).toBeGreaterThan(0);
    for (const c of res.data.clients) {
      expect(Object.keys(c).sort()).toEqual(['client_id', 'name']);
      expect(c).not.toHaveProperty('language');
    }
  });

  it('prefers an explicit phone over a name (and over shared contact)', async () => {
    const db = fakeDb();
    const res = await runLookupClient(
      { phone: '998901112233', name: 'Bobur' },
      { db, sharedContactPhone: '998935556677' },
    );
    expect(res.ok && res.data.matchedBy).toBe('phone');
    expect(res.ok && res.data.clients[0].client_id).toBe('c_1');
    expect(db.calls).not.toContain('name:Bobur');
  });

  it('returns none when neither phone, shared contact, nor name is available', async () => {
    const db = fakeDb();
    const res = await runLookupClient({}, { db });
    expect(res.ok && res.data).toEqual({ matchedBy: 'none', clients: [] });
    expect(db.calls).toHaveLength(0);
  });

  it('does not enumerate on a 1-character name (PII guard) — returns none, no query', async () => {
    const db = fakeDb();
    const res = await runLookupClient({ name: 'a' }, { db });
    expect(res.ok && res.data).toEqual({ matchedBy: 'none', clients: [] });
    expect(db.calls).toHaveLength(0);
  });
});

describe('lookupClientDefinition', () => {
  it('documents the phone-required-for-details privacy rule', () => {
    expect(lookupClientDefinition.name).toBe('lookup_client');
    const d = lookupClientDefinition.description.toLowerCase();
    expect(d).toContain('phone');
    expect(d).toContain('name');
  });
});
