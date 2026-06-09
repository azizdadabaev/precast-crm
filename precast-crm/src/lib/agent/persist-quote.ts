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
import type { Pattern } from '@/services/calculation-engine';

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

export interface PersistedDraft {
  projectId: string;
  draftNumber: number | null;
  isNew: boolean;
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
  const { computed } = computeOrderTotals(rooms, NO_EXTRAS, pricing);
  const calcs = computed.map((c, i) => ({ ...calcResultToCreatePayload(c.input, c.result), seq: i }));

  const dimensions = {
    width: rooms[0].innerWidth,
    length: rooms[0].innerLength,
    notes: `${rooms.length} room${rooms.length === 1 ? '' : 's'} · AI`,
  };
  const tentativeClientName = conversation.displayName?.trim() || null;
  const tentativeClientPhone = conversation.sharedContactPhone
    ? normalizePhone(conversation.sharedContactPhone)
    : null;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.project.findFirst({
      where: { conversationId: conversation.id, aiGenerated: true, status: 'DRAFT' },
      select: { id: true, draftNumber: true },
    });

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
      return { projectId: existing.id, draftNumber: existing.draftNumber, isNew: false };
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
    return { projectId: created.id, draftNumber: created.draftNumber, isNew: true };
  });
}
