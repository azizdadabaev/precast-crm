import { normalizePhone } from "@/lib/phone";

/**
 * Deciding what a phone edit on the ORDER-EDIT screen actually means.
 *
 * Business context (owner's rules):
 *   - Client NAMES legitimately repeat — several real customers are called
 *     "Умиджон". A name is not an identity.
 *   - The PHONE is the unique identity (`Client.phone @unique`).
 *   - An operator who mistyped the phone while placing an order must be able
 *     to fix it right there in the order-edit screen.
 *
 * That makes a typed phone ambiguous, so this module resolves the ambiguity
 * as a pure decision with no database access (hence testable):
 *
 *   - the number did not really change            → do nothing
 *   - the number already belongs to another client → the order was filed under
 *     the wrong client; RE-POINT the order, never rewrite anybody's phone
 *   - the number is free and this client has other orders → correcting the
 *     shared Client row changes the phone shown on those orders too, so ask
 *   - otherwise                                   → correct the client's phone
 *
 * Anything ambiguous returns `confirm-required` so the route can answer 409
 * and the UI can prompt. Nothing is written until the operator confirms.
 */

export type PhoneConfirmCode = "PHONE_BELONGS_TO_OTHER" | "SHARED_CLIENT_PHONE";

export type PhoneChangeDecision =
  /** Typed number normalizes to nothing — reject the request. */
  | { action: "invalid" }
  /** Same number, differently formatted. No write, no event. */
  | { action: "none" }
  /** Free number: correct the current client's phone in place. */
  | { action: "update-phone"; phone: string }
  /** Number belongs to `clientId`: move THIS order to them, touch no phone. */
  | { action: "repoint"; clientId: string; phone: string }
  | {
      action: "confirm-required";
      code: "PHONE_BELONGS_TO_OTHER";
      phone: string;
      targetClientId: string;
      targetClientName: string;
      targetClientOrderCount: number;
    }
  | {
      action: "confirm-required";
      code: "SHARED_CLIENT_PHONE";
      phone: string;
      clientName: string;
      orderCount: number;
    };

/** The client (other than the order's current one) that already owns the number. */
export type PhoneOwner = {
  id: string;
  name: string;
  orderCount: number;
};

export type PhoneChangeInput = {
  /** The order's current client's stored phone (already digits-only in the DB). */
  currentPhone: string | null | undefined;
  /** Shown back to the operator in the SHARED_CLIENT_PHONE prompt. */
  currentClientName: string;
  /** Raw operator input — any formatting. */
  newPhone: string | null | undefined;
  /** How many orders the current client has (this one included). */
  currentClientOrderCount: number;
  /**
   * A DIFFERENT client already holding the normalized number, or null when the
   * number is free. Callers must never pass the order's own client here.
   */
  otherClientWithPhone: PhoneOwner | null;
  /** The operator ticked through the 409 prompt. */
  confirmed: boolean;
};

export function resolvePhoneChange(input: PhoneChangeInput): PhoneChangeDecision {
  const next = normalizePhone(input.newPhone);
  if (!next) return { action: "invalid" };

  // Compare canonical forms so "+998 90 785 96 60" and "998907859660" are the
  // same number and never trigger a write.
  if (next === normalizePhone(input.currentPhone)) return { action: "none" };

  const owner = input.otherClientWithPhone;
  if (owner) {
    if (!input.confirmed) {
      return {
        action: "confirm-required",
        code: "PHONE_BELONGS_TO_OTHER",
        phone: next,
        targetClientId: owner.id,
        targetClientName: owner.name,
        targetClientOrderCount: owner.orderCount,
      };
    }
    return { action: "repoint", clientId: owner.id, phone: next };
  }

  // Free number. The Client row is shared across the client's orders, so a
  // correction is only unattended-safe when this order is their only one.
  if (input.currentClientOrderCount > 1 && !input.confirmed) {
    return {
      action: "confirm-required",
      code: "SHARED_CLIENT_PHONE",
      phone: next,
      clientName: input.currentClientName,
      orderCount: input.currentClientOrderCount,
    };
  }

  return { action: "update-phone", phone: next };
}
