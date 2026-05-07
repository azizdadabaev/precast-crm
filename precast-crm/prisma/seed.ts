import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { calculateSlab } from "../src/services/calculation-engine";
import { calcResultToCreatePayload } from "../src/lib/calc-persistence";
import { normalizePhone } from "../src/lib/phone";
import { nextOrderNumber, orderNumberMonthPrefix } from "../src/lib/order-number";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database…");

  // ── Users ──────────────────────────────────────────────────
  const adminPwd = await bcrypt.hash("admin123", 10);
  const salesPwd = await bcrypt.hash("sales123", 10);
  const engPwd = await bcrypt.hash("eng123", 10);

  await prisma.user.upsert({
    where: { email: "admin@precast.local" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@precast.local",
      passwordHash: adminPwd,
      role: "ADMIN",
    },
  });

  const sales = await prisma.user.upsert({
    where: { email: "sales@precast.local" },
    update: {},
    create: {
      name: "Sales Manager",
      email: "sales@precast.local",
      passwordHash: salesPwd,
      role: "SALES",
    },
  });

  await prisma.user.upsert({
    where: { email: "engineer@precast.local" },
    update: {},
    create: {
      name: "Engineer",
      email: "engineer@precast.local",
      passwordHash: engPwd,
      role: "ENGINEER",
    },
  });

  // ── Clients (phones stored digits-only for stable dedup) ────
  const clientsRaw = [
    { name: "Aliyev Construction", phone: "+998901112233", address: "Tashkent · Yunusobod", language: "UZ" as const, source: "Instagram" },
    { name: "Karimov LLC",         phone: "+998935554466", address: "Samarkand · Registan",  language: "UZ" as const, source: "Referral" },
    { name: "BuildPro Group",      phone: "+998771234567", address: "Tashkent · Mirzo-Ulugbek", language: "RU" as const, source: "Walk-in" },
    { name: "Yusupov & Sons",      phone: "+998909876543", address: "Bukhara · Old town",     language: "UZ" as const, source: "Instagram" },
    { name: "Stroy-Master",        phone: "+998997778899", address: "Tashkent · Chilanzar",   language: "RU" as const, source: "Referral" },
  ];

  const clients = [];
  for (const c of clientsRaw) {
    const phoneNorm = normalizePhone(c.phone);
    const client = await prisma.client.upsert({
      where: { phone: phoneNorm },
      update: {},
      create: { ...c, phone: phoneNorm },
    });
    clients.push(client);
  }

  // ── A few sample projects + orders ──────────────────────────
  // The seed creates:
  //   - 1 DRAFT project (saved on the calculator, not yet ordered)
  //   - 2 ORDERED projects with placed Orders + dates spread over the next 2 weeks
  //   - 1 LOST deal (no project)

  type SeedRoom = { name?: string; innerWidth: number; innerLength: number };
  type SeedScenario = {
    clientIdx: number;
    rooms: SeedRoom[];
    placeOrder: boolean;
    daysFromNow?: number; // for scheduledAt
    discountPercent?: number;
    paid?: boolean;
  };

  const scenarios: SeedScenario[] = [
    // Draft — saved during a phone call, not yet ordered
    { clientIdx: 0, rooms: [{ name: "Living room", innerWidth: 4, innerLength: 6 }], placeOrder: false },
    // Order #1 — placed, scheduled in 4 days
    { clientIdx: 2, rooms: [{ name: "Hall", innerWidth: 5, innerLength: 8 }], placeOrder: true, daysFromNow: 4 },
    // Order #2 — placed with discount and 2 rooms, scheduled in 10 days, paid
    {
      clientIdx: 4,
      rooms: [
        { name: "Kitchen", innerWidth: 4, innerLength: 6 },
        { name: "Bedroom", innerWidth: 3.5, innerLength: 4.3 },
      ],
      placeOrder: true,
      daysFromNow: 10,
      discountPercent: 5,
      paid: true,
    },
  ];

  const placedAt = new Date();
  const year = placedAt.getFullYear();
  const month = placedAt.getMonth() + 1;
  const monthPrefix = orderNumberMonthPrefix(year, month);
  let highestOrderNumber: string | null = null;

  for (const sc of scenarios) {
    const client = clients[sc.clientIdx];
    const computed = sc.rooms.map((room) => ({
      input: room,
      result: calculateSlab({ inner_width: room.innerWidth, inner_length: room.innerLength }),
    }));

    if (!sc.placeOrder) {
      // Draft — link to client up front (we already know who they are in seed)
      await prisma.project.create({
        data: {
          clientId: client.id,
          name: `Draft for ${client.name}`,
          shapeType: "RECTANGULAR",
          dimensions: { width: sc.rooms[0].innerWidth, length: sc.rooms[0].innerLength },
          status: "DRAFT",
          calculations: {
            create: computed.map((c) => calcResultToCreatePayload(c.input, c.result)),
          },
        },
      });
      continue;
    }

    const roomsSubtotal = computed.reduce((s, c) => s + c.result.subtotal, 0);
    const totalArea = computed.reduce((s, c) => s + c.result.monolith_area, 0);
    const totalBlocks = computed.reduce((s, c) => s + c.result.total_blocks, 0);
    const totalBeams = computed.reduce((s, c) => s + c.result.beam_count, 0);
    const discountPercent = sc.discountPercent ?? 0;
    const discountAmount = roomsSubtotal * (discountPercent / 100);
    const deliveryCost = 500_000;
    const totalPrice = roomsSubtotal - discountAmount + deliveryCost;

    const scheduledAt = new Date(placedAt);
    scheduledAt.setDate(scheduledAt.getDate() + (sc.daysFromNow ?? 7));

    // Project
    const project = await prisma.project.create({
      data: {
        clientId: client.id,
        name: `Project for ${client.name}`,
        shapeType: "RECTANGULAR",
        dimensions: { width: sc.rooms[0].innerWidth, length: sc.rooms[0].innerLength },
        status: "ORDERED",
        calculations: {
          create: computed.map((c) => calcResultToCreatePayload(c.input, c.result)),
        },
      },
      include: { calculations: true },
    });

    // Deal
    const deal = await prisma.deal.create({
      data: {
        clientId: client.id,
        stage: "WON",
        status: "WON",
        value: totalPrice,
        assignedToId: sales.id,
      },
    });
    await prisma.project.update({ where: { id: project.id }, data: { dealId: deal.id } });

    // Order number
    const orderNumber = nextOrderNumber(year, month, highestOrderNumber);
    highestOrderNumber = orderNumber;

    const order = await prisma.order.create({
      data: {
        orderNumber,
        projectId: project.id,
        clientId: client.id,
        primaryCalculationId: project.calculations[0]?.id ?? null,
        status: sc.paid ? "PAID" : "PLACED",
        roomsSubtotal,
        discountPercent,
        discountAmount,
        deliveryCost,
        otherCost: 0,
        totalPrice,
        totalArea,
        totalBlocks,
        totalBeams,
        scheduledAt,
        paidAt: sc.paid ? placedAt : null,
        notes: sc.discountPercent ? `${sc.discountPercent}% discount applied` : null,
      },
    });

    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        type: "ORDER_PLACED",
        message: `Seeded order for ${client.name}`,
        payload: { totalPrice, totalArea, scheduledAt: scheduledAt.toISOString() },
      },
    });

    if (sc.paid) {
      await prisma.payment.create({
        data: {
          dealId: deal.id,
          amount: totalPrice,
          status: "PAID",
          method: "Bank transfer",
          paidAt: placedAt,
        },
      });
    }

    void monthPrefix; // referenced for potential future use
  }

  // ── A LOST deal with no project (just a NEW_LEAD that didn't convert) ──
  await prisma.deal.create({
    data: {
      clientId: clients[1].id,
      stage: "LOST",
      status: "LOST",
      value: 0,
      assignedToId: sales.id,
    },
  });

  console.log("✅ Seed complete");
  console.log("   Login: admin@precast.local / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
