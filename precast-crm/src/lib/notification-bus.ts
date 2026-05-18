import { EventEmitter } from "events";

declare global {
  // eslint-disable-next-line no-var
  var __notificationBus: EventEmitter | undefined;
}

// Same pattern as src/lib/prisma.ts global singleton. Survives the
// lifetime of the Node.js standalone process. Higher max listeners
// allows multiple operators × multiple tabs without warnings.
const bus: EventEmitter =
  global.__notificationBus ?? new EventEmitter().setMaxListeners(200);

if (!global.__notificationBus) {
  global.__notificationBus = bus;
}

export const notificationBus = bus;
