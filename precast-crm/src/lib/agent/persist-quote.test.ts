import { describe, it, expect } from 'vitest';
import { extractQuotedRooms, resolveDraftIdentity, roomsFingerprint } from './persist-quote';
import type { LlmMessage } from './llm/provider';

describe('roomsFingerprint (re-sent same drawing → no duplicate card)', () => {
  it('identical rooms match even across Decimal-string vs number representations and defaults', () => {
    const fresh = [{ innerWidth: 4, innerLength: 10.35, correction: 0.1, patternOverride: 'GB' }];
    const persisted = [{
      innerWidth: '4', innerLength: '10.350', bearing: '0.15', correction: '0.100',
      extraBeams: 0, forceStartBeam: false, patternOverride: 'GB',
    }];
    expect(roomsFingerprint(persisted)).toBe(roomsFingerprint(fresh));
  });

  it('a changed dimension produces a different fingerprint', () => {
    expect(roomsFingerprint([{ innerWidth: 4, innerLength: 10.35 }])).not.toBe(
      roomsFingerprint([{ innerWidth: 4, innerLength: 6.47 }]),
    );
  });

  it('an added room produces a different fingerprint', () => {
    const one = [{ innerWidth: 4, innerLength: 10.35 }];
    expect(roomsFingerprint([...one, { innerWidth: 3.97, innerLength: 6.47 }])).not.toBe(roomsFingerprint(one));
  });

  it('pattern/extras changes are detected', () => {
    expect(roomsFingerprint([{ innerWidth: 4, innerLength: 5, extraBeams: 1 }])).not.toBe(
      roomsFingerprint([{ innerWidth: 4, innerLength: 5 }]),
    );
  });
});

describe('resolveDraftIdentity', () => {
  it("the order's client (customer-stated name) beats the channel profile (the reported bug)", () => {
    expect(
      resolveDraftIdentity({
        orderedClient: { name: 'Davron aka', phone: '998901234567' },
        profileName: 'Aziz Dadabaev', // Instagram username — must NOT win
        sharedPhone: null,
      }),
    ).toEqual({ name: 'Davron aka', phone: '998901234567' });
  });

  it('values already saved on the draft are preserved over the profile on refresh', () => {
    expect(
      resolveDraftIdentity({
        existingTentative: { name: 'Davron aka', phone: '998901234567' },
        profileName: 'insta_user',
      }),
    ).toEqual({ name: 'Davron aka', phone: '998901234567' });
  });

  it('resolves per FIELD — a draft name with no phone still picks up the shared contact', () => {
    expect(
      resolveDraftIdentity({
        existingTentative: { name: 'Davron aka', phone: null },
        profileName: 'insta_user',
        sharedPhone: '+998 93 481 33 30',
      }),
    ).toEqual({ name: 'Davron aka', phone: '998934813330' });
  });

  it('falls back to the channel profile + shared contact when nothing better exists', () => {
    expect(
      resolveDraftIdentity({ profileName: '  Aziz Dadabaev  ', sharedPhone: '90 111 22 33' }),
    ).toEqual({ name: 'Aziz Dadabaev', phone: '998901112233' });
  });

  it('returns nulls (not empty strings) when no source is usable', () => {
    expect(resolveDraftIdentity({ profileName: '   ', sharedPhone: ' - ' })).toEqual({ name: null, phone: null });
  });
});

/** Build the (assistant tool_use → user tool_result) message pair the loop
 *  produces for a get_quote call. */
function quoteTurn(
  id: string,
  input: Record<string, unknown>,
  opts: { name?: string; isError?: boolean } = {},
): LlmMessage[] {
  return [
    { role: 'assistant', content: '', toolCalls: [{ id, name: opts.name ?? 'get_quote', input }] },
    {
      role: 'user',
      content: [{ type: 'tool_result', toolUseId: id, content: '{"ok":true}', isError: opts.isError ?? false }],
    },
  ];
}

describe('extractQuotedRooms', () => {
  it('returns the room for a single successful get_quote', () => {
    const rooms = extractQuotedRooms(quoteTurn('t1', { inner_width: 4, inner_length: 5 }));
    expect(rooms).toEqual([
      {
        innerWidth: 4,
        innerLength: 5,
        bearing: undefined,
        correction: undefined,
        extraBeams: undefined,
        forceStartBeam: false,
        patternOverride: null,
      },
    ]);
  });

  it('collects every room in a multi-room turn (the jami case)', () => {
    const msgs: LlmMessage[] = [
      ...quoteTurn('a', { inner_width: 4, inner_length: 6 }),
      ...quoteTurn('b', { inner_width: 4, inner_length: 4 }),
      ...quoteTurn('c', { inner_width: 2, inner_length: 6 }),
    ];
    const rooms = extractQuotedRooms(msgs);
    expect(rooms.map((r) => [r.innerWidth, r.innerLength])).toEqual([
      [4, 6],
      [4, 4],
      [2, 6],
    ]);
  });

  it('passes through optional inputs and the pattern override', () => {
    const rooms = extractQuotedRooms(
      quoteTurn('t1', { inner_width: 5, inner_length: 4, bearing: 0.2, extra_beams: 1, pattern: 'BGB', force_start_beam: true }),
    );
    expect(rooms[0]).toMatchObject({
      innerWidth: 5,
      innerLength: 4,
      bearing: 0.2,
      extraBeams: 1,
      forceStartBeam: true,
      patternOverride: 'BGB',
    });
  });

  it('drops a get_quote whose tool_result was an error (never persists a failed quote)', () => {
    expect(extractQuotedRooms(quoteTurn('t1', { inner_width: 4, inner_length: 5 }, { isError: true }))).toEqual([]);
  });

  it('ignores non-quote tools and plain text turns', () => {
    const msgs: LlmMessage[] = [
      { role: 'user', content: 'narx qancha 4x5?' },
      ...quoteTurn('s1', { item: 'gazoblok' }, { name: 'check_stock' }),
      ...quoteTurn('q1', { inner_width: 3, inner_length: 4 }),
    ];
    const rooms = extractQuotedRooms(msgs);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toMatchObject({ innerWidth: 3, innerLength: 4 });
  });

  it('drops a malformed quote call missing real dimensions', () => {
    const msgs: LlmMessage[] = [
      ...quoteTurn('t1', { inner_width: 0, inner_length: 5 }), // non-positive width
      ...quoteTurn('t2', { inner_length: 5 }), // missing width
    ];
    expect(extractQuotedRooms(msgs)).toEqual([]);
  });

  it('returns nothing for an empty / no-tool turn', () => {
    expect(extractQuotedRooms([{ role: 'assistant', content: 'Assalomu alaykum!' }])).toEqual([]);
  });
});
