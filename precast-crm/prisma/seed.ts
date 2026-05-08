import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { calculateSlab } from "../src/services/calculation-engine";
import { calcResultToCreatePayload } from "../src/lib/calc-persistence";
import { normalizePhone } from "../src/lib/phone";
import { nextOrderNumber } from "../src/lib/order-number";
import { applyStockMovement } from "../src/lib/inventory";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database…");

  // ── Users ──────────────────────────────────────────────────
  // Two OWNERS per spec — they're the only roles (besides ADMIN) that can
  // confirm/reject payments and resolve discrepancies. The first is the
  // confirmed real name; the second is a placeholder until the brother's
  // name is provided (TODO when known: replace owner2 below).
  const adminPwd = await bcrypt.hash("admin123", 10);
  const salesPwd = await bcrypt.hash("sales123", 10);
  const engPwd = await bcrypt.hash("eng123", 10);
  const opPwd = await bcrypt.hash("operator123", 10);
  const ownerPwd = await bcrypt.hash("owner123", 10);

  await prisma.user.upsert({
    where: { email: "admin@precast.local" },
    update: {},
    create: { name: "Admin", email: "admin@precast.local", passwordHash: adminPwd, role: "ADMIN" },
  });

  const sales = await prisma.user.upsert({
    where: { email: "sales@precast.local" },
    update: {},
    create: { name: "Sales Manager", email: "sales@precast.local", passwordHash: salesPwd, role: "SALES" },
  });

  await prisma.user.upsert({
    where: { email: "engineer@precast.local" },
    update: {},
    create: { name: "Engineer", email: "engineer@precast.local", passwordHash: engPwd, role: "ENGINEER" },
  });

  const operator = await prisma.user.upsert({
    where: { email: "operator@precast.local" },
    update: {},
    create: { name: "Bekzod (Operator)", email: "operator@precast.local", passwordHash: opPwd, role: "OPERATOR" },
  });

  const owner = await prisma.user.upsert({
    where: { email: "owner@precast.local" },
    update: {},
    create: { name: "Aziz Dadabaev", email: "owner@precast.local", passwordHash: ownerPwd, role: "OWNER" },
  });

  // TODO: replace "Owner Two" with the brother's real name once provided.
  await prisma.user.upsert({
    where: { email: "owner2@precast.local" },
    update: {},
    create: { name: "Owner Two", email: "owner2@precast.local", passwordHash: ownerPwd, role: "OWNER" },
  });

  // ── Drivers ────────────────────────────────────────────────
  const driversRaw = [
    { name: "Olimjon Karimov",   phone: "+998901001020", notes: "Lead driver, 12-ton truck" },
    { name: "Sherzod Tursunov",  phone: "+998935002030", notes: "Tashkent + Samarkand routes" },
    { name: "Diyor Yusupov",     phone: "+998771003040", notes: "Backup driver, weekends" },
  ];
  const drivers = [];
  for (const d of driversRaw) {
    drivers.push(
      await prisma.driver.upsert({
        where: { phone: normalizePhone(d.phone) },
        update: {},
        create: { name: d.name, phone: normalizePhone(d.phone), notes: d.notes },
      }),
    );
  }

  // ── Clients ────────────────────────────────────────────────
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
    { name: "Navoi Build",         phone: "+998930011223", address: "Navoi · Center",           language: "UZ", source: "Instagram", referenceConsent: "GRANTED" },
    { name: "Andijon Stroy",       phone: "+998934445566", address: "Andijon · Bobur 14",       language: "UZ", source: "Walk-in",   referenceConsent: "NOT_ASKED" },
  ];
  const clients = [];
  for (const c of clientsRaw) {
    const phoneNorm = normalizePhone(c.phone);
    clients.push(
      await prisma.client.upsert({
        where: { phone: phoneNorm },
        update: {},
        create: {
          ...c,
          phone: phoneNorm,
          consentUpdatedAt: c.referenceConsent !== "NOT_ASKED" ? new Date() : null,
        },
      }),
    );
  }

  // ── Demo orders covering every state in the new lifecycle ──
  // 1. PLACED, no payment
  // 2. IN_PRODUCTION, with a confirmed deposit
  // 3. DISPATCHED, active dispatch
  // 4. DELIVERED, cash collected, PENDING_CONFIRMATION
  // 5. DELIVERED, FULLY_PAID
  // 6. DELIVERED, with an OPEN Discrepancy
  type Scenario = {
    label: string;
    clientIdx: number;
    rooms: Array<{ name: string; innerWidth: number; innerLength: number }>;
    daysFromNow: number;
    discountPercent?: number;
    state:
      | "PLACED_NO_PAYMENT"
      | "IN_PRODUCTION_DEPOSIT"
      | "DISPATCHED_ACTIVE"
      | "DELIVERED_PENDING_CASH"
      | "DELIVERED_FULLY_PAID"
      | "DELIVERED_DISCREPANCY";
    driverIdx?: number;
    expectedCollection?: number;
    actualCash?: number; // for DELIVERED_DISCREPANCY (driver brought less)
  };

  const scenarios: Scenario[] = [
    { label: "Placed, no payment yet",        clientIdx: 0, rooms: [{ name: "Living room", innerWidth: 4, innerLength: 6 }], daysFromNow: 5,  state: "PLACED_NO_PAYMENT" },
    { label: "In production, deposit paid",   clientIdx: 5, rooms: [{ name: "Hall", innerWidth: 5, innerLength: 8 }],          daysFromNow: 6,  state: "IN_PRODUCTION_DEPOSIT" },
    { label: "Dispatched, en route",          clientIdx: 1, rooms: [{ name: "Kitchen", innerWidth: 4, innerLength: 6 }],       daysFromNow: 1,  state: "DISPATCHED_ACTIVE",     driverIdx: 0, expectedCollection: 5_000_000 },
    { label: "Delivered, cash pending owner", clientIdx: 3, rooms: [{ name: "Garage", innerWidth: 3, innerLength: 5 }],        daysFromNow: 0,  state: "DELIVERED_PENDING_CASH", driverIdx: 1, expectedCollection: 3_500_000, actualCash: 3_500_000 },
    { label: "Delivered, fully paid",         clientIdx: 5, rooms: [{ name: "Bedroom", innerWidth: 3.5, innerLength: 4.3 }],   daysFromNow: -2, state: "DELIVERED_FULLY_PAID",   driverIdx: 0, expectedCollection: 4_200_000, actualCash: 4_200_000, discountPercent: 5 },
    { label: "Delivered, OPEN discrepancy",   clientIdx: 6, rooms: [{ name: "Office", innerWidth: 4, innerLength: 7 }],        daysFromNow: -1, state: "DELIVERED_DISCREPANCY",  driverIdx: 2, expectedCollection: 6_000_000, actualCash: 5_500_000 },
  ];

  const placedAt = new Date();
  const year = placedAt.getFullYear();
  const month = placedAt.getMonth() + 1;
  let highest: string | null = null;

  for (const sc of scenarios) {
    const client = clients[sc.clientIdx];
    const computed = sc.rooms.map((r) => ({
      input: r,
      result: calculateSlab({ inner_width: r.innerWidth, inner_length: r.innerLength }),
    }));
    const roomsSubtotal = computed.reduce((s, c) => s + c.result.subtotal, 0);
    const totalArea = computed.reduce((s, c) => s + c.result.monolith_area, 0);
    const totalBlocks = computed.reduce((s, c) => s + c.result.total_blocks, 0);
    const totalBeams = computed.reduce((s, c) => s + c.result.beam_count, 0);
    const discountPercent = sc.discountPercent ?? 0;
    const discountAmount = roomsSubtotal * (discountPercent / 100);
    const deliveryCost = 500_000;
    const totalPrice = roomsSubtotal - discountAmount + deliveryCost;

    const scheduledAt = new Date(placedAt);
    scheduledAt.setDate(scheduledAt.getDate() + sc.daysFromNow);

    const project = await prisma.project.create({
      data: {
        clientId: client.id,
        name: `Project · ${sc.label}`,
        shapeType: "RECTANGULAR",
        dimensions: { width: sc.rooms[0].innerWidth, length: sc.rooms[0].innerLength },
        status: "ORDERED",
        calculations: { create: computed.map((c) => calcResultToCreatePayload(c.input, c.result)) },
      },
      include: { calculations: true },
    });

    const deal = await prisma.deal.create({
      data: { clientId: client.id, stage: "WON", status: "WON", value: totalPrice, assignedToId: sales.id },
    });
    await prisma.project.update({ where: { id: project.id }, data: { dealId: deal.id } });

    const orderNumber = nextOrderNumber(year, month, highest);
    highest = orderNumber;

    // Map scenario state → final order/payment state
    const orderStatus =
      sc.state === "PLACED_NO_PAYMENT" ? "PLACED" :
      sc.state === "IN_PRODUCTION_DEPOSIT" ? "IN_PRODUCTION" :
      sc.state === "DISPATCHED_ACTIVE" ? "DISPATCHED" :
      "DELIVERED";

    const order = await prisma.order.create({
      data: {
        orderNumber,
        projectId: project.id,
        clientId: client.id,
        primaryCalculationId: project.calculations[0]?.id ?? null,
        status: orderStatus,
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
        productionStartedAt: orderStatus !== "PLACED" ? placedAt : null,
        deliveredAt: orderStatus === "DELIVERED" ? placedAt : null,
      },
    });

    await prisma.orderEvent.create({
      data: { orderId: order.id, type: "ORDER_PLACED", message: `Seeded · ${sc.label}` },
    });

    // Payments + Dispatch + Discrepancy per scenario
    if (sc.state === "IN_PRODUCTION_DEPOSIT") {
      // Confirmed deposit (e.g. customer paid 30% bank transfer up front)
      const deposit = Math.round(totalPrice * 0.3);
      const p = await prisma.payment.create({
        data: {
          orderId: order.id,
          amount: deposit,
          method: "BANK_TRANSFER",
          status: "CONFIRMED",
          recordedById: operator.id,
          recordedAt: placedAt,
          confirmedById: owner.id,
          confirmedAt: placedAt,
        },
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { confirmedPaid: deposit, paymentState: "PARTIALLY_PAID" },
      });
      await prisma.orderEvent.create({
        data: { orderId: order.id, type: "PAYMENT_CONFIRMED", message: `Confirmed deposit ${deposit}`, payload: { paymentId: p.id, amount: deposit } },
      });
    }

    if (sc.state === "DISPATCHED_ACTIVE" || sc.state === "DELIVERED_PENDING_CASH" || sc.state === "DELIVERED_FULLY_PAID" || sc.state === "DELIVERED_DISCREPANCY") {
      const driver = drivers[sc.driverIdx!];
      const dispatch = await prisma.dispatch.create({
        data: {
          orderId: order.id,
          driverId: driver.id,
          truckIdentifier: "01 A 123 BC",
          expectedCollection: sc.expectedCollection!,
          dispatchedById: operator.id,
          dispatchedAt: placedAt,
          // Returned only for the post-delivery scenarios
          returnedAt: sc.state.startsWith("DELIVERED_") ? placedAt : null,
        },
      });
      await prisma.orderEvent.create({
        data: { orderId: order.id, type: "ORDER_DISPATCHED", message: `Dispatched: driver ${driver.name}`, payload: { dispatchId: dispatch.id, driverId: driver.id, expectedCollection: sc.expectedCollection } },
      });
    }

    if (sc.state === "DELIVERED_PENDING_CASH") {
      const driver = drivers[sc.driverIdx!];
      const p = await prisma.payment.create({
        data: {
          orderId: order.id,
          amount: sc.actualCash!,
          method: "CASH",
          status: "PENDING_CONFIRMATION",
          recordedById: operator.id,
          recordedAt: placedAt,
          collectedById: driver.id,
          collectedAt: placedAt,
          handedOverToOfficeById: operator.id,
          handedOverToOfficeAt: placedAt,
        },
      });
      await prisma.orderEvent.create({
        data: { orderId: order.id, type: "PAYMENT_RECORDED", message: `Cash collected: ${sc.actualCash} (pending)`, payload: { paymentId: p.id, amount: sc.actualCash } },
      });
    }

    if (sc.state === "DELIVERED_FULLY_PAID") {
      const driver = drivers[sc.driverIdx!];
      const p = await prisma.payment.create({
        data: {
          orderId: order.id,
          amount: sc.actualCash!,
          method: "CASH",
          status: "CONFIRMED",
          recordedById: operator.id,
          recordedAt: placedAt,
          collectedById: driver.id,
          collectedAt: placedAt,
          handedOverToOfficeById: operator.id,
          handedOverToOfficeAt: placedAt,
          confirmedById: owner.id,
          confirmedAt: placedAt,
        },
      });
      // Adjust paymentState
      await prisma.order.update({
        where: { id: order.id },
        data: {
          confirmedPaid: sc.actualCash!,
          paymentState: sc.actualCash! >= totalPrice ? "FULLY_PAID" : "PARTIALLY_PAID",
          paidAt: sc.actualCash! >= totalPrice ? placedAt : null,
        },
      });
      await prisma.orderEvent.create({
        data: { orderId: order.id, type: "PAYMENT_CONFIRMED", message: `Confirmed cash ${sc.actualCash}`, payload: { paymentId: p.id, amount: sc.actualCash } },
      });
    }

    if (sc.state === "DELIVERED_DISCREPANCY") {
      const driver = drivers[sc.driverIdx!];
      const expected = sc.expectedCollection!;
      const received = sc.actualCash!;
      const shortfall = expected - received;
      const p = await prisma.payment.create({
        data: {
          orderId: order.id,
          amount: received,
          method: "CASH",
          status: "CONFIRMED",
          recordedById: operator.id,
          recordedAt: placedAt,
          collectedById: driver.id,
          collectedAt: placedAt,
          handedOverToOfficeById: operator.id,
          handedOverToOfficeAt: placedAt,
          confirmedById: owner.id,
          confirmedAt: placedAt,
        },
      });
      await prisma.discrepancy.create({
        data: {
          orderId: order.id,
          paymentId: p.id,
          driverId: driver.id,
          expectedAmount: expected,
          receivedAmount: received,
          shortfall,
          status: "OPEN",
          reportedById: owner.id,
          reportedAt: placedAt,
          resolutionNote: "Customer said they'll pay the rest by Friday — to follow up.",
        },
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { confirmedPaid: received, paymentState: "PARTIALLY_PAID" },
      });
      await prisma.orderEvent.create({
        data: { orderId: order.id, type: "DISCREPANCY_OPENED", message: `Discrepancy OPEN: short by ${shortfall}`, payload: { expected, received, shortfall } },
      });
    }
  }

  // ── A LOST deal with no project (just a NEW_LEAD that didn't convert) ──
  await prisma.deal.create({
    data: { clientId: clients[2].id, stage: "LOST", status: "LOST", value: 0, assignedToId: sales.id },
  });

  // ── Production entries (last 7 days) + initial inventory ────────
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
        data: { producedAt, notes: run.notes, recordedById: sales.id },
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
          { reason: "PRODUCTION", productionEntryId: entry.id, actorId: sales.id },
        );
      }
    });
  }

  console.log("✅ Seed complete");
  console.log("   Logins:");
  console.log("     admin@precast.local        / admin123      (ADMIN)");
  console.log("     owner@precast.local        / owner123      (OWNER · Aziz Dadabaev)");
  console.log("     owner2@precast.local       / owner123      (OWNER · TODO replace name)");
  console.log("     operator@precast.local     / operator123   (OPERATOR · Bekzod)");
  console.log("     sales@precast.local        / sales123      (SALES)");
  console.log("     engineer@precast.local     / eng123        (ENGINEER)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
