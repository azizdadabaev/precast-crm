import type { OrderStatus } from "@prisma/client";

/** Extra loaded-truck photos may be added only once the order has been loaded
 *  (the FIRST photo goes through /load, which performs the PLACED→LOADED
 *  transition). Adding is allowed at LOADED / DISPATCHED / DELIVERED. */
export function canAddLoadedPhoto(status: OrderStatus | string): boolean {
  return status === "LOADED" || status === "DISPATCHED" || status === "DELIVERED";
}
