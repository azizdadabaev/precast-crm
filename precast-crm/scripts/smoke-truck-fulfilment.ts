/**
 * LOCAL end-to-end smoke for truck fulfilment (spec 2026-10-06 §11).
 * Drives the real routes over HTTP against `next dev` and checks the database.
 *
 *   npm run dev -- -p 3100          # in another terminal, local DB only
 *   BASE_URL=http://localhost:3100 npx tsx scripts/smoke-truck-fulfilment.ts
 *
 * Refuses to run unless BASE_URL is localhost AND .env points at localhost.
 * Needs the seed users (`npm run db:seed`). Prints PASS/FAIL per check and
 * exits 1 on any failure. Writes test orders — never run it on a real DB.
 */
import { readFileSync } from "fs";
import { spawnSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { dayKey } from "../src/lib/dashboard-metrics";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const envFile = readFileSync(".env", "utf8");
const dbLine = envFile.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL")) ?? "";
if (!BASE.startsWith("http://localhost") || !dbLine.includes("@localhost")) {
  console.error("Refusing: smoke runs only against localhost with a localhost DATABASE_URL.");
  process.exit(2);
}

const prisma = new PrismaClient();
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failures += 1;
    console.log(`FAIL  ${name}`, detail === undefined ? "" : JSON.stringify(detail));
  }
}
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;

type Res = { status: number; body: { ok?: boolean; data?: any; error?: string; message?: string } };
async function call(token: string, method: string, path: string, json?: unknown): Promise<Res> {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(json !== undefined ? { "content-type": "application/json" } : {}) },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  const text = await r.text();
  let body: Res["body"] = {};
  try { body = JSON.parse(text); } catch { body = { error: text.slice(0, 200) }; }
  return { status: r.status, body };
}
async function multipart(token: string, path: string, fields: Record<string, string>): Promise<Res> {
  const fd = new FormData();
  fd.append("file", new Blob([PNG], { type: "image/png" }), "truck.png");
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: fd });
  const text = await r.text();
  let body: Res["body"] = {};
  try { body = JSON.parse(text); } catch { body = { error: text.slice(0, 200) }; }
  return { status: r.status, body };
}
async function login(loginName: string): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ loginName, pin: "1234", client: "android" }),
  });
  const j = await r.json();
  if (!j?.data?.token) throw new Error(`login failed for ${loginName}: ${JSON.stringify(j)}`);
  return j.data.token as string;
}
const msg = (r: Res) => `${r.body.error ?? ""} ${r.body.message ?? ""}`;
async function stock(): Promise<Map<string, number>> {
  const items = await prisma.inventoryItem.findMany();
  return new Map(items.map((i) => [`${i.kind}:${i.beamLength == null ? "" : Number(i.beamLength).toFixed(2)}`, i.quantity]));
}
const delta = (a: Map<string, number>, b: Map<string, number>, k: string) => (b.get(k) ?? 0) - (a.get(k) ?? 0);
const localMidnight = (offsetDays: number) => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate() + offsetDays);
};
const room = (name: string, innerWidth: number, innerLength: number) => ({ name, innerWidth, innerLength });

async function placeOrder(owner: string, rooms: ReturnType<typeof room>[], scheduledAt: Date) {
  const r = await call(owner, "POST", "/api/orders", {
    clientName: "Smoke Test",
    clientPhone: `99890${Math.floor(1000000 + Math.random() * 8999999)}`,
    clientAddress: "Тошкент шаҳри",
    rooms,
    scheduledAt: scheduledAt.toISOString(),
  });
  if (r.status !== 201 && r.status !== 200) throw new Error(`place order: ${r.status} ${msg(r)}`);
  const id = (r.body.data?.order?.id ?? r.body.data?.id) as string;
  return (await call(owner, "GET", `/api/orders/${id}`)).body.data;
}
const calcsByLength = (order: any) => {
  const m: Record<string, { beams: number; area: number; blocks: number }> = {};
  for (const c of order.project.calculations) {
    const k = Number(c.beamLength).toFixed(2);
    m[k] = m[k] ?? { beams: 0, area: 0, blocks: 0 };
    m[k].beams += c.beamCount; m[k].area += Number(c.monolithArea); m[k].blocks += c.totalBlocks;
  }
  return m;
};

async function main() {
  // Owner gets the shipped-order permission for this run (local DB only).
  const ownerUser = await prisma.user.findFirstOrThrow({ where: { loginName: "Aziz Dadabaev" } });
  if (!ownerUser.permissions.includes("order.editShipped")) {
    await prisma.user.update({ where: { id: ownerUser.id }, data: { permissions: { push: "order.editShipped" } } });
  }
  const owner = await login("Aziz Dadabaev");
  const sales = await login("Sales Manager");

  // ── A. Split order ────────────────────────────────────────────────
  console.log("\n== A. split order ==");
  const sched = localMidnight(2);
  let order = await placeOrder(owner, [room("R1", 3.77, 7), room("R2", 4, 13), room("R3", 3, 11.6)], sched);
  const L = calcsByLength(order);
  const keys = Object.keys(L).sort();
  check("order has three beam lengths", keys.length === 3, keys);
  const [kA, kB] = ["4.07", "4.30"];
  const kRest = keys.find((k) => k !== kA && k !== kB)!;

  const s1 = (await call(owner, "POST", `/api/orders/${order.id}/shipments`)).body.data;
  const s2 = (await call(owner, "POST", `/api/orders/${order.id}/shipments`)).body.data;
  check("two shipments created", !!s1?.id && !!s2?.id);

  // Calendar is checked as before/after deltas: seed or earlier smoke orders
  // may share these days.
  const capRange = `from=${localMidnight(-1).toISOString()}&to=${localMidnight(10).toISOString()}`;
  const capArea = async (k: string) =>
    ((await call(owner, "GET", `/api/orders/capacity?${capRange}`)).body.data.days.find((d: any) => d.date === k)?.totalArea ?? 0) as number;
  const today = dayKey(new Date());
  const schedKey = dayKey(sched);
  const todayBefore = await capArea(today);
  const schedBefore = await capArea(schedKey);

  let before = await stock();
  const truck1Blocks = 500;
  let r = await multipart(owner, `/api/orders/${order.id}/shipments/${s1.id}/load`, {
    loadedBeams: JSON.stringify({ [kA]: L[kA].beams, [kB]: L[kB].beams }),
    loadedBlocks: String(truck1Blocks),
  });
  check("truck 1 loads", r.status === 200, msg(r));
  let after = await stock();
  check("truck 1 beams written off", delta(before, after, `BEAM:${kA}`) === -L[kA].beams && delta(before, after, `BEAM:${kB}`) === -L[kB].beams);
  check("truck 1 blocks written off", delta(before, after, "BLOCK:") === -truck1Blocks);
  const mv1 = await prisma.stockMovement.findMany({ where: { shipmentId: s1.id } });
  check("truck 1 movements carry the shipment", mv1.length === 3 && mv1.every((m) => m.reason === "DELIVERY" && m.orderId === order.id), mv1.length);
  const sh1 = await prisma.shipment.findUniqueOrThrow({ where: { id: s1.id } });
  const truck1Area = L[kA].area + L[kB].area;
  check("truck 1 m² saved from its beams", near(Number(sh1.loadedArea), truck1Area), { saved: Number(sh1.loadedArea), want: truck1Area });

  // Edit rules
  const editBody = (rooms: ReturnType<typeof room>[]) => ({ rooms, scheduledAt: sched.toISOString(), discountPercent: 0, discountAmount: 0, deliveryCost: 0, otherCost: 0 });
  r = await call(sales, "PATCH", `/api/orders/${order.id}/edit`, editBody([room("R1", 3.77, 7), room("R2", 4, 13), room("R3", 3, 11.6)]));
  check("sales cannot edit a partly shipped order (403)", r.status === 403 && msg(r).includes("Юк жўнатилган"), { status: r.status, m: msg(r) });
  r = await call(owner, "PATCH", `/api/orders/${order.id}/edit`, editBody([room("R1", 3.77, 7), room("R3", 3, 11.6)]));
  check("owner edit below loaded is refused (422)", r.status === 422 && msg(r).includes("Юкланганидан кам"), { status: r.status, m: msg(r) });
  r = await call(owner, "PATCH", `/api/orders/${order.id}/edit`, editBody([room("R1", 3.77, 7), room("R2", 4, 13), room("R3", 3, 11.6), room("R4", 4.8, 6)]));
  check("owner edit adding a room is accepted", r.status === 200, { status: r.status, m: msg(r) });
  order = (await call(owner, "GET", `/api/orders/${order.id}`)).body.data;
  const L2 = calcsByLength(order);
  const kNew = Object.keys(L2).find((k) => !keys.includes(k))!;
  check("edit added a new beam length", !!kNew, Object.keys(L2));
  const sh1b = await prisma.shipment.findUniqueOrThrow({ where: { id: s1.id } });
  check("truck 1 m² unchanged by the edit", Number(sh1b.loadedArea) === Number(sh1.loadedArea));

  // Calendar + day list
  const leftArea = L2[kRest].area + L2[kNew].area;
  const todayAfter = await capArea(today);
  const schedAfter = await capArea(schedKey);
  check("calendar: today gained exactly truck 1", near(todayAfter - todayBefore, truck1Area, 0.05), { todayBefore, todayAfter, truck1Area });
  // Before truck 1 the scheduled day held the whole (pre-edit) order; now only what is left.
  check("calendar: scheduled day carries only what is left", near(schedAfter - (schedBefore - Number(L[kA].area + L[kB].area + L[kRest].area)), leftArea, 0.05), { schedBefore, schedAfter, leftArea });
  let list = (await call(owner, "GET", `/api/orders?day=${today}`)).body.data;
  let row = list.items.find((o: any) => o.id === order.id);
  check("day list (today): order tagged with truck 1", row?.dayActivity?.trucks?.[0] === 1, row?.dayActivity);
  list = (await call(owner, "GET", `/api/orders?day=${schedKey}`)).body.data;
  row = list.items.find((o: any) => o.id === order.id);
  check("day list (scheduled): left-to-ship tag", row?.dayActivity?.leftToShip === true, row?.dayActivity);

  // Reschedule
  const moved = localMidnight(4);
  const movedBefore = await capArea(dayKey(moved));
  r = await call(owner, "PATCH", `/api/orders/${order.id}`, { scheduledAt: moved.toISOString() });
  check("reschedule succeeds", r.status === 200, msg(r));
  const movedAfter = await capArea(dayKey(moved));
  check("calendar: left-to-ship moved to the new day", near(movedAfter - movedBefore, leftArea, 0.05), { movedBefore, movedAfter, leftArea });
  check("calendar: old day released it", near(await capArea(schedKey), schedAfter - leftArea, 0.05));
  const ev = await prisma.orderEvent.findFirst({ where: { orderId: order.id, type: "SCHEDULED_DATE_CHANGED" } });
  check("reschedule logged SCHEDULED_DATE_CHANGED", !!ev);
  const priceAfterReschedule = (await call(owner, "GET", `/api/orders/${order.id}`)).body.data.totalPrice;
  check("reschedule did not re-price", priceAfterReschedule === order.totalPrice, { before: order.totalPrice, after: priceAfterReschedule });

  // Truck 2 = the rest
  before = await stock();
  const restBlocks = order.totalBlocks - truck1Blocks;
  r = await multipart(owner, `/api/orders/${order.id}/shipments/${s2.id}/load`, {
    loadedBeams: JSON.stringify({ [kRest]: L2[kRest].beams, [kNew]: L2[kNew].beams }),
    loadedBlocks: String(restBlocks),
  });
  check("truck 2 loads the rest", r.status === 200, msg(r));
  after = await stock();
  check("truck 2 stock written off", delta(before, after, "BLOCK:") === -restBlocks && delta(before, after, `BEAM:${kNew}`) === -L2[kNew].beams);

  for (const s of [s1, s2]) {
    const d = await call(owner, "POST", `/api/orders/${order.id}/shipments/${s.id}/dispatch`, {});
    const v = await call(owner, "POST", `/api/orders/${order.id}/shipments/${s.id}/deliver`);
    check(`truck ${s.number} dispatched + delivered`, d.status === 200 && v.status === 200, [msg(d), msg(v)]);
  }
  r = await call(owner, "POST", "/api/payments", { orderId: order.id, amount: Number(order.totalPrice), method: "CASH", source: "IN_OFFICE_CASH" });
  check("full payment recorded", r.status === 200 || r.status === 201, msg(r));
  const movesBefore = await prisma.stockMovement.count({ where: { orderId: order.id } });
  r = await call(owner, "PATCH", `/api/orders/${order.id}`, { status: "DELIVERED" });
  check("order marked delivered", r.status === 200, msg(r));
  const movesAfter = await prisma.stockMovement.count({ where: { orderId: order.id } });
  check("delivery writes off nothing more (trucks took it all)", movesAfter === movesBefore, { movesBefore, movesAfter });
  r = await call(owner, "PATCH", `/api/orders/${order.id}`, { scheduledAt: localMidnight(6).toISOString() });
  check("delivered order cannot be rescheduled (422)", r.status === 422, { status: r.status, m: msg(r) });

  const dash = (await call(owner, "GET", "/api/dashboard")).body.data;
  const monthKey = today.slice(0, 7);
  const vol = dash.loadedVolumeByMonth.find((m: any) => m.monthKey === monthKey);
  check("dashboard: loaded m² this month covers the whole order", (vol?.area ?? 0) >= Number(order.totalArea) - 0.1, { vol: vol?.area, order: order.totalArea });
  const ledger = (await call(owner, "GET", `/api/ledger?month=${monthKey}`)).body.data;
  const rows = ledger.rows.filter((x: any) => x.orderId === order.id && x.kind === "volume");
  check("ledger: one volume row per truck", rows.length === 2 && rows.every((x: any) => x.reason.includes("жўнатма")), rows.map((x: any) => x.reason));

  // ── B. Single truck ───────────────────────────────────────────────
  console.log("\n== B. single truck ==");
  const single = await placeOrder(owner, [room("S1", 3.6, 7)], localMidnight(1));
  before = await stock();
  r = await multipart(owner, `/api/orders/${single.id}/load`, {});
  check("single truck loads", r.status === 200, msg(r));
  after = await stock();
  const sL = calcsByLength(single);
  const sk = Object.keys(sL)[0];
  check("single truck stock written off at loading", delta(before, after, `BEAM:${sk}`) === -sL[sk].beams && delta(before, after, "BLOCK:") === -single.totalBlocks);
  const singleMoves = await prisma.stockMovement.count({ where: { orderId: single.id } });
  r = await multipart(owner, `/api/orders/${single.id}/delivery-proof`, { cashAmount: "0", noCashCollected: "true", noCashCollectedNote: "smoke test" });
  check("delivery proof accepted", r.status === 200, msg(r));
  check("delivery after single-truck load writes off nothing more", (await prisma.stockMovement.count({ where: { orderId: single.id } })) === singleMoves);
  before = await stock();
  r = await call(owner, "POST", `/api/orders/${single.id}/cancel`, { reason: "smoke" });
  check("cancel succeeds", r.status === 200, msg(r));
  after = await stock();
  check("cancel restocks exactly what was written off", delta(before, after, `BEAM:${sk}`) === sL[sk].beams && delta(before, after, "BLOCK:") === single.totalBlocks);

  // ── C. Backfill on a pre-release-shaped truck ─────────────────────
  console.log("\n== C. backfill ==");
  const legacy = await placeOrder(owner, [room("L1", 3.77, 7)], localMidnight(3));
  const ls = (await call(owner, "POST", `/api/orders/${legacy.id}/shipments`)).body.data;
  const lL = calcsByLength(legacy);
  const lk = Object.keys(lL)[0];
  // As if loaded before this release: counts saved, no m², no stock movement.
  await prisma.shipment.update({
    where: { id: ls.id },
    data: { status: "LOADED", loadedAt: new Date(), loadedBeams: { [lk]: lL[lk].beams }, loadedBlocks: 100 },
  });
  const dry = spawnSync("npx", ["tsx", "scripts/backfill-truck-fulfilment.ts"], { encoding: "utf8", shell: true });
  check("backfill dry run lists the truck and writes nothing", dry.stdout.includes(legacy.orderNumber) && (await prisma.stockMovement.count({ where: { shipmentId: ls.id } })) === 0, dry.stdout.slice(-400));
  const app = spawnSync("npx", ["tsx", "scripts/backfill-truck-fulfilment.ts", "--apply"], { encoding: "utf8", shell: true });
  const lsAfter = await prisma.shipment.findUniqueOrThrow({ where: { id: ls.id } });
  check("backfill apply saves m² and writes stock off once", near(Number(lsAfter.loadedArea), lL[lk].area) && (await prisma.stockMovement.count({ where: { shipmentId: ls.id } })) === 2, app.stdout.slice(-400));
  const again = spawnSync("npx", ["tsx", "scripts/backfill-truck-fulfilment.ts", "--apply"], { encoding: "utf8", shell: true });
  check("backfill is idempotent", (await prisma.stockMovement.count({ where: { shipmentId: ls.id } })) === 2, again.stdout.slice(-200));

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
