import { prisma } from "@/lib/prisma";
import { OVERPAY_ALERT_MIN } from "@/lib/overpayment";

/**
 * Ids of every order that owes its client money back — the SQL twin of
 * `owesRefund` (live: paid + write-off − total ≥ threshold; canceled: paid ≥
 * threshold). Column arithmetic, so it cannot be a Prisma `where`. Small set
 * by nature; the orders list filters and counts with it.
 */
export async function refundDueOrderIds(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM orders
    WHERE (status = 'CANCELED' AND "confirmedPaid" >= ${OVERPAY_ALERT_MIN})
       OR (status NOT IN ('CANCELED', 'DRAFT')
           AND "confirmedPaid" + "writeOffAmount" - "totalPrice" >= ${OVERPAY_ALERT_MIN})`;
  return rows.map((r) => r.id);
}
