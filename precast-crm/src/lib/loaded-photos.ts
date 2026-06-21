import type { OrderStatus } from "@prisma/client";

/** Extra loaded-truck photos may be added only once the order has been loaded
 *  (the FIRST photo goes through /load, which performs the PLACED→LOADED
 *  transition). Adding is allowed at LOADED / DISPATCHED / DELIVERED. */
export function canAddLoadedPhoto(status: OrderStatus | string): boolean {
  return status === "LOADED" || status === "DISPATCHED" || status === "DELIVERED";
}

/** What the bot's 🚚 Truck button should do for a given order, so a loaded-truck
 *  photo from the field is never wrongly refused:
 *  - `"transition"` — single-truck order not yet loaded → flip PLACED/IN_PRODUCTION
 *    to LOADED with this photo (same as the in-CRM "Load" button).
 *  - `"attach"` — order already loaded/beyond (extra photo), OR a split order
 *    (shipment rows exist): just save the photo; the operator ties it to a truck
 *    number + counts in the CRM. No status change in the split case.
 *  - `null` — terminal/draft status; nothing to do. */
export function botTruckPhotoAction(
  status: OrderStatus | string,
  hasShipments: boolean,
): "transition" | "attach" | null {
  if (status === "CANCELED" || status === "DRAFT") return null;
  if (canAddLoadedPhoto(status)) return "attach";
  if (hasShipments) return "attach";
  if (status === "PLACED" || status === "IN_PRODUCTION") return "transition";
  return null;
}
