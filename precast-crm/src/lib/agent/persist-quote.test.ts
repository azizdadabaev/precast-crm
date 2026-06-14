import { describe, it, expect } from 'vitest';
import { extractQuotedRooms, resolveDraftIdentity, roomsFingerprint, mergeDraftRooms, feasibleRooms } from './persist-quote';
import type { LlmMessage } from './llm/provider';

describe('feasibleRooms (no un-buildable beam reaches the draft/card)', () => {
  it('drops a room whose beam exceeds the 6.30 m max (the 9.35 m live bug)', () => {
    const rooms = [
      { innerWidth: 9.05, innerLength: 4 }, // beam 9.35 — infeasible
      { innerWidth: 4, innerLength: 9.05 }, // beam 4.30 — the right orientation
    ];
    expect(feasibleRooms(rooms)).toEqual([{ innerWidth: 4, innerLength: 9.05 }]);
  });

  it('keeps a room exactly at the max (beam 6.30, width 6.00)', () => {
    expect(feasibleRooms([{ innerWidth: 6.0, innerLength: 5 }])).toHaveLength(1);
  });

  it('honors an explicit bearing when computing the beam', () => {
    // width 6.0 + 2×0.20 = 6.40 > 6.30 → dropped
    expect(feasibleRooms([{ innerWidth: 6.0, innerLength: 5, bearing: 0.2 }])).toHaveLength(0);
  });
});

describe('mergeDraftRooms (one cumulative project per conversation)', () => {
  const A = { innerWidth: 8.3, innerLength: 4 };
  const B = { innerWidth: 7, innerLength: 3.6 };
  const C = { innerWidth: 6, innerLength: 3.4 };

  it('first quote of the conversation → replace (the draft is born)', () => {
    expect(mergeDraftRooms([], [A])).toEqual({ rooms: [A], changed: true, mode: 'replace' });
  });

  it('a NEW room quoted alone APPENDS — earlier rooms are never lost (the Dilshodbek bug)', () => {
    const r = mergeDraftRooms([A], [B]);
    expect(r.mode).toBe('merge');
    expect(r.rooms).toEqual([A, B]);
  });

  it('the trickle pattern accumulates the whole house', () => {
    const step1 = mergeDraftRooms([], [A]).rooms;
    const step2 = mergeDraftRooms(step1, [B, C]).rooms;
    expect(step2).toEqual([A, B, C]);
  });

  it('the same set re-quoted (any order) → unchanged, no card resend', () => {
    const r = mergeDraftRooms([A, B], [B, A]);
    expect(r.changed).toBe(false);
    expect(r.mode).toBe('unchanged');
  });

  it('a re-sent SUBSET (customer repeats one room of many) → unchanged', () => {
    const r = mergeDraftRooms([A, B, C], [B]);
    expect(r.changed).toBe(false);
  });

  it('a full re-quote with a correction REPLACES (covers dimension fixes)', () => {
    const Bfixed = { innerWidth: 7, innerLength: 3.8 };
    const r = mergeDraftRooms([A, B], [A, Bfixed]);
    expect(r.mode).toBe('merge'); // B stays (not silently lost), Bfixed appended
    expect(r.rooms).toEqual([A, B, Bfixed]);
    // ...whereas re-quoting the full corrected set INCLUDING all kept rooms replaces:
    const r2 = mergeDraftRooms([A, B], [A, B, Bfixed]);
    expect(r2.mode).toBe('replace');
    expect(r2.rooms).toEqual([A, B, Bfixed]);
  });

  it('is count-aware — two identical bedrooms are preserved as two', () => {
    const r = mergeDraftRooms([A, A], [A]); // re-sent one of the twin rooms
    expect(r.changed).toBe(false);
    const r2 = mergeDraftRooms([A], [A, A]); // second twin added (superset)
    expect(r2.mode).toBe('replace');
    expect(r2.rooms).toHaveLength(2);
  });
});

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

  it('uses a TYPED phone when no order/draft/shared-contact phone exists (the reported bug)', () => {
    // Customer typed their number in chat; the profile name is all we have for the name.
    expect(
      resolveDraftIdentity({ profileName: 'Telegram', sharedPhone: null, typedPhone: '998934813330' }),
    ).toEqual({ name: 'Telegram', phone: '998934813330' });
  });

  it('a shared-contact card still outranks a typed number', () => {
    expect(
      resolveDraftIdentity({ sharedPhone: '90 111 22 33', typedPhone: '998934813330' }),
    ).toEqual({ name: null, phone: '998901112233' });
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

  it('expands count into that many identical rooms (the "3ta xona" draft bug)', () => {
    const rooms = extractQuotedRooms(quoteTurn('t1', { inner_width: 4.5, inner_length: 3.5, count: 3 }));
    expect(rooms).toHaveLength(3);
    expect(rooms.every((r) => r.innerWidth === 4.5 && r.innerLength === 3.5)).toBe(true);
  });

  it('counts a mixed multi-size turn into the real total room count (3+2+1 → 6)', () => {
    const msgs: LlmMessage[] = [
      ...quoteTurn('a', { inner_width: 4.5, inner_length: 3.5, count: 3 }),
      ...quoteTurn('b', { inner_width: 7, inner_length: 3.5, count: 2 }),
      ...quoteTurn('c', { inner_width: 8.7, inner_length: 3 }), // corridor — count defaults to 1
    ];
    expect(extractQuotedRooms(msgs)).toHaveLength(6);
  });

  it('clamps an absurd count and treats a missing/invalid count as 1', () => {
    expect(extractQuotedRooms(quoteTurn('t1', { inner_width: 4, inner_length: 5, count: 999 }))).toHaveLength(50);
    expect(extractQuotedRooms(quoteTurn('t2', { inner_width: 4, inner_length: 5, count: 'lots' }))).toHaveLength(1);
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
