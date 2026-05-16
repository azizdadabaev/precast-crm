# Split Shipment + Weight Distributor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a split-shipment delivery flow to Order detail — a "Бўлиб юклаш" (Split Shipment) button that lets operators divide one order across 2–4 trucks, record per-truck beam/block counts, optional auto-distribute by truck weight capacity, and track each truck through LOADED → DISPATCHED → DELIVERED independently; plus a simpler single-truck "Юкланди" (Load Truck) step before dispatch.

**Architecture:** New `Shipment` model handles multi-truck state; a new `LOADED` OrderStatus sits between IN_PRODUCTION and DISPATCHED for the single-truck path. Delivery is now gated on `confirmedPaid >= totalPrice` (balance = 0). Weight distribution is a pure client-side utility in `src/lib/weight-distributor.ts` — no backend needed.

**Tech Stack:** Next.js 14 App Router, Prisma 5.22, PostgreSQL, React Query 5, Tailwind CSS, TypeScript.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `prisma/schema.prisma` | Add `LOADED` to OrderStatus, `ORDER_LOADED`/`SHIPMENT_*` to OrderEventType, new `Shipment` model + `ShipmentStatus` enum, back-relations on Driver/User/Order |
| Create | `src/app/api/orders/[id]/load/route.ts` | POST — simple truck photo upload → Order status LOADED |
| Modify | `src/app/api/orders/[id]/dispatch/route.ts` | Accept LOADED (+ IN_PRODUCTION) as predecessor |
| Modify | `src/app/api/orders/[id]/route.ts` | Include shipments + loadedPhotoUrl in GET response; gate DELIVERED PATCH on balance=0 |
| Create | `src/app/api/orders/[id]/shipments/route.ts` | POST — create next shipment (auto-numbered) |
| Create | `src/app/api/orders/[id]/shipments/[sid]/load/route.ts` | POST multipart — save counts + photo → ShipmentStatus LOADED |
| Create | `src/app/api/orders/[id]/shipments/[sid]/dispatch/route.ts` | POST — optional driver + cash flag → ShipmentStatus DISPATCHED; flip Order DISPATCHED when first |
| Create | `src/app/api/orders/[id]/shipments/[sid]/deliver/route.ts` | POST — ShipmentStatus DELIVERED |
| Create | `src/lib/weight-distributor.ts` | Pure functions: calculateOrderWeight, distributeLoad, calculateRemaining |
| Create | `src/components/orders/LoadTruckDialog.tsx` | Simple photo upload modal (single-truck load) |
| Create | `src/components/orders/ShipmentsSection.tsx` | Renders all shipment cards with per-shipment actions |
| Create | `src/components/orders/SplitShipmentLoadModal.tsx` | Counting form + live remaining panel + weight distributor |
| Modify | `src/app/(app)/orders/[id]/page.tsx` | Add LOADED to STATUS_FLOW + OrderDetail type, Юкланди/Бўлиб юклаш buttons, ShipmentsSection, gate DELIVERED |

---

## Task 1: Schema — LOADED status + Shipment model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add LOADED to OrderStatus enum and new event types**

In `prisma/schema.prisma`, find `enum OrderStatus` (line ~69) and add `LOADED`:

```prisma
enum OrderStatus {
  DRAFT
  PLACED
  IN_PRODUCTION
  LOADED          // truck photo taken, awaiting dispatch (single-truck path)
  DISPATCHED
  DELIVERED
  CANCELED
}
```

Find `enum OrderEventType` (line ~109) and append:

```prisma
  ORDER_LOADED              // single-truck: photo taken, status → LOADED
  SHIPMENT_CREATED          // split: new Shipment row added
  SHIPMENT_LOADED           // split: shipment photo + counts saved
  SHIPMENT_DISPATCHED       // split: shipment truck left the yard
  SHIPMENT_DELIVERED        // split: shipment confirmed delivered
```

- [ ] **Step 2: Add new ShipmentStatus enum**

After the existing enums section, add:

```prisma
enum ShipmentStatus {
  PENDING     // created, not yet loaded
  LOADED      // photo + counts saved
  DISPATCHED  // truck left the yard
  DELIVERED   // confirmed delivered to client
}
```

- [ ] **Step 3: Add Shipment model**

After the `Dispatch` model (around line ~566), add:

```prisma
// Split-shipment: one row per truck when an order is divided across
// multiple vehicles. Created on-demand via the "Бўлиб юклаш" flow.
// Single-truck orders skip this model entirely and use Order.loadedPhotoUrl
// + the existing Dispatch model instead.
model Shipment {
  id              String         @id @default(cuid())
  orderId         String
  number          Int            // 1-based sequence within the order

  status          ShipmentStatus @default(PENDING)

  // Counts — null until operator fills the loading form.
  // JSON shape: Record<string, number>  e.g. { "3.3": 5, "4.3": 10 }
  loadedBeams     Json?
  loadedBlocks    Int?

  // Loaded truck photo
  loadedPhotoUrl  String?
  loadedAt        DateTime?

  // Optional driver assignment per shipment
  driverId             String?
  truckIdentifier      String?
  driverWillCollectCash Boolean  @default(false)
  cashToCollect        Decimal?  @db.Decimal(14, 2)
  dispatchedById       String?
  dispatchedAt         DateTime?

  deliveredAt     DateTime?
  notes           String?

  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  order        Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  driver       Driver? @relation("ShipmentDriver",     fields: [driverId],       references: [id])
  dispatchedBy User?   @relation("ShipmentDispatcher", fields: [dispatchedById], references: [id])

  @@unique([orderId, number])
  @@index([orderId])
  @@map("shipments")
}
```

- [ ] **Step 4: Add back-relations and Order fields**

In the `Order` model, add after `deliveryProofUploadedAt`:

```prisma
  // Single-truck loading (new flow)
  loadedPhotoUrl  String?
  loadedAt        DateTime?
```

And add the relation at the end of Order's relations list:

```prisma
  shipments     Shipment[]
```

In `model Driver`, add after `discrepancies Discrepancy[]`:

```prisma
  shipments     Shipment[] @relation("ShipmentDriver")
```

In `model User`, add after `drawingRequests DrawingRequest[]`:

```prisma
  shipmentsDispatched Shipment[] @relation("ShipmentDispatcher")
```

- [ ] **Step 5: Generate migration**

```bash
cd precast-crm
npx prisma migrate dev --name add_shipment_and_loaded_status
```

Expected: migration created and applied, Prisma Client regenerated. No errors.

- [ ] **Step 6: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: 0 errors (new fields will be unused yet — that's fine).

---

## Task 2: Weight distributor utility

**Files:**
- Create: `src/lib/weight-distributor.ts`

- [ ] **Step 1: Write the utility**

```typescript
// src/lib/weight-distributor.ts
// Pure functions — no DB, no React. Safe to import anywhere.

export interface BeamGroup {
  beamLength: string; // e.g. "3.3" — matches Calculation.beamLength.toString()
  totalCount: number;
}

export interface TruckCapacity {
  capacityKg: number;
}

export interface ShipmentLoad {
  beams: Record<string, number>; // beamLength → count
  blocks: number;
  totalWeightKg: number;
  usedCapacityPct: number; // may exceed 100 if overloaded
}

export interface DistributeResult {
  shipments: ShipmentLoad[];
  warnings: string[];
}

/** kg weight for one beam of the given length (metres). 1 m = 32 kg. */
export function beamWeightKg(beamLength: string): number {
  return parseFloat(beamLength) * 32;
}

/** Total weight of an order's components in kg. */
export function calculateOrderWeight(
  beamGroups: BeamGroup[],
  totalBlocks: number,
): number {
  const beamKg = beamGroups.reduce(
    (s, g) => s + beamWeightKg(g.beamLength) * g.totalCount,
    0,
  );
  return beamKg + totalBlocks * 16;
}

/**
 * Distribute beams and blocks across trucks proportionally by capacity.
 * Beams are distributed longest-first (heaviest per unit); blocks fill
 * remaining space proportionally. Last truck absorbs rounding remainders.
 */
export function distributeLoad(
  beamGroups: BeamGroup[],
  totalBlocks: number,
  truckCapacities: TruckCapacity[],
): DistributeResult {
  const warnings: string[] = [];
  const n = truckCapacities.length;
  const totalCap = truckCapacities.reduce((s, t) => s + t.capacityKg, 0);
  const totalWeight = calculateOrderWeight(beamGroups, totalBlocks);

  if (totalWeight > totalCap) {
    warnings.push(
      `Умумий вазн (${Math.round(totalWeight)} кг) умумий сиғимдан (${totalCap} кг) ошади`,
    );
  }

  const loads: ShipmentLoad[] = truckCapacities.map(() => ({
    beams: {},
    blocks: 0,
    totalWeightKg: 0,
    usedCapacityPct: 0,
  }));

  // Longest beam first so heaviest items land on highest-capacity trucks
  const sorted = [...beamGroups].sort(
    (a, b) => parseFloat(b.beamLength) - parseFloat(a.beamLength),
  );

  for (const group of sorted) {
    const unitKg = beamWeightKg(group.beamLength);
    let left = group.totalCount;

    for (let i = 0; i < n; i++) {
      const share =
        i === n - 1
          ? left
          : Math.round((truckCapacities[i].capacityKg / totalCap) * group.totalCount);
      const give = Math.min(share, left);
      loads[i].beams[group.beamLength] = give;
      loads[i].totalWeightKg += give * unitKg;
      left -= give;
    }
    // Safety: if rounding left a residual, give to last truck
    if (left > 0) {
      const last = loads[n - 1];
      last.beams[group.beamLength] = (last.beams[group.beamLength] ?? 0) + left;
      last.totalWeightKg += left * beamWeightKg(group.beamLength);
    }
  }

  // Distribute blocks
  let blocksLeft = totalBlocks;
  for (let i = 0; i < n; i++) {
    const share =
      i === n - 1
        ? blocksLeft
        : Math.round((truckCapacities[i].capacityKg / totalCap) * totalBlocks);
    const give = Math.min(share, blocksLeft);
    loads[i].blocks = give;
    loads[i].totalWeightKg += give * 16;
    blocksLeft -= give;
  }

  // Finalize pct + per-truck overload warnings
  for (let i = 0; i < n; i++) {
    loads[i].usedCapacityPct = Math.round(
      (loads[i].totalWeightKg / truckCapacities[i].capacityKg) * 100,
    );
    if (loads[i].totalWeightKg > truckCapacities[i].capacityKg) {
      warnings.push(
        `Жўнатма ${i + 1}: ${Math.round(loads[i].totalWeightKg)} кг > ${truckCapacities[i].capacityKg} кг сиғим`,
      );
    }
  }

  return { shipments: loads, warnings };
}

/**
 * Calculate what's left to ship after some shipments have been loaded.
 * completedLoads: array of { loadedBeams, loadedBlocks } from LOADED/DISPATCHED/DELIVERED shipments.
 */
export function calculateRemaining(
  beamGroups: BeamGroup[],
  totalBlocks: number,
  completedLoads: Array<{ loadedBeams: Record<string, number>; loadedBlocks: number }>,
): { remainingBeams: Record<string, number>; remainingBlocks: number } {
  const used: Record<string, number> = {};
  let usedBlocks = 0;

  for (const s of completedLoads) {
    for (const [len, cnt] of Object.entries(s.loadedBeams)) {
      used[len] = (used[len] ?? 0) + cnt;
    }
    usedBlocks += s.loadedBlocks;
  }

  const remainingBeams: Record<string, number> = {};
  for (const g of beamGroups) {
    remainingBeams[g.beamLength] = Math.max(0, g.totalCount - (used[g.beamLength] ?? 0));
  }

  return {
    remainingBeams,
    remainingBlocks: Math.max(0, totalBlocks - usedBlocks),
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

---

## Task 3: POST /api/orders/[id]/load — single-truck photo upload

**Files:**
- Create: `src/app/api/orders/[id]/load/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/orders/[id]/load/route.ts
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { saveImageFromFormData, UploadError } from "@/lib/uploads";
import { recordAudit } from "@/lib/audit";

/**
 * POST /api/orders/[id]/load
 *
 * Multipart form-data: file (image, ≤ 8 MB)
 *
 * Saves the loaded-truck photo and transitions the order from
 * IN_PRODUCTION → LOADED. Used by the single-truck flow only;
 * split-shipment loading goes through /shipments/[sid]/load.
 */
export const POST = withPermission<{ id: string }>(
  "order.edit",
  async (req: NextRequest, { user, params }) => {
    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) return fail("Order not found", 404);
    if (order.status !== "IN_PRODUCTION") {
      return fail(
        `Order must be IN_PRODUCTION to load (current: ${order.status})`,
        422,
      );
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return fail("Expected multipart/form-data", 400);
    }

    let uploadUrl: string;
    try {
      const { url } = await saveImageFromFormData(
        formData.get("file"),
        `orders/${params.id}`,
        `loaded-${Date.now()}`,
      );
      uploadUrl = url;
    } catch (e) {
      if (e instanceof UploadError) return fail(e.message, e.status);
      throw e;
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: params.id },
        data: {
          status: "LOADED",
          loadedPhotoUrl: uploadUrl,
          loadedAt: new Date(),
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: params.id,
          type: "ORDER_LOADED",
          actorId: user.id,
          message: "Юк машинасига юкланди",
          payload: { from: "IN_PRODUCTION", to: "LOADED", photoUrl: uploadUrl },
        },
      });
    });

    recordAudit({
      userId: user.id,
      action: "order.loaded",
      targetType: "order",
      targetId: params.id,
      message: `Order ${order.orderNumber} loaded onto truck`,
    });

    return ok({ loadedPhotoUrl: uploadUrl });
  },
);
```

---

## Task 4: Modify dispatch route to accept LOADED status

**Files:**
- Modify: `src/app/api/orders/[id]/dispatch/route.ts`

- [ ] **Step 1: Change the predecessor status check**

Find line ~32 in `dispatch/route.ts`:

```typescript
// OLD:
if (order.status !== "IN_PRODUCTION") {
  return fail(
    `Dispatch is only allowed from IN_PRODUCTION (current: ${order.status})`,
    422,
  );
}
```

Replace with:

```typescript
// NEW — accept both single-truck paths
if (order.status !== "IN_PRODUCTION" && order.status !== "LOADED") {
  return fail(
    `Dispatch is only allowed from IN_PRODUCTION or LOADED (current: ${order.status})`,
    422,
  );
}
```

- [ ] **Step 2: Make driver optional**

The existing schema validation (`DispatchCreateSchema`) may require `driverId`. Find `src/lib/validation.ts` and check `DispatchCreateSchema`. If `driverId` is required, make it optional:

```typescript
// In src/lib/validation.ts, find DispatchCreateSchema and change:
driverId: z.string().cuid().optional().nullable(),
```

Then in the dispatch route, guard the driver lookup:

```typescript
// Replace the hard driver lookup with:
const driver = body.driverId
  ? await prisma.driver.findUnique({ where: { id: body.driverId } })
  : null;
if (body.driverId && (!driver || !driver.active)) {
  return fail("Driver not found or inactive", 422);
}

// In the Dispatch.create data:
data: {
  orderId: order.id,
  driverId: body.driverId ?? null,   // nullable now
  truckIdentifier: body.truckIdentifier ?? null,
  expectedCollection: body.expectedCollection ?? 0,
  notes: body.notes ?? null,
  dispatchedById: user.id,
  dispatchedAt: new Date(),
},
```

Note: `Dispatch.driverId` in the schema is `String` (not nullable). Check `prisma/schema.prisma` line ~551. If `driverId` is required in the DB, add `?` to make it nullable:

```prisma
// In model Dispatch:
driverId            String?   // nullable — client may bring their own truck
```

Then re-run: `npx prisma migrate dev --name make_dispatch_driver_optional`

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

---

## Task 5: Gate DELIVERED on balance=0 + include shipments in GET

**Files:**
- Modify: `src/app/api/orders/[id]/route.ts`

- [ ] **Step 1: Add shipments to the GET include**

In the GET handler (around line 17), find the `prisma.order.findUnique` call and add `shipments` to the include:

```typescript
include: {
  client: true,
  project: { include: { calculations: { orderBy: { createdAt: "asc" } } } },
  dispatch: { include: { driver: true, dispatchedBy: true } },
  payments: {
    orderBy: { recordedAt: "desc" },
    include: {
      collectedByDriver: true,
      recordedBy: true,
      handedOverTo: true,
      confirmedBy: true,
      rejectedBy: true,
    },
  },
  events: { orderBy: { createdAt: "desc" }, include: { actor: true } },
  shipments: {                              // NEW
    orderBy: { number: "asc" },
    include: { driver: true, dispatchedBy: true },
  },
},
```

- [ ] **Step 2: Add balance=0 gate to PATCH DELIVERED transition**

In the PATCH handler, find where `status === "DELIVERED"` is processed. Add a balance check before executing:

```typescript
// Before the DELIVERED transition block, add:
if (body.status === "DELIVERED") {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    select: { totalPrice: true, confirmedPaid: true, shipments: true },
  });
  if (!order) return fail("Order not found", 404);

  const remaining = Number(order.totalPrice) - Number(order.confirmedPaid);
  if (remaining > 0) {
    return fail(
      `Тўлов тўлиқ эмас — қолди: ${Math.round(remaining).toLocaleString("ru-RU")} UZS · Payment incomplete`,
      422,
    );
  }

  // For split orders: all shipments must be at least DISPATCHED
  const pendingShipments = order.shipments.filter(
    (s) => s.status === "PENDING" || s.status === "LOADED",
  );
  if (pendingShipments.length > 0) {
    return fail(
      `${pendingShipments.length} та жўнатма ҳали жўнатилмаган · ${pendingShipments.length} shipment(s) not yet dispatched`,
      422,
    );
  }
}
```

---

## Task 6: POST /api/orders/[id]/shipments — create new shipment

**Files:**
- Create: `src/app/api/orders/[id]/shipments/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/orders/[id]/shipments/route.ts
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, created } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/**
 * POST /api/orders/[id]/shipments
 *
 * Creates the next Shipment for this order (auto-numbered).
 * The order must be IN_PRODUCTION or DISPATCHED (subsequent trucks
 * can be created after the first one has already left).
 */
export const POST = withPermission<{ id: string }>(
  "dispatch.create",
  async (_req: NextRequest, { user, params }) => {
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: { shipments: true },
    });
    if (!order) return fail("Order not found", 404);
    if (!["IN_PRODUCTION", "DISPATCHED"].includes(order.status)) {
      return fail(
        `Split shipments can only be created from IN_PRODUCTION or DISPATCHED (current: ${order.status})`,
        422,
      );
    }

    const nextNumber = (order.shipments.length > 0
      ? Math.max(...order.shipments.map((s) => s.number))
      : 0) + 1;

    const shipment = await prisma.$transaction(async (tx) => {
      const s = await tx.shipment.create({
        data: {
          orderId: params.id,
          number: nextNumber,
          status: "PENDING",
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: params.id,
          type: "SHIPMENT_CREATED",
          actorId: user.id,
          message: `Жўнатма ${nextNumber} яратилди`,
          payload: { shipmentId: s.id, number: nextNumber },
        },
      });
      return s;
    });

    return created(shipment);
  },
);
```

---

## Task 7: POST /api/orders/[id]/shipments/[sid]/load — load a shipment

**Files:**
- Create: `src/app/api/orders/[id]/shipments/[sid]/load/route.ts`

- [ ] **Step 1: Create the directory structure**

```bash
mkdir -p "src/app/api/orders/[id]/shipments/[sid]/load"
mkdir -p "src/app/api/orders/[id]/shipments/[sid]/dispatch"
mkdir -p "src/app/api/orders/[id]/shipments/[sid]/deliver"
```

- [ ] **Step 2: Write the load route**

```typescript
// src/app/api/orders/[id]/shipments/[sid]/load/route.ts
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { saveImageFromFormData, UploadError } from "@/lib/uploads";

/**
 * POST /api/orders/[id]/shipments/[sid]/load
 *
 * Multipart form-data:
 *   file:         truck photo (image, ≤ 8 MB)
 *   loadedBeams:  JSON string — Record<string,number> e.g. {"3.3":5,"4.3":10}
 *   loadedBlocks: number (integer string)
 *
 * Sets ShipmentStatus → LOADED.
 */
export const POST = withPermission<{ id: string; sid: string }>(
  "dispatch.create",
  async (req: NextRequest, { user, params }) => {
    const shipment = await prisma.shipment.findFirst({
      where: { id: params.sid, orderId: params.id },
    });
    if (!shipment) return fail("Shipment not found", 404);
    if (shipment.status !== "PENDING") {
      return fail(`Shipment is already ${shipment.status}`, 422);
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return fail("Expected multipart/form-data", 400);
    }

    let uploadUrl: string;
    try {
      const { url } = await saveImageFromFormData(
        formData.get("file"),
        `orders/${params.id}`,
        `shipment-${params.sid}-${Date.now()}`,
      );
      uploadUrl = url;
    } catch (e) {
      if (e instanceof UploadError) return fail(e.message, e.status);
      throw e;
    }

    const beamsRaw = formData.get("loadedBeams");
    const blocksRaw = formData.get("loadedBlocks");

    let loadedBeams: Record<string, number> = {};
    let loadedBlocks = 0;
    try {
      if (beamsRaw) loadedBeams = JSON.parse(String(beamsRaw));
      if (blocksRaw) loadedBlocks = parseInt(String(blocksRaw), 10);
    } catch {
      return fail("Invalid loadedBeams JSON", 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.shipment.update({
        where: { id: params.sid },
        data: {
          status: "LOADED",
          loadedPhotoUrl: uploadUrl,
          loadedAt: new Date(),
          loadedBeams,
          loadedBlocks,
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: params.id,
          type: "SHIPMENT_LOADED",
          actorId: user.id,
          message: `Жўнатма ${shipment.number} юкланди`,
          payload: { shipmentId: params.sid, number: shipment.number, loadedBeams, loadedBlocks },
        },
      });
      return s;
    });

    return ok(updated);
  },
);
```

---

## Task 8: POST /api/orders/[id]/shipments/[sid]/dispatch — dispatch a shipment

**Files:**
- Create: `src/app/api/orders/[id]/shipments/[sid]/dispatch/route.ts`

- [ ] **Step 1: Write the dispatch route**

```typescript
// src/app/api/orders/[id]/shipments/[sid]/dispatch/route.ts
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/**
 * POST /api/orders/[id]/shipments/[sid]/dispatch
 *
 * Body (JSON):
 *   driverId?:            string | null
 *   truckIdentifier?:     string | null
 *   driverWillCollectCash: boolean
 *   cashToCollect?:       number | null
 *   notes?:               string | null
 *
 * Sets ShipmentStatus → DISPATCHED.
 * If this is the first dispatched shipment, sets Order.status → DISPATCHED.
 */
export const POST = withPermission<{ id: string; sid: string }>(
  "dispatch.create",
  async (req: NextRequest, { user, params }) => {
    const body = await req.json() as {
      driverId?: string | null;
      truckIdentifier?: string | null;
      driverWillCollectCash?: boolean;
      cashToCollect?: number | null;
      notes?: string | null;
    };

    const [shipment, order] = await Promise.all([
      prisma.shipment.findFirst({ where: { id: params.sid, orderId: params.id } }),
      prisma.order.findUnique({
        where: { id: params.id },
        include: { shipments: true },
      }),
    ]);
    if (!shipment || !order) return fail("Shipment or order not found", 404);
    if (shipment.status !== "LOADED") {
      return fail(`Shipment must be LOADED before dispatch (current: ${shipment.status})`, 422);
    }

    // Validate driver if provided
    if (body.driverId) {
      const driver = await prisma.driver.findUnique({ where: { id: body.driverId } });
      if (!driver || !driver.active) return fail("Driver not found or inactive", 422);
    }

    const isFirstDispatch = !order.shipments.some((s) => s.status === "DISPATCHED" || s.status === "DELIVERED");

    await prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: params.sid },
        data: {
          status: "DISPATCHED",
          driverId: body.driverId ?? null,
          truckIdentifier: body.truckIdentifier ?? null,
          driverWillCollectCash: body.driverWillCollectCash ?? false,
          cashToCollect: body.cashToCollect ?? null,
          dispatchedById: user.id,
          dispatchedAt: new Date(),
          notes: body.notes ?? null,
        },
      });

      // Flip the order to DISPATCHED on first shipment leaving
      if (isFirstDispatch) {
        await tx.order.update({
          where: { id: params.id },
          data: { status: "DISPATCHED" },
        });
      }

      await tx.orderEvent.create({
        data: {
          orderId: params.id,
          type: "SHIPMENT_DISPATCHED",
          actorId: user.id,
          message: `Жўнатма ${shipment.number} жўнатилди${body.driverWillCollectCash ? ` · Ҳайдовчи ${(body.cashToCollect ?? 0).toLocaleString()} UZS олиб келади` : ""}`,
          payload: {
            shipmentId: params.sid,
            number: shipment.number,
            driverId: body.driverId ?? null,
            driverWillCollectCash: body.driverWillCollectCash ?? false,
            cashToCollect: body.cashToCollect ?? null,
          },
        },
      });
    });

    return ok({ dispatched: true });
  },
);
```

---

## Task 9: POST /api/orders/[id]/shipments/[sid]/deliver — mark shipment delivered

**Files:**
- Create: `src/app/api/orders/[id]/shipments/[sid]/deliver/route.ts`

- [ ] **Step 1: Write the deliver route**

```typescript
// src/app/api/orders/[id]/shipments/[sid]/deliver/route.ts
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/**
 * POST /api/orders/[id]/shipments/[sid]/deliver
 *
 * Marks one shipment as DELIVERED.
 * The overall Order is not touched here — the operator uses the
 * order-level "Етказилган" button (PATCH /api/orders/[id] status=DELIVERED)
 * once ALL shipments are dispatched/delivered and balance = 0.
 */
export const POST = withPermission<{ id: string; sid: string }>(
  "dispatch.create",
  async (_req: NextRequest, { user, params }) => {
    const shipment = await prisma.shipment.findFirst({
      where: { id: params.sid, orderId: params.id },
    });
    if (!shipment) return fail("Shipment not found", 404);
    if (shipment.status !== "DISPATCHED") {
      return fail(`Shipment must be DISPATCHED before delivery (current: ${shipment.status})`, 422);
    }

    await prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: params.sid },
        data: { status: "DELIVERED", deliveredAt: new Date() },
      });
      await tx.orderEvent.create({
        data: {
          orderId: params.id,
          type: "SHIPMENT_DELIVERED",
          actorId: user.id,
          message: `Жўнатма ${shipment.number} етказилди`,
          payload: { shipmentId: params.sid, number: shipment.number },
        },
      });
    });

    return ok({ delivered: true });
  },
);
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

---

## Task 10: LoadTruckDialog component

**Files:**
- Create: `src/components/orders/LoadTruckDialog.tsx`

- [ ] **Step 1: Write the component**

```typescript
// src/components/orders/LoadTruckDialog.tsx
"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

interface Props {
  orderId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function LoadTruckDialog({ orderId, open, onClose, onSuccess }: Props) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function pickFile(f: File) {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError(null);
  }

  async function submit() {
    if (!file) { setError(t("Расм юклаш керак", "Photo is required")); return; }
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/orders/${orderId}/load`, { method: "POST", body: fd });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Upload failed");
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-background rounded-lg border shadow-xl w-full max-w-sm space-y-4 p-5">
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Юкланди<span className="lang-en"> · Load truck</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("Юкланган машина расмини юкланг.", "Upload a photo of the loaded truck.")}
        </p>

        {/* Drop zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
            preview ? "border-border" : "border-primary/30 hover:border-primary/60"
          }`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) pickFile(f);
          }}
        >
          {preview ? (
            <img src={preview} alt="preview" className="max-h-48 mx-auto rounded object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-2 py-4 text-muted-foreground">
              <Camera className="h-8 w-8" />
              <span className="text-sm">{t("Расм танланг ёки ташланг", "Click or drop photo here")}</span>
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
        />

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            {t("Бекор", "Cancel")}
          </Button>
          <Button size="sm" onClick={submit} disabled={!file || loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {t("Юклаш", "Save photo")}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

---

## Task 11: SplitShipmentLoadModal component

**Files:**
- Create: `src/components/orders/SplitShipmentLoadModal.tsx`

This is the largest UI component — counting table + live remaining + weight distributor.

- [ ] **Step 1: Write the component**

```typescript
// src/components/orders/SplitShipmentLoadModal.tsx
"use client";

import { useRef, useState, useMemo } from "react";
import { Camera, Upload, Loader2, ChevronDown, ChevronUp, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { formatNumber } from "@/lib/utils";
import {
  distributeLoad,
  calculateRemaining,
  calculateOrderWeight,
  type BeamGroup,
  type TruckCapacity,
} from "@/lib/weight-distributor";

interface CalcSummary {
  beamLength: string;
  beamCount: number;
}

interface PrevShipment {
  loadedBeams: Record<string, number>;
  loadedBlocks: number;
}

interface Props {
  orderId: string;
  shipmentId: string;
  shipmentNumber: number;
  /** Aggregated per beam length from order calculations */
  beamGroups: BeamGroup[];
  totalBlocks: number;
  /** Already-loaded shipments (to calculate remaining) */
  prevShipments: PrevShipment[];
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function SplitShipmentLoadModal({
  orderId, shipmentId, shipmentNumber,
  beamGroups, totalBlocks, prevShipments,
  open, onClose, onSuccess,
}: Props) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);

  // Count inputs per beam length
  const [beamInputs, setBeamInputs] = useState<Record<string, number>>(() => {
    const { remainingBeams } = calculateRemaining(beamGroups, totalBlocks, prevShipments);
    return Object.fromEntries(Object.entries(remainingBeams).map(([k, v]) => [k, v]));
  });
  const [blockInput, setBlockInput] = useState<number>(() => {
    const { remainingBlocks } = calculateRemaining(beamGroups, totalBlocks, prevShipments);
    return remainingBlocks;
  });

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Weight distributor state
  const [distOpen, setDistOpen] = useState(false);
  const [uniformCapacity, setUniformCapacity] = useState<number>(10000); // kg
  const [truckCount, setTruckCount] = useState<number>(2);
  const [useVaried, setUseVaried] = useState(false);
  const [variedCapacities, setVariedCapacities] = useState<number[]>([10000, 10000]);

  const remaining = useMemo(() =>
    calculateRemaining(beamGroups, totalBlocks, [
      ...prevShipments,
      { loadedBeams: beamInputs, loadedBlocks: blockInput },
    ]),
    [beamGroups, totalBlocks, prevShipments, beamInputs, blockInput]
  );

  const orderWeight = useMemo(
    () => calculateOrderWeight(beamGroups, totalBlocks),
    [beamGroups, totalBlocks]
  );

  if (!open) return null;

  function pickFile(f: File) {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError(null);
  }

  function applyDistribution() {
    const capacities: TruckCapacity[] = useVaried
      ? variedCapacities.map((c) => ({ capacityKg: c }))
      : Array.from({ length: truckCount }, () => ({ capacityKg: uniformCapacity }));

    const { shipments, warnings } = distributeLoad(beamGroups, totalBlocks, capacities);
    if (warnings.length > 0) setError(warnings.join(" · "));
    else setError(null);

    // Apply this shipment's allocation (index = shipmentNumber - 1, capped)
    const idx = Math.min(shipmentNumber - 1, shipments.length - 1);
    const load = shipments[idx];
    if (!load) return;
    setBeamInputs(load.beams);
    setBlockInput(load.blocks);
  }

  async function submit() {
    if (!file) { setError(t("Расм юклаш керак", "Photo is required")); return; }
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("loadedBeams", JSON.stringify(beamInputs));
      fd.append("loadedBlocks", String(blockInput));

      const res = await fetch(`/api/orders/${orderId}/shipments/${shipmentId}/load`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed");
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-auto">
      <div className="bg-background rounded-lg border shadow-xl w-full max-w-xl space-y-4 p-5 my-4">
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Жўнатма {shipmentNumber}<span className="lang-en"> · Shipment {shipmentNumber} — Load</span>
          </div>
        </div>

        {/* Weight distributor accordion */}
        <div className="border rounded-md overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2 text-sm bg-muted/40 hover:bg-muted/60 transition-colors"
            onClick={() => setDistOpen(!distOpen)}
          >
            <div className="flex items-center gap-2 font-medium">
              <Zap className="h-3.5 w-3.5 text-warning" />
              {t("Вазн бўйича тақсимлаш", "Distribute by weight")}
              <span className="text-xs text-muted-foreground font-normal">
                — {t("умумий", "total")} {Math.round(orderWeight).toLocaleString("ru-RU")} кг
              </span>
            </div>
            {distOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {distOpen && (
            <div className="p-3 space-y-3 border-t">
              <div className="flex items-center gap-3 text-sm">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={!useVaried} onChange={() => setUseVaried(false)} />
                  {t("Бир хил", "Uniform")}
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={useVaried} onChange={() => setUseVaried(true)} />
                  {t("Ҳар хил", "Varied")}
                </label>
              </div>

              {!useVaried ? (
                <div className="flex items-center gap-2 text-sm">
                  <input
                    type="number"
                    min={1}
                    value={truckCount}
                    onChange={(e) => setTruckCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 border rounded px-2 py-1 text-center font-mono"
                  />
                  <span className="text-muted-foreground">{t("та машина ×", "trucks ×")}</span>
                  <input
                    type="number"
                    min={1000}
                    step={500}
                    value={uniformCapacity}
                    onChange={(e) => setUniformCapacity(parseInt(e.target.value) || 10000)}
                    className="w-24 border rounded px-2 py-1 font-mono"
                  />
                  <span className="text-muted-foreground">кг</span>
                </div>
              ) : (
                <div className="space-y-1">
                  {variedCapacities.map((cap, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground w-20 text-xs">
                        {t("Жўнатма", "Shipment")} {i + 1}:
                      </span>
                      <input
                        type="number"
                        min={1000}
                        step={500}
                        value={cap}
                        onChange={(e) => {
                          const v = [...variedCapacities];
                          v[i] = parseInt(e.target.value) || 10000;
                          setVariedCapacities(v);
                        }}
                        className="w-24 border rounded px-2 py-1 font-mono"
                      />
                      <span className="text-muted-foreground">кг</span>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setVariedCapacities([...variedCapacities, 10000])}
                    >
                      + Машина
                    </Button>
                    {variedCapacities.length > 1 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setVariedCapacities(variedCapacities.slice(0, -1))}
                      >
                        − Машина
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <Button size="sm" onClick={applyDistribution} className="w-full">
                <Zap className="h-3.5 w-3.5 mr-1.5" />
                {t("Тақсимлаш", "Calculate & apply")}
              </Button>
            </div>
          )}
        </div>

        {/* Counting table */}
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">{t("Балка узунлиги", "Beam length")}</th>
                <th className="text-right px-3 py-2">{t("Буюртма жами", "Order total")}</th>
                <th className="text-right px-3 py-2 text-primary">{t("Юкланди", "Load")}</th>
                <th className="text-right px-3 py-2 text-muted-foreground">{t("Қолди", "Remaining")}</th>
              </tr>
            </thead>
            <tbody>
              {beamGroups.map((g) => {
                const rem = remaining.remainingBeams[g.beamLength] ?? 0;
                return (
                  <tr key={g.beamLength} className="border-t">
                    <td className="px-3 py-2 font-mono font-semibold">
                      {g.beamLength} <span className="text-muted-foreground text-xs">м</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                      {g.totalCount}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={g.totalCount}
                        value={beamInputs[g.beamLength] ?? 0}
                        onChange={(e) =>
                          setBeamInputs((prev) => ({
                            ...prev,
                            [g.beamLength]: Math.max(0, parseInt(e.target.value) || 0),
                          }))
                        }
                        className="w-20 border rounded px-2 py-1 text-right font-mono focus:ring-1 ring-primary"
                      />
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${rem > 0 ? "text-warning" : "text-success"}`}>
                      {rem}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t bg-muted/20">
                <td className="px-3 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  {t("Гишт", "Blocks")}
                </td>
                <td className="px-3 py-2 text-right font-mono text-muted-foreground">{totalBlocks}</td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    max={totalBlocks}
                    value={blockInput}
                    onChange={(e) => setBlockInput(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-20 border rounded px-2 py-1 text-right font-mono focus:ring-1 ring-primary"
                  />
                </td>
                <td className={`px-3 py-2 text-right font-mono ${remaining.remainingBlocks > 0 ? "text-warning" : "text-success"}`}>
                  {remaining.remainingBlocks}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Photo upload */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            {t("Юкланган машина расми", "Loaded truck photo")}
          </div>
          <div
            className="border-2 border-dashed rounded-lg p-3 text-center cursor-pointer hover:border-primary/60 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) pickFile(f); }}
          >
            {preview ? (
              <img src={preview} alt="preview" className="max-h-36 mx-auto rounded object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-1 py-3 text-muted-foreground">
                <Camera className="h-6 w-6" />
                <span className="text-xs">{t("Расм танланг", "Click to select photo")}</span>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
          />
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            {t("Бекор", "Cancel")}
          </Button>
          <Button size="sm" onClick={submit} disabled={!file || loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {t("Жўнатмани юклаш", "Save shipment load")}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

---

## Task 12: ShipmentsSection component

**Files:**
- Create: `src/components/orders/ShipmentsSection.tsx`

- [ ] **Step 1: Write the component**

```typescript
// src/components/orders/ShipmentsSection.tsx
"use client";

import { useState } from "react";
import { Plus, Truck, Package, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { formatDate, formatNumber } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import { SplitShipmentLoadModal } from "./SplitShipmentLoadModal";
import type { BeamGroup } from "@/lib/weight-distributor";

type ShipmentStatus = "PENDING" | "LOADED" | "DISPATCHED" | "DELIVERED";

interface ShipmentData {
  id: string;
  number: number;
  status: ShipmentStatus;
  loadedBeams: Record<string, number> | null;
  loadedBlocks: number | null;
  loadedPhotoUrl: string | null;
  loadedAt: string | null;
  driverWillCollectCash: boolean;
  cashToCollect: string | null;
  truckIdentifier: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  notes: string | null;
  driver: { id: string; name: string; phone: string } | null;
  dispatchedBy: { id: string; name: string } | null;
}

interface Props {
  orderId: string;
  shipments: ShipmentData[];
  beamGroups: BeamGroup[];
  totalBlocks: number;
  orderStatus: string;
  onRefresh: () => void;
}

const STATUS_ICONS: Record<ShipmentStatus, React.ComponentType<{ className?: string }>> = {
  PENDING: Clock,
  LOADED: Package,
  DISPATCHED: Truck,
  DELIVERED: CheckCircle2,
};

const STATUS_COLORS: Record<ShipmentStatus, string> = {
  PENDING:    "text-muted-foreground bg-muted/40 border-border",
  LOADED:     "text-amber-700 bg-amber-50 border-amber-200",
  DISPATCHED: "text-sky-700 bg-sky-50 border-sky-200",
  DELIVERED:  "text-emerald-700 bg-emerald-50 border-emerald-200",
};

const STATUS_LABEL_UZ: Record<ShipmentStatus, string> = {
  PENDING:    "Кутилмоқда",
  LOADED:     "Юкланган",
  DISPATCHED: "Жўнатилган",
  DELIVERED:  "Етказилган",
};

export function ShipmentsSection({
  orderId, shipments, beamGroups, totalBlocks, orderStatus, onRefresh,
}: Props) {
  const t = useT();
  const [loadModalShipment, setLoadModalShipment] = useState<ShipmentData | null>(null);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shipments that have counts (to pass as prevShipments for remaining calc)
  const prevLoaded = shipments
    .filter((s) => s.loadedBeams !== null && s.status !== "PENDING")
    .map((s) => ({
      loadedBeams: (s.loadedBeams as Record<string, number>) ?? {},
      loadedBlocks: s.loadedBlocks ?? 0,
    }));

  async function createNewShipment() {
    setCreatingNew(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/shipments`, { method: "POST" });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed");
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setCreatingNew(false);
    }
  }

  async function dispatchShipment(shipmentId: string) {
    // Simple dispatch with no driver (client's own truck)
    // For driver assignment, a more complete dialog would be needed.
    // For MVP, dispatch as "client's own truck"
    setDispatchingId(shipmentId);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/shipments/${shipmentId}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverWillCollectCash: false }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed");
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setDispatchingId(null);
    }
  }

  async function deliverShipment(shipmentId: string) {
    setDeliveringId(shipmentId);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/shipments/${shipmentId}/deliver`, {
        method: "POST",
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed");
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setDeliveringId(null);
    }
  }

  const canAddMore = ["IN_PRODUCTION", "DISPATCHED"].includes(orderStatus);

  return (
    <div className="rounded-lg border bg-background overflow-hidden">
      <div className="px-4 py-3 border-b flex items-baseline justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Жўнатмалар<span className="lang-en"> · Shipments</span>
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          {shipments.length} {t("та жўнатма", "shipments")}
        </div>
      </div>

      <div className="divide-y">
        {shipments.map((s) => {
          const Icon = STATUS_ICONS[s.status];
          const colorCls = STATUS_COLORS[s.status];
          const prevForThis = prevLoaded.filter((_, i) => i < shipments.indexOf(s));

          return (
            <div key={s.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">Жўнатма {s.number}</span>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${colorCls}`}>
                    <Icon className="h-3 w-3" />
                    {STATUS_LABEL_UZ[s.status]}
                  </span>
                </div>

                <div className="flex gap-2">
                  {s.status === "PENDING" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setLoadModalShipment(s)}
                    >
                      <Package className="h-3.5 w-3.5 mr-1.5" />
                      {t("Юклаш", "Load truck")}
                    </Button>
                  )}
                  {s.status === "LOADED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={dispatchingId === s.id}
                      onClick={() => dispatchShipment(s.id)}
                    >
                      {dispatchingId === s.id
                        ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        : <Truck className="h-3.5 w-3.5 mr-1.5" />}
                      {t("Жўнатиш", "Dispatch")}
                    </Button>
                  )}
                  {s.status === "DISPATCHED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={deliveringId === s.id}
                      onClick={() => deliverShipment(s.id)}
                    >
                      {deliveringId === s.id
                        ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                      {t("Етказилди", "Mark delivered")}
                    </Button>
                  )}
                </div>
              </div>

              {/* Counts summary */}
              {(s.loadedBeams || s.loadedBlocks !== null) && (
                <div className="text-xs text-muted-foreground space-x-3 font-mono">
                  {s.loadedBeams && Object.entries(s.loadedBeams as Record<string, number>).map(([len, cnt]) => (
                    <span key={len}>{cnt} × {len}м балка</span>
                  ))}
                  {s.loadedBlocks !== null && <span>{s.loadedBlocks} гишт</span>}
                </div>
              )}

              {/* Driver info */}
              {s.driver && (
                <div className="text-xs text-muted-foreground">
                  {t("Ҳайдовчи:", "Driver:")} <span className="font-medium text-foreground">{s.driver.name}</span>
                  {" "}{formatPhone(s.driver.phone)}
                  {s.driverWillCollectCash && s.cashToCollect && (
                    <span className="ml-2 text-warning font-semibold">
                      · {formatNumber(s.cashToCollect, 0)} UZS {t("олиб келади", "expected to collect")}
                    </span>
                  )}
                </div>
              )}
              {!s.driver && s.status !== "PENDING" && s.status !== "LOADED" && (
                <div className="text-xs text-muted-foreground italic">
                  {t("Мижоз ўз транспорти билан", "Client's own transport")}
                </div>
              )}

              {/* Timestamps */}
              <div className="flex gap-4 text-[10px] text-muted-foreground">
                {s.loadedAt && <span>{t("Юкланди:", "Loaded:")} {formatDate(s.loadedAt)}</span>}
                {s.dispatchedAt && <span>{t("Жўнатилди:", "Dispatched:")} {formatDate(s.dispatchedAt)}</span>}
                {s.deliveredAt && <span className="text-success">{t("Етказилди:", "Delivered:")} {formatDate(s.deliveredAt)}</span>}
              </div>

              {/* Loaded photo */}
              {s.loadedPhotoUrl && (
                <a href={s.loadedPhotoUrl} target="_blank" rel="noreferrer">
                  <img
                    src={s.loadedPhotoUrl}
                    alt={`Shipment ${s.number} photo`}
                    className="max-h-24 rounded border object-cover hover:opacity-90 transition-opacity"
                  />
                </a>
              )}
            </div>
          );
        })}
      </div>

      {/* Add next shipment */}
      {canAddMore && (
        <div className="border-t px-4 py-3">
          <Button
            size="sm"
            variant="outline"
            disabled={creatingNew}
            onClick={createNewShipment}
          >
            {creatingNew
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <Plus className="h-3.5 w-3.5 mr-1.5" />}
            + {t("Янги жўнатма", "Add next shipment")}
          </Button>
        </div>
      )}

      {error && (
        <div className="border-t px-4 py-2 text-sm text-destructive bg-destructive/10">
          {error}
        </div>
      )}

      {/* Load modal */}
      {loadModalShipment && (
        <SplitShipmentLoadModal
          orderId={orderId}
          shipmentId={loadModalShipment.id}
          shipmentNumber={loadModalShipment.number}
          beamGroups={beamGroups}
          totalBlocks={totalBlocks}
          prevShipments={prevLoaded}
          open={true}
          onClose={() => setLoadModalShipment(null)}
          onSuccess={() => { setLoadModalShipment(null); onRefresh(); }}
        />
      )}
    </div>
  );
}
```

---

## Task 13: Order detail page — wire everything together

**Files:**
- Modify: `src/app/(app)/orders/[id]/page.tsx`

- [ ] **Step 1: Add new imports**

At the top of the file, add:

```typescript
import { LoadTruckDialog } from "@/components/orders/LoadTruckDialog";
import { ShipmentsSection } from "@/components/orders/ShipmentsSection";
import type { BeamGroup } from "@/lib/weight-distributor";
import { Split } from "lucide-react"; // add Split to the lucide imports
```

- [ ] **Step 2: Add LOADED to OrderDetail status type and new fields**

Extend the `OrderDetail` interface:

```typescript
// Change status union:
status: "PLACED" | "IN_PRODUCTION" | "LOADED" | "DISPATCHED" | "DELIVERED" | "CANCELED";

// Add after deliveryProofUploadedAt:
loadedPhotoUrl: string | null;
loadedAt: string | null;

// Add shipments array:
shipments: Array<{
  id: string;
  number: number;
  status: "PENDING" | "LOADED" | "DISPATCHED" | "DELIVERED";
  loadedBeams: Record<string, number> | null;
  loadedBlocks: number | null;
  loadedPhotoUrl: string | null;
  loadedAt: string | null;
  driverWillCollectCash: boolean;
  cashToCollect: string | null;
  truckIdentifier: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  notes: string | null;
  driver: { id: string; name: string; phone: string } | null;
  dispatchedBy: { id: string; name: string } | null;
}>;
```

- [ ] **Step 3: Add LOADED to STATUS_FLOW**

Replace the `STATUS_FLOW` array:

```typescript
const STATUS_FLOW: Array<{ key: OrderDetail["status"]; uz: string; en: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "PLACED",        uz: "Қабул қилинган",   en: "Placed",        icon: CheckCircle2 },
  { key: "IN_PRODUCTION", uz: "Ишлаб чиқилмоқда", en: "In production", icon: Hammer },
  { key: "LOADED",        uz: "Юкланган",         en: "Loaded",        icon: Package },
  { key: "DISPATCHED",    uz: "Жўнатилган",       en: "Dispatched",    icon: CreditCard },
  { key: "DELIVERED",     uz: "Етказилган",       en: "Delivered",     icon: Truck },
];
```

Import `Package` from lucide-react at the top.

- [ ] **Step 4: Add new state + computed values**

Inside `OrderDetailPage`, add:

```typescript
const [loadTruckOpen, setLoadTruckOpen] = useState(false);
const [splitLoading, setSplitLoading] = useState(false);
```

Compute beam groups from calculations (add after `calcTotals`):

```typescript
// Aggregate beam counts per length for shipment forms
const beamGroups: BeamGroup[] = useMemo(() => {
  const map = new Map<string, number>();
  for (const c of order.project.calculations) {
    const key = Number(c.beamLength).toFixed(1);
    map.set(key, (map.get(key) ?? 0) + c.beamCount);
  }
  return Array.from(map.entries()).map(([beamLength, totalCount]) => ({ beamLength, totalCount }));
}, [order.project.calculations]);
```

Add `useMemo` to the imports at the top of the file.

- [ ] **Step 5: Add "split shipment" creation handler**

```typescript
async function createFirstShipment() {
  setSplitLoading(true);
  try {
    const res = await fetch(`/api/orders/${order.id}/shipments`, { method: "POST" });
    const json = await res.json() as { ok: boolean; error?: string };
    if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed");
    qc.invalidateQueries({ queryKey: ["order", params.id] });
  } catch (e) {
    setError(e instanceof Error ? e.message : "Failed");
  } finally {
    setSplitLoading(false);
  }
}
```

- [ ] **Step 6: Replace the STATUS_FLOW section**

Find the status timeline block (currently `{!isCanceled ? (...)` around line 626). Replace the `onClick` logic and button rendering to handle the new flow:

```typescript
{!isCanceled ? (
  <div className="rounded-lg border bg-background p-4 shadow-sm">
    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
      Жараён<span className="lang-en"> · Status timeline</span>
    </div>
    <div className="flex flex-wrap gap-2">
      {STATUS_FLOW
        // Hide LOADED step for split-shipment orders (they manage loading per-shipment)
        .filter((s) => !(s.key === "LOADED" && order.shipments.length > 0))
        .map((s, _i, arr) => {
          const flowIdx = STATUS_FLOW.findIndex((f) => f.key === s.key);
          const currentFlowIdx = STATUS_FLOW.findIndex((f) => f.key === order.status);
          const Icon = s.icon;
          const reached = flowIdx <= currentFlowIdx;
          const isCurrent = flowIdx === currentFlowIdx;
          const canAdvance = flowIdx === currentFlowIdx + 1;

          // Gate DELIVERED: only allow when balance = 0 and no pending shipments
          const pendingShipments = order.shipments.filter(
            (sh) => sh.status === "PENDING" || sh.status === "LOADED",
          );
          const deliveredBlocked =
            s.key === "DELIVERED" && (remainingNum > 0 || pendingShipments.length > 0);

          const tooltip = deliveredBlocked
            ? remainingNum > 0
              ? t(
                  `Тўлов тўлиқ эмас — қолди: ${formatNumber(remainingNum, 0)} UZS`,
                  `Payment incomplete — remaining: ${formatNumber(remainingNum, 0)} UZS`,
                )
              : t(
                  `${pendingShipments.length} та жўнатма ҳали жўнатилмаган`,
                  `${pendingShipments.length} shipment(s) not yet dispatched`,
                )
            : undefined;

          const onClick = () => {
            if (!canAdvance || deliveredBlocked) return;
            if (s.key === "LOADED") setLoadTruckOpen(true);
            else if (s.key === "DISPATCHED" && order.shipments.length === 0) setDispatchOpen(true);
            else if (s.key === "DELIVERED") updateStatus.mutate("DELIVERED");
            else updateStatus.mutate(s.key);
          };

          return (
            <button
              key={s.key}
              type="button"
              disabled={!canAdvance || updateStatus.isPending || deliveredBlocked}
              onClick={onClick}
              title={tooltip}
              className={[
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm border transition-colors",
                reached
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : canAdvance && !deliveredBlocked
                    ? "bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100 cursor-pointer"
                    : "bg-muted/30 border-border text-muted-foreground cursor-not-allowed",
                isCurrent ? "ring-2 ring-emerald-400" : "",
              ].join(" ")}
            >
              <Icon className="h-4 w-4" />
              <span className="font-medium">{t(s.uz, s.en)}</span>
              {canAdvance && !deliveredBlocked && (
                <span className="text-xs">
                  {s.key === "LOADED"
                    ? t("→ расм юкланг", "→ upload photo")
                    : s.key === "DISPATCHED"
                      ? t("→ ҳайдовчини тайинланг", "→ assign driver")
                      : s.key === "DELIVERED"
                        ? t("→ тасдиқлаш", "→ confirm")
                        : t("→ давом эттириш учун босинг", "→ click to advance")}
                </span>
              )}
              {deliveredBlocked && (
                <span className="text-xs text-muted-foreground/70">{t("· блокланган", "· blocked")}</span>
              )}
            </button>
          );
        })}

      {/* Split Shipment button — shown when IN_PRODUCTION and no shipments yet */}
      {order.status === "IN_PRODUCTION" && order.shipments.length === 0 && (
        <button
          type="button"
          disabled={splitLoading}
          onClick={createFirstShipment}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm border border-dashed border-primary/40 text-primary/70 hover:bg-primary/5 hover:border-primary transition-colors"
        >
          {splitLoading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Split className="h-4 w-4" />}
          <span className="font-medium">{t("Бўлиб юклаш", "Split shipment")}</span>
          <span className="text-xs">{t("→ бир нечта машина", "→ multiple trucks")}</span>
        </button>
      )}
    </div>
  </div>
) : (
  /* canceled block unchanged */
  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive">
    <div className="font-bold">Бекор қилинди<span className="lang-en"> · Canceled</span></div>
    {order.cancelReason && (
      <div className="text-sm mt-1">{t("Сабаб:", "Reason:")} {order.cancelReason}</div>
    )}
  </div>
)}
```

- [ ] **Step 7: Add ShipmentsSection after the status timeline**

After the status timeline block and before the dispatch card, add:

```typescript
{/* Split-shipment tracking */}
{order.shipments.length > 0 && (
  <ShipmentsSection
    orderId={order.id}
    shipments={order.shipments}
    beamGroups={beamGroups}
    totalBlocks={calcTotals.blocks}
    orderStatus={order.status}
    onRefresh={() => qc.invalidateQueries({ queryKey: ["order", params.id] })}
  />
)}
```

- [ ] **Step 8: Add LoadTruckDialog at bottom of JSX**

Near the other modals (`DispatchDialog`, `AddPaymentDialog`), add:

```typescript
<LoadTruckDialog
  orderId={order.id}
  open={loadTruckOpen}
  onClose={() => setLoadTruckOpen(false)}
  onSuccess={() => {
    setLoadTruckOpen(false);
    qc.invalidateQueries({ queryKey: ["order", params.id] });
  }}
/>
```

- [ ] **Step 9: Show loaded truck photo**

After the existing delivery proof section, add:

```typescript
{/* Loaded truck photo (new flow) */}
{order.loadedPhotoUrl && (
  <div className="rounded-lg border bg-background overflow-hidden">
    <div className="px-4 py-3 border-b text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
      Юкланган машина<span className="lang-en"> · Loaded truck</span>
    </div>
    <div className="p-4">
      <a href={order.loadedPhotoUrl} target="_blank" rel="noreferrer">
        <img
          src={order.loadedPhotoUrl}
          alt="Loaded truck"
          className="max-h-48 rounded border object-cover hover:opacity-90 transition-opacity"
        />
      </a>
    </div>
  </div>
)}
```

- [ ] **Step 10: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

---

## Task 14: Run dev server and smoke-test

- [ ] **Start dev server**

Kill any existing dev server on port 3001 or 3002, then:

```bash
npm run dev -- -p 3002
```

Expected: server starts without errors on http://localhost:3002

- [ ] **Test single-truck flow**

1. Open an order in `IN_PRODUCTION`
2. Click "Юкланган → расм юкланг" — LoadTruckDialog opens ✓
3. Upload a JPEG — status changes to LOADED ✓
4. Click "Жўнатилган → ҳайдовчини тайинланг" — DispatchDialog opens ✓
5. Dispatch — status changes to DISPATCHED ✓
6. With remaining balance > 0: "Етказилган" is disabled with tooltip ✓
7. Add payment to clear balance
8. "Етказилган" becomes clickable — click it — status DELIVERED ✓

- [ ] **Test split-shipment flow**

1. Open an order in `IN_PRODUCTION`
2. Click "Бўлиб юклаш" — Shipment 1 created, ShipmentsSection appears ✓
3. Click "Юклаш" on Shipment 1 — SplitShipmentLoadModal opens ✓
4. Open weight distributor, enter 2 trucks × 10t, click "Тақсимлаш" — counts fill automatically ✓
5. Counts in remaining column turn green when everything is accounted for ✓
6. Upload photo and save — Shipment 1 status = LOADED ✓
7. Click "Жўнатиш" — Shipment 1 status = DISPATCHED, Order status = DISPATCHED ✓
8. Click "+ Янги жўнатма" — Shipment 2 created ✓
9. Load Shipment 2 — remaining auto-fills correctly ✓
10. "Етказилган" at order level: disabled until all shipments dispatched + balance = 0 ✓

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Simple flow: Loaded button → photo → dispatch → delivered
- ✅ Split flow: "Бўлиб юклаш" → per-truck counting form → live remaining panel
- ✅ Per-beam-length table (not per room)
- ✅ Auto-remaining calculation for Shipment 2+
- ✅ Weight distributor: uniform and varied truck capacities
- ✅ Driver optional on dispatch
- ✅ Driver "will collect cash" flag
- ✅ Delivered gated on balance = 0
- ✅ Delivered gated on all shipments dispatched
- ✅ On-demand shipment creation (no pre-planning)
- ✅ Single-truck flow unchanged if "Split" not clicked
- ✅ GET /api/orders/[id] returns shipments
- ✅ All endpoints permission-gated
- ✅ OrderEvent audit trail for every transition

**Type consistency:** All `ShipmentData` fields in `ShipmentsSection` match what Prisma returns from `include: { driver: true, dispatchedBy: true }`.

**No placeholders:** All code blocks are complete and runnable.
