export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import {
  computeOperationsMetrics,
  type DeliveryOrderInput,
} from "@/lib/delivery-metrics";

/**
 * GET /api/dashboard/operations?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Delivery adherence and lead time. READ-ONLY: this route only ever reads.
 *
 * All date arithmetic lives in src/lib/delivery-metrics.ts (pure, unit-tested).
 * This file's only jobs are windowing, querying, and reshaping rows.
 *
 * Two things here are deliberately unflattering and should not be "fixed":
 *
 *  - Adherence is reported against BOTH the latest promise and the original
 *    one. `Order.scheduledAt` is overwritten on every reschedule, so the
 *    original is recovered from `SCHEDULED_DATE_CHANGED` events. The gap
 *    between the two numbers is the deliverable.
 *
 *  - The window deliberately includes orders that were PROMISED in it but
 *    never delivered. They cannot be scored, but counting only what shipped
 *    would quietly drop exactly the orders that went worst, so they are
 *    surfaced as `excludedNoDeliveryDate`.
 */

const DEFAULT_WINDOW_DAYS = 90;

const RangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** Shape of a SCHEDULED_DATE_CHANGED payload, validated rather than cast. */
const ReschedulePayloadSchema = z.object({ from: z.coerce.date() });

export const GET = withPermission("order.view", async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsed = RangeSchema.parse({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  // Default: the last 90 days, inclusive of today.
  const to = parsed.to ?? new Date();
  to.setHours(23, 59, 59, 999);
  const from = parsed.from ?? new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 86_400_000);
  from.setHours(0, 0, 0, 0);

  if (from.getTime() > to.getTime()) {
    return fail(
      "«Дан» санаси «гача» санасидан кейин бўлмаслиги керак · 'from' must not be after 'to'",
      422,
    );
  }

  // CANCELED orders are excluded from delivery performance entirely (SCOR
  // excludes customer-cancelled orders). Within the window we take orders
  // DELIVERED in it, plus orders PROMISED in it that have not been delivered
  // — the latter are counted, not scored.
  const orders = await prisma.order.findMany({
    where: {
      status: { not: "CANCELED" },
      OR: [
        { deliveredAt: { gte: from, lte: to } },
        { deliveredAt: null, scheduledAt: { gte: from, lte: to } },
      ],
    },
    select: {
      id: true,
      placedAt: true,
      scheduledAt: true,
      productionStartedAt: true,
      deliveredAt: true,
    },
  });

  // Recover each order's reschedule history. `order_events` has NO index on
  // `type`, so this is scoped by orderId (which IS indexed) and filtered on
  // type within that set — never a global scan.
  const orderIds = orders.map((o) => o.id);
  const rescheduleFroms = new Map<string, Date[]>();

  if (orderIds.length > 0) {
    const events = await prisma.orderEvent.findMany({
      where: { orderId: { in: orderIds }, type: "SCHEDULED_DATE_CHANGED" },
      select: { orderId: true, payload: true },
      orderBy: { createdAt: "asc" },
    });

    for (const e of events) {
      // payload is Json and historical rows may predate the current shape,
      // so parse defensively and skip anything unreadable rather than
      // throwing the whole dashboard.
      const result = ReschedulePayloadSchema.safeParse(e.payload);
      if (!result.success) continue; // zod rejects Invalid Date for us
      const list = rescheduleFroms.get(e.orderId);
      if (list) list.push(result.data.from);
      else rescheduleFroms.set(e.orderId, [result.data.from]);
    }
  }

  const inputs: DeliveryOrderInput[] = orders.map((o) => ({
    placedAt: o.placedAt,
    scheduledAt: o.scheduledAt,
    productionStartedAt: o.productionStartedAt,
    deliveredAt: o.deliveredAt,
    rescheduleFroms: rescheduleFroms.get(o.id) ?? [],
  }));

  const metrics = computeOperationsMetrics(inputs);

  return ok({
    window: { from: from.toISOString(), to: to.toISOString() },
    ordersInWindow: orders.length,
    ...metrics,
    labels: {
      deliveryAdherence: "Етказиб бериш интизоми · Delivery adherence",
      onTimeVsLatestPromise:
        "Охирги ваъда бўйича ўз вақтида · On time vs latest promise",
      onTimeVsOriginalPromise:
        "Дастлабки ваъда бўйича ўз вақтида · On time vs original promise",
      adherenceGapPct:
        "Фарқ — сана кўчирилгани учун · Gap earned by moving dates (pp)",
      rescheduleRate: "Сана кўчирилган буюртмалар улуши · Reschedule rate",
      avgMovesPerRescheduledOrder:
        "Ўртача кўчиришлар сони · Average moves per rescheduled order",
      leadTime: "Цикл вақти · Lead time",
      dwellDays: "Кутиш кунлари (мижоз) · Dwell days (customer-imposed)",
      processDays: "Ишлаб чиқариш кунлари · Process days (our working time)",
      totalCycleDays: "Умумий цикл кунлари · Total cycle days",
      unsplittableOrders:
        "Ишлаб чиқариш санаси йўқ — бўлинмайди · No production start, cannot be split",
      excludedNoDeliveryDate:
        "Ваъда қилинган, лекин етказилмаган · Promised but not delivered",
      medianVsMean: "Медиана ва ўртача · Median and mean",
    },
    notes: {
      originalPromise:
        "Дастлабки ваъда SCHEDULED_DATE_CHANGED ҳодисаларидаги энг эрта санадан олинади; ким сўраганини база сақламайди, шунинг учун ҳар бир кўчириш бизнинг кечикишимиз деб ҳисобланади · The original promise is the earliest date in the SCHEDULED_DATE_CHANGED events; the database does not record who requested a change, so every move is counted as our slip.",
      dwellVsProcess:
        "Кутиш вақти ишлаб чиқариш вақтидан ҳеч қачон айирилмайди; асосий кўрсаткич — ишлаб чиқариш кунлари · Dwell is never netted out of process time; the headline number is process days.",
      calendarDay:
        "Саналар Asia/Tashkent маҳаллий календарь куни бўйича солиштирилади · Dates are compared by local Asia/Tashkent calendar day.",
    },
  });
});
