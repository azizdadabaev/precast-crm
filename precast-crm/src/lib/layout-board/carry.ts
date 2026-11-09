/**
 * Layout ↔ database, and the rule for re-quotes that rebuild a draft's rooms
 * (Telegram/IG agent, MCP): positions survive only when the room count is
 * unchanged (matched by order); otherwise every room goes back to the tray,
 * because a guess would put a room in another room's place. The same rule keeps
 * positions when an order is placed/edited by a client that doesn't send layouts.
 */
import { RoomLayoutSchema, type RoomLayout } from "./model";

export function layoutFromDb(json: unknown): RoomLayout | null {
  const parsed = RoomLayoutSchema.safeParse(json);
  return parsed.success ? (parsed.data as RoomLayout) : null;
}

type WithLayout<T> = T & { layout?: RoomLayout | null };

export function carryLayouts<T extends object>(
  previous: (RoomLayout | null)[],
  next: WithLayout<T>[],
): WithLayout<T>[] {
  if (previous.length !== next.length) return next.map((r) => ({ ...r, layout: null }));
  // Only rooms that carry NO layout field (agent, MCP, older Android) inherit; an explicit
  // null is the operator taking the room off the board and must stay null.
  return next.map((r, i) => (r.layout === undefined ? { ...r, layout: previous[i] ?? null } : r));
}

/** Re-save over saved rows (draft save, order place/edit): saved positions by seq, then carryLayouts. */
export function keepSavedLayouts<T extends object>(
  saved: { seq: number; layoutJson: unknown }[],
  next: WithLayout<T>[],
): WithLayout<T>[] {
  const prev = [...saved].sort((a, b) => a.seq - b.seq).map((c) => layoutFromDb(c.layoutJson));
  return carryLayouts(prev, next);
}
