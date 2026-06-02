import { EventEmitter } from "events";

declare global {
  // eslint-disable-next-line no-var
  var __inboxBus: EventEmitter | undefined;
}

const bus: EventEmitter =
  global.__inboxBus ?? new EventEmitter().setMaxListeners(200);

if (!global.__inboxBus) {
  global.__inboxBus = bus;
}

export const inboxBus = bus;
export const INBOX_EVENT = "inbox";

/** Broadcast a JSON-serializable payload to all connected inbox tabs. */
export function emitInbox(payload: unknown): void {
  bus.emit(INBOX_EVENT, JSON.stringify(payload));
}
