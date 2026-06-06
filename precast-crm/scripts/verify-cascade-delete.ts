// One-off: exercise the cascade-delete helpers against a REAL (seeded) local
// DB so we know prisma.delete() truly cascades every child without an FK
// error. Run after `npm run db:seed`. LOCAL ONLY — it deletes seeded rows.
import { prisma } from "../src/lib/prisma";
import {
  deleteOrderCascade,
  deleteProjectCascade,
  deleteClientCascade,
} from "../src/lib/record-delete";

async function main() {
  let pass = true;

  // 1) deleteClientCascade on a client that has an order (with payments etc.)
  const client = await prisma.client.findFirst({
    where: { orders: { some: {} } },
    select: { id: true, name: true },
  });
  if (!client) throw new Error("No seeded client with an order — run npm run db:seed first");
  const oBefore = await prisma.order.count({ where: { clientId: client.id } });
  const pBefore = await prisma.payment.count({ where: { order: { clientId: client.id } } });
  await prisma.$transaction((tx) => deleteClientCascade(tx, client.id));
  const left = {
    client: await prisma.client.count({ where: { id: client.id } }),
    orders: await prisma.order.count({ where: { clientId: client.id } }),
    projects: await prisma.project.count({ where: { clientId: client.id } }),
    deals: await prisma.deal.count({ where: { clientId: client.id } }),
  };
  const clientOk = left.client === 0 && left.orders === 0 && left.projects === 0 && left.deals === 0;
  pass &&= clientOk;
  console.log(`client "${client.name}" (had ${oBefore} orders / ${pBefore} payments) -> left ${JSON.stringify(left)} ${clientOk ? "OK" : "FAIL"}`);

  // 2) deleteOrderCascade on any remaining order — children must vanish
  const order = await prisma.order.findFirst({ select: { id: true, orderNumber: true } });
  if (order) {
    await prisma.$transaction((tx) => deleteOrderCascade(tx, order.id));
    const oLeft = await prisma.order.count({ where: { id: order.id } });
    const payLeft = await prisma.payment.count({ where: { orderId: order.id } });
    const evLeft = await prisma.orderEvent.count({ where: { orderId: order.id } });
    const ok = oLeft === 0 && payLeft === 0 && evLeft === 0;
    pass &&= ok;
    console.log(`order ${order.orderNumber} -> order:${oLeft} payments:${payLeft} events:${evLeft} ${ok ? "OK" : "FAIL"}`);
  }

  // 3) deleteProjectCascade — prefer one that still has an order
  const proj =
    (await prisma.project.findFirst({ where: { orders: { some: {} } }, select: { id: true } })) ??
    (await prisma.project.findFirst({ select: { id: true } }));
  if (proj) {
    await prisma.$transaction((tx) => deleteProjectCascade(tx, proj.id));
    const left2 = await prisma.project.count({ where: { id: proj.id } });
    const ok = left2 === 0;
    pass &&= ok;
    console.log(`project delete -> left:${left2} ${ok ? "OK" : "FAIL"}`);
  }

  console.log(`\nRESULT: ${pass ? "PASS ✅" : "FAIL ❌"}`);
  process.exit(pass ? 0 : 1);
}

main()
  .catch((e) => {
    console.error("THREW:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
