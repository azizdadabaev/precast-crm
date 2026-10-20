import { emitNotifications, usersWithPermission } from "@/lib/notifications";
import { becameOwed } from "@/lib/overpayment";

/**
 * Tell everyone who confirms payments that an order now owes its client money
 * back (owner 2026-10-20). Called after an edit, a payment confirmation or a
 * cancel commits, with the refund due before and after it; only a write that
 * creates or grows the debt notifies, so re-saving an order never repeats it.
 * Fire-and-forget like emitNotifications — a failed bell never fails the write.
 */
export async function notifyIfOverpaid(
  order: { id: string; orderNumber: string },
  before: number,
  after: number,
): Promise<void> {
  if (!becameOwed(before, after)) return;
  try {
    const amount = Math.round(after).toLocaleString("ru-RU");
    await emitNotifications({
      type: "PAYMENT_OVERPAID",
      userIds: await usersWithPermission("payment.confirm"),
      title: `Ортиқча тўлов · Overpaid #${order.orderNumber}: ${amount} UZS`,
      body: "Мижозга қайтариш керак · Refund due to the client",
      orderId: order.id,
    });
  } catch (e) {
    console.error("[overpayment-notify] failed", e);
  }
}
