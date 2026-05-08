import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { calculateSlab } from "../src/services/calculation-engine";
import { calcResultToCreatePayload } from "../src/lib/calc-persistence";
import { normalizePhone } from "../src/lib/phone";
import { nextOrderNumber, orderNumberMonthPrefix } from "../src/lib/order-number";
import { applyStockMovement } from "../src/lib/inventory";

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
  // Three demo clients have GRANTED consent so the contact-export feature
  // has something to work with on a fresh DB. The remaining two stay at
  // NOT_ASKED to exercise the disabled-checkbox path on the Clients page.
  type Consent = "GRANTED" | "DENIED" | "NOT_ASKED";
  const clientsRaw: Array<{
    name: string;
    phone: string;
    address: string;
    language: "UZ" | "RU";
    source: string;
    referenceConsent: Consent;
    consentNote?: string;
  }> = [
    { name: "Aliyev Construction", phone: "+998901112233", address: "Tashkent · Yunusobod",     language: "UZ", source: "Instagram", referenceConsent: "GRANTED",   consentNote: "OK to share with prospects in Tashkent" },
    { name: "Karimov LLC",         phone: "+998935554466", address: "Samarkand · Registan",     language: "UZ", source: "Referral",  referenceConsent: "GRANTED",   consentNote: "Confirmed by phone, Apr 2026" },
    { name: "BuildPro Group",      phone: "+998771234567", address: "Tashkent · Mirzo-Ulugbek", language: "RU", source: "Walk-in",   referenceConsent: "NOT_ASKED" },
    { name: "Yusupov & Sons",      phone: "+998909876543", address: "Bukhara · Old town",       language: "UZ", source: "Instagram", referenceConsent: "GRANTED",   consentNote: "Visits welcome on weekends" },
    { name: "Stroy-Master",        phone: "+998997778899", address: "Tashkent · Chilanzar",     language: "RU", source: "Referral",  referenceConsent: "DENIED",    consentNote: "Asked not to be contacted by other prospects" },
  ];

  const clients = [];
  for (const c of clientsRaw) {
    const phoneNorm = normalizePhone(c.phone);
    const client = await prisma.client.upsert({
      where: { phone: phoneNorm },
      update: {},
      create: {
        ...c,
        phone: phoneNorm,
        consentUpdatedAt: c.referenceConsent !== "NOT_ASKED" ? new Date() : null,
      },
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

  // ── Production entries (last 7 days) + initial inventory ────────
  // Two batches so the inventory page isn't empty on first run.
  // Quantities are intentionally larger than the seeded orders' demand,
  // so the existing seed orders (which seed already places as PLACED /
  // PAID) don't leave inventory in a weird negative state if a developer
  // marks them DELIVERED to test the decrement.
  const productionRuns = [
    {
      daysAgo: 6,
      lines: [
        { kind: "BEAM" as const, beamLength: 4.30, quantity: 40 },
        { kind: "BEAM" as const, beamLength: 5.20, quantity: 25 },
        { kind: "BEAM" as const, beamLength: 6.30, quantity: 18 },
        { kind: "BLOCK" as const, beamLength: null, quantity: 1200 },
      ],
      notes: "Shift A · Monday casting batch",
    },
    {
      daysAgo: 2,
      lines: [
        { kind: "BEAM" as const, beamLength: 4.30, quantity: 30 },
        { kind: "BEAM" as const, beamLength: 6.30, quantity: 12 },
        { kind: "BLOCK" as const, beamLength: null, quantity: 800 },
      ],
      notes: "Shift B · top-up",
    },
  ];

  for (const run of productionRuns) {
    const producedAt = new Date();
    producedAt.setDate(producedAt.getDate() - run.daysAgo);

    await prisma.$transaction(async (tx) => {
      const entry = await tx.productionEntry.create({
        data: {
          producedAt,
          notes: run.notes,
          recordedById: sales.id,
        },
      });
      for (const line of run.lines) {
        await tx.productionLine.create({
          data: {
            productionEntryId: entry.id,
            kind: line.kind,
            beamLength: line.beamLength,
            quantity: line.quantity,
          },
        });
        await applyStockMovement(
          tx,
          { kind: line.kind, beamLength: line.beamLength, quantity: line.quantity },
          line.quantity,
          {
            reason: "PRODUCTION",
            productionEntryId: entry.id,
            actorId: sales.id,
          },
        );
      }
    });
  }

  console.log("✅ Seed complete");
  console.log("   Login: admin@precast.local / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
