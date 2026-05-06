import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { calculateSlab } from "../src/services/calculation-engine";

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

  // ── Clients ────────────────────────────────────────────────
  const clientsData = [
    { name: "Aliyev Construction", phone: "+998901112233", location: "Tashkent", language: "UZ" as const, source: "Instagram" },
    { name: "Karimov LLC", phone: "+998935554466", location: "Samarkand", language: "UZ" as const, source: "Referral" },
    { name: "BuildPro Group", phone: "+998771234567", location: "Tashkent", language: "RU" as const, source: "Walk-in" },
    { name: "Yusupov & Sons", phone: "+998909876543", location: "Bukhara", language: "UZ" as const, source: "Instagram" },
    { name: "Stroy-Master", phone: "+998997778899", location: "Tashkent", language: "RU" as const, source: "Referral" },
  ];

  const clients = [];
  for (const c of clientsData) {
    const client = await prisma.client.upsert({
      where: { phone: c.phone },
      update: {},
      create: c,
    });
    clients.push(client);
  }

  // ── Deals + Projects + Calculations + Quotes ───────────────
  const dealConfigs: Array<{
    clientIdx: number;
    stage: "NEW_LEAD" | "CONTACTED" | "CALCULATION" | "QUOTE_SENT" | "WON" | "LOST";
    status: "OPEN" | "WON" | "LOST";
    rooms?: { name?: string; innerWidth: number; innerLength: number }[];
    addQuote?: boolean;
    discountPercent?: number;
    addPayment?: boolean;
  }> = [
    { clientIdx: 0, stage: "NEW_LEAD", status: "OPEN" },
    { clientIdx: 1, stage: "CONTACTED", status: "OPEN" },
    { clientIdx: 2, stage: "CALCULATION", status: "OPEN", rooms: [{ name: "Living room", innerWidth: 4, innerLength: 6 }] },
    { clientIdx: 3, stage: "QUOTE_SENT", status: "OPEN", rooms: [{ name: "Hall", innerWidth: 5, innerLength: 8 }], addQuote: true },
    { clientIdx: 4, stage: "WON", status: "WON", rooms: [
      { name: "Kitchen", innerWidth: 4, innerLength: 6 },
      { name: "Bedroom", innerWidth: 3.5, innerLength: 4.3 },
    ], addQuote: true, discountPercent: 5, addPayment: true },
    { clientIdx: 0, stage: "WON", status: "WON", rooms: [{ name: "Garage", innerWidth: 3, innerLength: 5 }], addQuote: true, addPayment: true },
    { clientIdx: 1, stage: "LOST", status: "LOST" },
  ];

  for (const cfg of dealConfigs) {
    const client = clients[cfg.clientIdx];
    const deal = await prisma.deal.create({
      data: {
        clientId: client.id,
        stage: cfg.stage,
        status: cfg.status,
        value: 0, // computed below if rooms exist
        assignedToId: sales.id,
      },
    });

    if (cfg.rooms && cfg.rooms.length) {
      const project = await prisma.project.create({
        data: {
          dealId: deal.id,
          name: `Project for ${client.name}`,
          shapeType: "RECTANGULAR",
          dimensions: { width: cfg.rooms[0].innerWidth, length: cfg.rooms[0].innerLength },
        },
      });

      const calcRows = [];
      for (const room of cfg.rooms) {
        const r = calculateSlab({ inner_width: room.innerWidth, inner_length: room.innerLength });
        const calc = await prisma.calculation.create({
          data: {
            projectId: project.id,
            name: room.name ?? null,
            innerWidth: r.inner_width,
            innerLength: r.inner_length,
            bearing: r.bearing,
            correction: r.correction,
            extraBeams: r.extra_beams,
            forceStartBeam: r.force_start_beam,
            patternOverride: null,
            pitches: r.pitches,
            remainder: r.remainder,
            pattern: r.pattern,
            patternAuto: r.pattern_auto,
            beamLength: r.beam_length,
            blocksPerRow: r.blocks_per_row,
            beamCount: r.beam_count,
            blockRows: r.block_rows,
            totalBlocks: r.total_blocks,
            monolithLength: r.monolith_length,
            billedLength: r.billed_length,
            monolithArea: r.monolith_area,
            billedArea: r.billed_area,
            concreteVolume: r.concrete_volume,
            m2Price: r.m2_price,
            extraBeamPricePerM: r.extra_beam_price_per_m,
            m2Cost: r.m2_cost,
            patternExtraCost: r.pattern_extra_cost,
            manualExtraBeamsCost: r.manual_extra_beams_cost,
            subtotal: r.subtotal,
          },
        });
        calcRows.push({ calc, result: r });
      }

      const roomsSubtotal = calcRows.reduce((s, c) => s + c.result.subtotal, 0);

      if (cfg.addQuote) {
        const discountPercent = cfg.discountPercent ?? 0;
        const discountAmount = roomsSubtotal * (discountPercent / 100);
        const deliveryCost = 500_000;
        const total = roomsSubtotal - discountAmount + deliveryCost;

        await prisma.quote.create({
          data: {
            projectId: project.id,
            calculationId: calcRows[0].calc.id,
            roomsSubtotal,
            discountPercent,
            discountAmount,
            deliveryCost,
            otherCost: 0,
            totalPrice: total,
            status: cfg.status === "WON" ? "ACCEPTED" : "SENT",
          },
        });

        await prisma.deal.update({ where: { id: deal.id }, data: { value: total } });

        if (cfg.addPayment) {
          await prisma.payment.create({
            data: {
              dealId: deal.id,
              amount: total,
              status: "PAID",
              method: "Bank transfer",
              paidAt: new Date(),
            },
          });
        }
      }
    }
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
