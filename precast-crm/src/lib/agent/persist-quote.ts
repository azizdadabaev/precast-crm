// Auto-save a draft Project + Calculation rows from the agent's quote (Plan 09).
//
// When the agent runs in AUTO mode and a turn produced real quotes from the
// customer's room dimensions, we persist the calculation as a DRAFT Project —
// the same record an operator would save by hand — so the quote lives in the
// CRM pipeline (Projects tab, convertible to an Order). The customer still gets
// only the short price reply; this draft is the operator-side artifact.
//
// Price integrity: the rooms come from the get_quote tool INPUTS captured in the
// turn transcript, and every number is RECOMPUTED from the live pricing engine
// (computeOrderTotals) — never from the model's free text. One agent draft per
// conversation, refreshed (deleteMany + createMany) on each qualifying turn so a
// re-quote with refined dimensions overwrites the previous one.

import { prisma } from '@/lib/prisma';
import type { LlmMessage } from './llm/provider';
import { calcResultToCreatePayload, type RoomInput } from '@/lib/calc-persistence';
import { computeOrderTotals } from '@/lib/order-totals';
import { loadPricingConfig } from '@/lib/pricing-config';
import { nextDraftNumber } from '@/lib/draft-number';
import { normalizePhone } from '@/lib/phone';
import { applyAgentPatternPolicy } from './pattern-policy';
import { MAX_BEAM_LENGTH_M } from './tools/get-quote';
import { DEFAULT_BEARING, type Pattern } from '@/services/calculation-engine';

/** Beam length a room would need = inner width + a bearing each side. Mirrors the
 *  engine so the draft can be screened without a full recompute. */
function roomBeamLength(room: RoomInput): number {
  const bearing = room.bearing ?? DEFAULT_BEARING;
  return room.innerWidth + 2 * bearing;
}

/** Invariant: a draft (and the card the customer sees) must NEVER contain a beam
 *  the factory can't build. get_quote already escalates an over-long span, but a
 *  room can still reach persistence (e.g. an exploratory orientation) — drop it
 *  here so the uncovered engine path never prices an impossible 9.35 m beam. */
export function feasibleRooms(rooms: RoomInput[]): RoomInput[] {
  return rooms.filter((r) => {
    const ok = roomBeamLength(r) <= MAX_BEAM_LENGTH_M + 1e-9;
    if (!ok) {
      console.warn(
        `[agent:draft] dropping room ${r.innerWidth}×${r.innerLength} — beam ${roomBeamLength(r).toFixed(2)}m exceeds ${MAX_BEAM_LENGTH_M}m max`,
      );
    }
    return ok;
  });
}

/** Apply the agent's GBG→Г-Б round-up policy to a room (same transform the
 *  get_quote tool applies), keeping the draft in lockstep with the quote. Only
 *  `correction` + `patternOverride` can change; inner_length is untouched. */
function withAgentPatternPolicy(room: RoomInput): RoomInput {
  const pol = applyAgentPatternPolicy({
    inner_width: room.innerWidth,
    inner_length: room.innerLength,
    bearing: room.bearing,
    correction: room.correction,
    extra_beams: room.extraBeams,
    force_start_beam: room.forceStartBeam,
    pattern: (room.patternOverride ?? undefined) as Pattern | undefined,
  });
  return {
    ...room,
    correction: pol.correction,
    patternOverride: (pol.pattern ?? room.patternOverride ?? null) as Pattern | null,
  };
}

// The agent draft carries no discount/delivery — it's the bare room calculation.
const NO_EXTRAS = { discountPercent: 0, discountAmount: 0, deliveryCost: 0, otherCost: 0 };

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** Map a get_quote tool INPUT to the engine's RoomInput. Returns null when the
 *  two required inner dimensions are missing/invalid (so a malformed call is
 *  silently dropped rather than persisted as a bad room). */
function toRoomInput(input: unknown): RoomInput | null {
  if (!input || typeof input !== 'object') return null;
  const i = input as Record<string, unknown>;
  const innerWidth = num(i.inner_width);
  const innerLength = num(i.inner_length);
  if (innerWidth == null || innerLength == null || innerWidth <= 0 || innerLength <= 0) return null;
  const pattern =
    i.pattern === 'GB' || i.pattern === 'BGB' || i.pattern === 'GBG' ? (i.pattern as Pattern) : null;
  return {
    innerWidth,
    innerLength,
    bearing: num(i.bearing),
    correction: num(i.correction),
    extraBeams: num(i.extra_beams),
    forceStartBeam: i.force_start_beam === true,
    patternOverride: pattern,
  };
}

/**
 * Pull the rooms the agent successfully priced via get_quote in THIS turn's
 * transcript. Pure. Each get_quote call whose matching tool_result was NOT an
 * error becomes one room (dims from the call input; numbers recomputed later).
 *
 * Pass only the messages added during the CURRENT turn (slice off prior history)
 * so a long multi-turn chat never resurrects superseded dimensions — the latest
 * quoting turn defines the draft.
 */
export function extractQuotedRooms(turnMessages: ReadonlyArray<LlmMessage>): RoomInput[] {
  // toolUseId → isError, gathered from the tool_result user turns.
  const errored = new Map<string, boolean>();
  for (const m of turnMessages) {
    if (m.role !== 'user' || !Array.isArray(m.content)) continue;
    for (const part of m.content) {
      if (part.type === 'tool_result') errored.set(part.toolUseId, part.isError === true);
    }
  }
  const rooms: RoomInput[] = [];
  for (const m of turnMessages) {
    if (m.role !== 'assistant' || !m.toolCalls) continue;
    for (const call of m.toolCalls) {
      if (call.name !== 'get_quote') continue; // slab only; gazoblok isn't a Calculation
      if (errored.get(call.id) === true) continue; // failed quote → don't persist
      const room = toRoomInput(call.input);
      if (room) rooms.push(room);
    }
  }
  return rooms;
}

export interface AgentDraftConversation {
  id: string;
  displayName?: string | null;
  sharedContactPhone?: string | null;
}

const fpCounts = (fps: string[]): Map<string, number> =>
  fps.reduce((m, f) => m.set(f, (m.get(f) ?? 0) + 1), new Map<string, number>());

/**
 * Decide how this turn's quoted rooms combine with the draft's existing rooms —
 * a customer often describes their house room by room across separate messages
 * (live bug: each new message OVERWROTE the draft, so a 5-room house ended as a
 * 1-room draft). Count-aware (houses really do have two identical bedrooms):
 *   - turn ≡ existing (same multiset)  → unchanged (no rewrite, no card resend)
 *   - turn ⊆ existing (re-sent some)   → unchanged
 *   - turn ⊇ existing (full re-quote / correction of the full set) → replace
 *   - otherwise → MERGE: keep existing, append the genuinely new rooms — rooms
 *     are never silently lost; a stale room is operator-fixable, a vanished one
 *     isn't. Pure.
 */
export function mergeDraftRooms(
  existingRooms: RoomInput[],
  turnRooms: RoomInput[],
): { rooms: RoomInput[]; changed: boolean; mode: 'unchanged' | 'replace' | 'merge' } {
  if (existingRooms.length === 0) return { rooms: turnRooms, changed: true, mode: 'replace' };
  const exFp = existingRooms.map((r) => roomsFingerprint([r]));
  const newFp = turnRooms.map((r) => roomsFingerprint([r]));
  const newCounts = fpCounts(newFp);
  const containsAllExisting = [...fpCounts(exFp)].every(([f, c]) => (newCounts.get(f) ?? 0) >= c);
  if (containsAllExisting && newFp.length === exFp.length) {
    return { rooms: existingRooms, changed: false, mode: 'unchanged' };
  }
  if (containsAllExisting) return { rooms: turnRooms, changed: true, mode: 'replace' };

  // Append only the turn rooms beyond what the draft already holds.
  const remaining = fpCounts(exFp);
  const extras: RoomInput[] = [];
  turnRooms.forEach((r, i) => {
    const f = newFp[i];
    const have = remaining.get(f) ?? 0;
    if (have > 0) remaining.set(f, have - 1);
    else extras.push(r);
  });
  if (extras.length === 0) return { rooms: existingRooms, changed: false, mode: 'unchanged' };
  return { rooms: [...existingRooms, ...extras], changed: true, mode: 'merge' };
}

export interface PersistedDraft {
  projectId: string;
  draftNumber: number | null;
  isNew: boolean;
  /** False when the freshly-quoted rooms are IDENTICAL to what the draft already
   *  holds — the caller then skips re-sending the summary image/notes (live bug:
   *  a customer re-sending the same drawing got the same card 3× in 10 min). */
  changed: boolean;
}

const num3 = (v: unknown): string => Number(v).toFixed(3);

/**
 * Canonical fingerprint of a room list — every field that affects the engine,
 * defaults normalized, numbers fixed to 3dp (Decimal/float noise immune).
 * Order-sensitive (the same plan yields the same order). Pure.
 */
export function roomsFingerprint(
  rooms: ReadonlyArray<{
    innerWidth: unknown;
    innerLength: unknown;
    bearing?: unknown;
    correction?: unknown;
    extraBeams?: number | null;
    forceStartBeam?: boolean | null;
    patternOverride?: string | null;
  }>,
): string {
  return JSON.stringify(
    rooms.map((r) => [
      num3(r.innerWidth),
      num3(r.innerLength),
      num3(r.bearing ?? 0.15),
      num3(r.correction ?? 0),
      r.extraBeams ?? 0,
      !!r.forceStartBeam,
      r.patternOverride ?? null,
    ]),
  );
}

/** Identity sources for a conversation draft, strongest first. */
export interface DraftIdentitySources {
  /** Client on the conversation's most recent ORDERED project — the name/phone
   *  the customer STATED at order time. */
  orderedClient?: { name: string; phone: string } | null;
  /** Tentative fields already saved on the draft being refreshed. */
  existingTentative?: { name: string | null; phone: string | null } | null;
  /** Channel profile display name (IG username / TG name) — last resort. */
  profileName?: string | null;
  /** Shared-contact phone from the conversation (digits-only). */
  sharedPhone?: string | null;
}

/**
 * Resolve the draft's client identity per field: the real order Client (what the
 * customer said their name/phone is) > values already on the draft > the channel
 * profile. An Instagram username must never displace "Davron aka" once the
 * customer has identified themselves. Pure.
 */
export function resolveDraftIdentity(s: DraftIdentitySources): { name: string | null; phone: string | null } {
  const name = s.orderedClient?.name ?? s.existingTentative?.name ?? (s.profileName?.trim() || null);
  const phone =
    s.orderedClient?.phone ??
    s.existingTentative?.phone ??
    (s.sharedPhone ? normalizePhone(s.sharedPhone) || null : null);
  return { name, phone };
}

/**
 * Create or refresh the agent's DRAFT Project for a conversation and replace its
 * Calculations with the freshly-computed rooms. One agent draft per conversation
 * (found by conversationId + aiGenerated + DRAFT). Returns null when there are no
 * rooms to save. Recomputes prices from the live engine — the transcript only
 * supplies dimensions, never amounts.
 */
export async function persistConversationDraft(
  conversation: AgentDraftConversation,
  rooms: RoomInput[],
): Promise<PersistedDraft | null> {
  if (rooms.length === 0) return null;

  const pricing = await loadPricingConfig();
  // Same GBG→Г-Б round-up the get_quote tool applied, so the saved draft (and any
  // order it becomes) matches the price the customer was quoted. Then drop any
  // room whose beam exceeds what the factory builds — the draft/card invariant
  // (live bug: a 9.05 m-wide room's 9.35 m beam reached the share card).
  const policyRooms = feasibleRooms(rooms.map(withAgentPatternPolicy));
  if (policyRooms.length === 0) return null; // nothing buildable to persist this turn

  return prisma.$transaction(async (tx) => {
    const existing = await tx.project.findFirst({
      where: { conversationId: conversation.id, aiGenerated: true, status: 'DRAFT' },
      select: {
        id: true,
        draftNumber: true,
        tentativeClientName: true,
        tentativeClientPhone: true,
        calculations: {
          orderBy: { seq: 'asc' },
          select: {
            name: true, innerWidth: true, innerLength: true, bearing: true, correction: true,
            extraBeams: true, forceStartBeam: true, patternOverride: true,
            m2PriceOverride: true, m2Price: true, m2PriceReason: true,
          },
        },
      },
    });

    // ONE cumulative project per conversation: this turn's rooms MERGE with what
    // the draft already holds (a house arrives room by room) — identical set or a
    // re-sent subset changes nothing (and the caller skips the card resend); a
    // full re-quote replaces; new rooms append. See mergeDraftRooms.
    const existingRooms: RoomInput[] = (existing?.calculations ?? []).map((c) => ({
      name: c.name,
      innerWidth: Number(c.innerWidth),
      innerLength: Number(c.innerLength),
      bearing: Number(c.bearing),
      correction: Number(c.correction),
      extraBeams: c.extraBeams,
      forceStartBeam: c.forceStartBeam,
      patternOverride: c.patternOverride as RoomInput['patternOverride'],
      m2PriceOverride: c.m2PriceOverride,
      m2PriceOverrideValue: c.m2PriceOverride ? Number(c.m2Price) : null,
      m2PriceReason: c.m2PriceOverride ? c.m2PriceReason : null,
    }));
    const merge = mergeDraftRooms(existingRooms, policyRooms);
    if (existing && !merge.changed) {
      return { projectId: existing.id, draftNumber: existing.draftNumber, isNew: false, changed: false };
    }

    const { computed } = computeOrderTotals(merge.rooms, NO_EXTRAS, pricing);
    const calcs = computed.map((c, i) => ({ ...calcResultToCreatePayload(c.input, c.result), seq: i }));
    const dimensions = {
      width: merge.rooms[0].innerWidth,
      length: merge.rooms[0].innerLength,
      notes: `${merge.rooms.length} room${merge.rooms.length === 1 ? '' : 's'} · AI`,
    };
    // The customer-stated identity (the order's Client, or values already on the
    // draft) outranks the channel profile name — see resolveDraftIdentity.
    const orderedProject = await tx.project.findFirst({
      where: { conversationId: conversation.id, status: 'ORDERED', clientId: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { client: { select: { name: true, phone: true } } },
    });
    const identity = resolveDraftIdentity({
      orderedClient: orderedProject?.client ?? null,
      existingTentative: existing
        ? { name: existing.tentativeClientName, phone: existing.tentativeClientPhone }
        : null,
      profileName: conversation.displayName,
      sharedPhone: conversation.sharedContactPhone,
    });
    const tentativeClientName = identity.name;
    const tentativeClientPhone = identity.phone;

    if (existing) {
      await tx.calculation.deleteMany({ where: { projectId: existing.id } });
      await tx.project.update({
        where: { id: existing.id },
        data: {
          dimensions,
          tentativeClientName,
          tentativeClientPhone,
          calculations: { create: calcs },
        },
      });
      return { projectId: existing.id, draftNumber: existing.draftNumber, isNew: false, changed: true };
    }

    const maxAgg = await tx.project.aggregate({ _max: { draftNumber: true } });
    const draftNumber = nextDraftNumber(maxAgg._max.draftNumber ?? null);
    const created = await tx.project.create({
      data: {
        draftNumber,
        status: 'DRAFT',
        aiGenerated: true,
        conversationId: conversation.id,
        shapeType: 'RECTANGULAR',
        dimensions,
        tentativeClientName,
        tentativeClientPhone,
        calculations: { create: calcs },
      },
      select: { id: true, draftNumber: true },
    });
    return { projectId: created.id, draftNumber: created.draftNumber, isNew: true, changed: true };
  });
}
