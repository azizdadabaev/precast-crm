/**
 * Local-only seed: insert ~3-7 orders into each of the last 12
 * calendar months so the new MonthlyRevenueChart has something
 * interesting to animate. Skipped if the month already has at
 * least 3 orders (idempotent — re-running won't bloat past months).
 *
 *   npx tsx scripts/seed-12mo-revenue.ts
 */
import { prisma } from "../src/lib/prisma";
import { calculateSlab } from "../src/services/calculation-engine";
import { calcResultToCreatePayload } from "../src/lib/calc-persistence";
import { nextOrderNumber, orderNumberMonthPrefix } from "../src/lib/order-number";

const ROOM_PRESETS = [
  { w: 3.4, l: 4.0 },
  { w: 3.4, l: 6.0 },
  { w: 4.0, l: 5.0 },
  { w: 3.0, l: 4.5 },
  { w: 4.2, l: 6.0 },
  { w: 3.6, l: 5.5 },
];

const CLIENT_SEEDS = [
  { name: "Алишер Каримов",      phone: "+998 90 111 22 33", address: "Тошкент, Юнусобод" },
  { name: "Botir Tursunov",       phone: "+998 91 222 33 44", address: "Самарканд, Темуробод" },
  { name: "Diyora Saidova",       phone: "+998 93 333 44 55", address: "Бухоро, Когон" },
  { name: "Жасур Ёқубов",         phone: "+998 94 444 55 66", address: "Андижон, Олтинкўл" },
  { name: "Mukhsin Abdullayev",   phone: "+998 95 555 66 77", address: "Наманган, Поп" },
  { name: "Шаҳло Файзуллаева",   phone: "+998 97 666 77 88", address: "Фарғона, Қўқон" },
];

// A trajectory across 12 months — climbs roughly, dips in the
// middle, climbs hard at the end. Index 0 = 11 months ago, 11 = now.
// Each value is the number of orders to place that month.
const ORDERS_PER_MONTH = [2, 3, 4, 3, 5, 4, 6, 5, 7, 6, 9, 8];

async function main() {
  // Ensure we have enough clients to spread orders across.
  for (const seed of CLIENT_SEEDS) {
    const phoneNorm = seed.phone.replace(/[^\d+]/g, "");
    const existing = await prisma.client.findUnique({ where: { phone: phoneNorm } });
    if (!existing) {
      await prisma.client.create({
        data: { name: seed.name, phone: phoneNorm, address: seed.address },
      });
    }
  }
  const clients = await prisma.client.findMany({ take: 10 });
  if (clients.length === 0) throw new Error("no clients available");

  const now = new Date();
  const startYear = now.getFullYear();
  const startMonth = now.getMonth(); // 0-indexed

  let totalCreated = 0;

  for (let i = 0; i < ORDERS_PER_MONTH.length; i++) {
    const target = ORDERS_PER_MONTH[i]!;
    // The month this iteration represents.
    const monthDate = new Date(startYear, startMonth - 11 + i, 1);
    const y = monthDate.getFullYear();
    const m = monthDate.getMonth() + 1;

    // Count existing non-canceled orders this month so we stay idempotent.
    const monthStart = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(y, m, 1, 0, 0, 0, 0);
    const have = await prisma.order.count({
      where: {
        status: { not: "CANCELED" },
        placedAt: { gte: monthStart, lt: monthEnd },
      },
    });
    if (have >= target) {
      console.log(`  ${y}-${String(m).padStart(2, "0")}  already has ${have}, skipping`);
      continue;
    }
    const toCreate = target - have;
    const prefix = orderNumberMonthPrefix(y, m);
    const highest = await prisma.order.findFirst({
      where: { orderNumber: { startsWith: prefix } },
      orderBy: { orderNumber: "desc" },
      select: { orderNumber: true },
    });
    let highestNumber = highest?.orderNumber ?? null;

    for (let k = 0; k < toCreate; k++) {
      const client = clients[(i * 7 + k) % clients.length]!;
      const roomCount = ((i + k) % 3) + 1;
      const rooms = Array.from({ length: roomCount }, (_, r) => {
        const p = ROOM_PRESETS[(i + k + r) % ROOM_PRESETS.length]!;
        const result = calculateSlab({ inner_width: p.w, inner_length: p.l });
        return {
          input: { name: `Room ${r + 1}`, innerWidth: p.w, innerLength: p.l },
          result,
        };
      });
      const roomsSubtotal = rooms.reduce((s, r) => s + r.result.subtotal, 0);
      const totalArea = rooms.reduce((s, r) => s + r.result.monolith_area, 0);
      const totalBlocks = rooms.reduce((s, r) => s + r.result.total_blocks, 0);
      const totalBeams = rooms.reduce((s, r) => s + r.result.beam_count, 0);
      const deliveryCost = 400_000 + ((i + k) % 5) * 100_000;
      const totalPrice = roomsSubtotal + deliveryCost;

      // Spread placedAt across the month (days 3, 7, 12, 17, 22, 26).
      const dayOfMonth = 3 + ((k * 5) % 24);
      const placedAt = new Date(y, m - 1, dayOfMonth, 10 + (k % 7), 30, 0, 0);
      const scheduledAt = new Date(placedAt);
      scheduledAt.setDate(scheduledAt.getDate() + 3);

      const project = await prisma.project.create({
        data: {
          clientId: client.id,
          name: `Seed · ${y}-${String(m).padStart(2, "0")} · #${k + 1}`,
          shapeType: "RECTANGULAR",
          dimensions: { width: rooms[0]!.input.innerWidth, length: rooms[0]!.input.innerLength },
          status: "ORDERED",
          calculations: {
            create: rooms.map((r) => calcResultToCreatePayload(r.input, r.result)),
          },
        },
        include: { calculations: true },
      });

      const orderNumber = nextOrderNumber(y, m, highestNumber);
      highestNumber = orderNumber;

      // Vary status + payment so the data feels realistic. The chart
      // ignores CANCELED but other states are all included.
      const status = (i + k) % 5 === 0 ? "DELIVERED" : "PLACED";
      const paymentState = (i + k) % 3 === 0 ? "FULLY_PAID" : "AWAITING_PAYMENT";
      const confirmedPaid = paymentState === "FULLY_PAID" ? totalPrice : 0;

      await prisma.order.create({
        data: {
          orderNumber,
          projectId: project.id,
          clientId: client.id,
          primaryCalculationId: project.calculations[0]?.id ?? null,
          status,
          paymentState,
          roomsSubtotal,
          discountPercent: 0,
          discountAmount: 0,
          deliveryCost,
          otherCost: 0,
          totalPrice,
          totalArea,
          totalBlocks,
          totalBeams,
          confirmedPaid,
          scheduledAt,
          placedAt,
          deliveredAt: status === "DELIVERED" ? placedAt : null,
          paidAt: paymentState === "FULLY_PAID" ? placedAt : null,
        },
      });
      totalCreated++;
    }
    console.log(`  ${y}-${String(m).padStart(2, "0")}  +${toCreate} orders`);
  }

  console.log(`\n✅ Seeded ${totalCreated} new orders across the last 12 months.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
