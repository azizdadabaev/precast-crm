import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { calculateSlab } from "../src/services/calculation-engine";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database…");

  // ── Users ──────────────────────────────────────────────────
  const adminPwd = await bcrypt.hash("admin123", 10);
  const salesPwd = await bcrypt.hash("sales123", 10);
  const engPwd = await bcrypt.hash("eng123", 10);

  const admin = await prisma.user.upsert({
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
    width?: number;
    length?: number;
    value: number;
    addQuote?: boolean;
    addPayment?: boolean;
  }> = [
    { clientIdx: 0, stage: "NEW_LEAD", status: "OPEN", value: 0 },
    { clientIdx: 1, stage: "CONTACTED", status: "OPEN", value: 0 },
    { clientIdx: 2, stage: "CALCULATION", status: "OPEN", width: 4, length: 6, value: 0 },
    { clientIdx: 3, stage: "QUOTE_SENT", status: "OPEN", width: 5, length: 8, value: 12_500_000, addQuote: true },
    { clientIdx: 4, stage: "WON", status: "WON", width: 6, length: 10, value: 18_750_000, addQuote: true, addPayment: true },
    { clientIdx: 0, stage: "WON", status: "WON", width: 3, length: 5, value: 7_200_000, addQuote: true, addPayment: true },
    { clientIdx: 1, stage: "LOST", status: "LOST", value: 0 },
  ];

  for (const cfg of dealConfigs) {
    const client = clients[cfg.clientIdx];
    const deal = await prisma.deal.create({
      data: {
        clientId: client.id,
        stage: cfg.stage,
        status: cfg.status,
        value: cfg.value,
        assignedToId: sales.id,
      },
    });

    if (cfg.width && cfg.length) {
      const project = await prisma.project.create({
        data: {
          dealId: deal.id,
          name: `Slab ${cfg.width}×${cfg.length}m for ${client.name}`,
          shapeType: "RECTANGULAR",
          dimensions: { width: cfg.width, length: cfg.length },
        },
      });

      const r = calculateSlab({ width: cfg.width, length: cfg.length });
      const calc = await prisma.calculation.create({
        data: {
          projectId: project.id,
          inputWidth: cfg.width,
          inputLength: cfg.length,
          beamLength: r.beam_length,
          rowsInitial: r.rows_initial,
          rowsFinal: r.rows_final,
          beamCount: r.beam_count,
          beamGroups: r.beam_groups as unknown as Prisma.InputJsonValue,
          blocksPerRow: r.blocks_per_row,
          totalBlocks: r.total_blocks,
          actualLength: r.actual_length,
          correctedLength: r.corrected_length,
          coveredArea: r.covered_area,
          delta: r.delta,
          concreteVolume: r.concrete_volume,
          constants: r.constants as unknown as Prisma.InputJsonValue,
        },
      });

      if (cfg.addQuote) {
        const beamCost = Math.round(r.beam_count * r.beam_length * 35_000);
        const blockCost = r.total_blocks * 12_000;
        const concreteCost = Math.round(r.concrete_volume * 850_000);
        const delivery = 500_000;
        const total = beamCost + blockCost + concreteCost + delivery;

        await prisma.quote.create({
          data: {
            projectId: project.id,
            calculationId: calc.id,
            beamCost,
            blockCost,
            concreteCost,
            deliveryCost: delivery,
            otherCost: 0,
            totalPrice: total,
            status: cfg.status === "WON" ? "ACCEPTED" : "SENT",
          },
        });
      }
    }

    if (cfg.addPayment) {
      await prisma.payment.create({
        data: {
          dealId: deal.id,
          amount: cfg.value,
          status: "PAID",
          method: "Bank transfer",
          paidAt: new Date(),
        },
      });
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
