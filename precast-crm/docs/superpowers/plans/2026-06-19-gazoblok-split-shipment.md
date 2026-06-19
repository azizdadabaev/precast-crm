# Gazoblok Split-Shipment — Implementation Plan

> **For agentic workers:** execute task-by-task (subagent-driven-development or executing-plans). Steps use `- [ ]`.

**Goal:** load/deliver a gazoblok order in multiple shipments — mirroring the beam/block flow, adapted to gazoblok's per-product-line block quantities, with an auto weight-distributor and an OPTIONAL loaded-truck photo.

**Locked decisions (from the user):**
1. **Per-product-line block counts** per shipment (over-load guard per line).
2. **Include the weight distributor** (auto-split across N trucks by capacity).
3. **Simple status**: PENDING → LOADED → DELIVERED. No driver/dispatch.
4. **Photo optional** (allowed, not required); multiple photos.

**Weight model:** NAAC density **611 kg/m³** (from the user: 1× 0.6×0.3×0.2 m block = 22 kg ⇒ 22/0.036 = 611). Per-block weight = `lengthM × heightM × thicknessM × 611`. Per-line weight = `blockCount × perBlockWeight`. Product dims come from `GazoblokProduct`; if a line's product was deleted (productId null), fall back to the order's avg (`totalVolumeM3 / totalBlocks × 611` per block).

**Tech:** Next.js 14 · Prisma · React Query · the existing `prepareImageForUpload` compression + `max-h-[calc(100dvh-2rem)]` scrollable-modal pattern.

---

### Task 1 — Schema + weight/distributor lib

**Files:**
- Modify `prisma/schema.prisma`: add `GazoblokShipment` + `shipments GazoblokShipment[]` on `GazoblokOrder`.
- Create `src/lib/gazoblok-weight.ts` (pure): per-block weight, per-line weight, `distributeGazoblokLoad`, `calculateGazoblokRemaining`.
- Create `tests/gazoblok-weight.test.ts`.

```prisma
model GazoblokShipment {
  id      String @id @default(cuid())
  orderId String
  number  Int    // 1-based per order
  status  GazoblokShipmentStatus @default(PENDING)
  // Per product line: { "<lineId>": blockCount } — null until loaded.
  loadedLines    Json?
  loadedPhotoUrls String[] @default([])
  loadedAt       DateTime?
  deliveredAt    DateTime?
  notes          String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  order GazoblokOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  @@unique([orderId, number])
  @@index([orderId])
  @@map("gazoblok_shipments")
}

enum GazoblokShipmentStatus { PENDING LOADED DELIVERED }
```
Add to `GazoblokOrder`: `shipments GazoblokShipment[]`.

`gazoblok-weight.ts` (pure, mirrors `weight-distributor.ts`):
- `GAZOBLOK_DENSITY = 611`
- `LineSpec { lineId; label; quantity; perBlockKg }`
- `perBlockKg(dims) = lengthM*heightM*thicknessM*611`
- `calculateGazoblokRemaining(lines, prevLoaded[]): Record<lineId, number>` — order total per line minus prior shipments (clamped ≥0).
- `signedRemaining` style helper is done in the modal, not here.
- `distributeGazoblokLoad(lines, capacitiesKg[]): { shipments: Array<{ lines: Record<lineId,number>; weightKg }>; warnings }` — greedy fill by weight per line, mirroring `distributeLoad`.

- [ ] Write tests (remaining math; distribute splits a 2-line order across 2 trucks; over-cap warning). Run, see fail.
- [ ] Implement lib. `npx prisma generate`. Run tests → pass. tsc.
- [ ] Commit.

### Task 2 — API: create / load / list shipments

**Files:** Create `src/app/api/gazoblok/orders/[id]/shipments/route.ts` (POST create, GET list) and `.../shipments/[sid]/route.ts` (PATCH load + deliver). `withAuth`.
- **POST** create: next `number` = max(existing)+1; status PENDING.
- **PATCH load**: multipart (optional `file`s) + `loadedLines` JSON. **Over-load guard** server-side (per line: prior shipments + this ≤ order total) BEFORE saving photos. Save photos via `saveImageFromFormData` → `loadedPhotoUrls`. status→LOADED, loadedAt. Append `GazoblokOrderEvent`.
- **PATCH deliver**: status PENDING/LOADED → DELIVERED, deliveredAt.
- DELETE a PENDING shipment (optional, parity).

- [ ] Implement routes (mirror `src/app/api/orders/[id]/shipments/...`). tsc. Commit.

### Task 3 — Load modal + page section

**Files:** Create `src/components/gazoblok/GazoblokSplitShipmentModal.tsx` (gazoblok analog of `SplitShipmentLoadModal`: per-line inputs capped at available, signed-remaining red-on-overload, submit blocked on overload, **photo optional** so no "photo required" guard, weight-distributor accordion using `gazoblok-weight`). Add a "Жўнатмалар · Shipments" section to `src/app/(app)/gazoblok/orders/[id]/page.tsx` (list + add + load + deliver), include `shipments` in the order GET.

- [ ] Build modal + section. tsc + build. Commit.

### Task 4 — Verify + deploy
- [ ] Full vitest + build. Deploy with `prisma db push` (new table + enum). Manual: split a gazoblok order into 2 shipments, distribute by weight, load one without a photo, deliver; confirm over-load is blocked.
