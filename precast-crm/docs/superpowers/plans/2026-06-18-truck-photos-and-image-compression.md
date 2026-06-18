# Truck Photos (multiple + delete) & Client-Side Image Compression — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compress every operator photo client-side to a small JPEG before upload (fixes slow uploads on older Android, accepts HEIC), and let the Loaded-truck step hold multiple photos with delete.

**Architecture:** A shared `prepareImageForUpload(file)` util (lazy `heic2any` for HEIC + `browser-image-compression` resize→JPEG) runs in every upload dialog before the FormData fetch. Loaded photos are the existing `GalleryPhoto(kind:"LOADED")` rows; new add/delete endpoints manage them and the order page renders a strip. No schema change (relation + scalar already exist).

**Tech Stack:** Next.js 14 · Prisma · React Query · `browser-image-compression` + `heic2any` (client) · vitest.

**Working dir for all commands:** `c:/Users/aziz/Downloads/precast-crm/precast-crm/precast-crm`. Commits: no `Co-Authored-By` line. Spec: `docs/superpowers/specs/2026-06-18-truck-photos-and-image-compression-design.md`.

---

## File Structure

| File | New/Modify | Responsibility |
|------|-----------|----------------|
| `package.json` | Modify | Add `browser-image-compression`, `heic2any` |
| `src/lib/image/prepare-upload.ts` | Create | `prepareImageForUpload` + pure `isHeic`/`jpgName` |
| `src/components/orders/LoadTruckDialog.tsx` | Modify | Compress + `image/*` accept + "Preparing…" |
| `src/components/orders/DeliveryProofDialog.tsx` | Modify | Compress + accept |
| `src/components/orders/SplitShipmentLoadModal.tsx` | Modify | Compress + accept |
| `src/components/payments/ReceiptPicker.tsx` | Modify | Compress + accept |
| `src/app/api/orders/[id]/route.ts` | Modify | Include `LOADED` gallery photos on the order GET |
| `src/app/api/orders/[id]/loaded-photos/route.ts` | Create | POST add a loaded photo (order LOADED+) |
| `src/app/api/orders/[id]/loaded-photos/[photoId]/route.ts` | Create | DELETE a loaded photo (+ repoint scalar) |
| `src/lib/loaded-photos.ts` | Create | pure `canAddLoadedPhoto(status)` |
| `src/app/(app)/orders/[id]/page.tsx` | Modify | Loaded-photo strip: thumbnails + delete + add |
| `tests/prepare-upload.test.ts`, `tests/loaded-photos.test.ts` | Create | Unit tests |

---

# PART A — Client-side compression (priority)

## Task 1: Add the two client libraries

**Files:** Modify `package.json` (+ lockfile)

- [ ] **Step 1:** Install:
```bash
npm install --save browser-image-compression heic2any
```
- [ ] **Step 2:** Verify both appear in `package.json` `dependencies`. Run `npx tsc --noEmit` (should still be clean; no usage yet). Run `npx vitest run` (green).
- [ ] **Step 3:** Commit:
```bash
git add package.json package-lock.json
git commit -m "Build(deps) · add browser-image-compression + heic2any (client image prep)"
```

---

## Task 2: `prepareImageForUpload` util + pure helpers

**Files:** Create `src/lib/image/prepare-upload.ts`; Test `tests/prepare-upload.test.ts`

- [ ] **Step 1 (failing test):** Create `tests/prepare-upload.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isHeic, jpgName } from "@/lib/image/prepare-upload";

describe("isHeic", () => {
  it("detects HEIC/HEIF by MIME or extension", () => {
    expect(isHeic({ type: "image/heic", name: "x.heic" })).toBe(true);
    expect(isHeic({ type: "image/heif", name: "x" })).toBe(true);
    expect(isHeic({ type: "", name: "PHOTO.HEIC" })).toBe(true);
    expect(isHeic({ type: "", name: "img.HEIF" })).toBe(true);
  });
  it("is false for jpeg/png/webp", () => {
    expect(isHeic({ type: "image/jpeg", name: "a.jpg" })).toBe(false);
    expect(isHeic({ type: "image/png", name: "a.png" })).toBe(false);
    expect(isHeic({ type: "", name: "a.webp" })).toBe(false);
  });
});

describe("jpgName", () => {
  it("rewrites any extension to .jpg", () => {
    expect(jpgName("photo.heic")).toBe("photo.jpg");
    expect(jpgName("truck.PNG")).toBe("truck.jpg");
    expect(jpgName("noext")).toBe("noext.jpg");
    expect(jpgName("a.b.webp")).toBe("a.b.jpg");
  });
});
```
Run `npx vitest run tests/prepare-upload.test.ts` → FAIL (module missing).

- [ ] **Step 2:** Create `src/lib/image/prepare-upload.ts`:
```ts
import imageCompression from "browser-image-compression";

// Smallest/fastest tier (operator choice): tiny JPEGs upload fast on old phones.
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.65;

/** True when the file is an iPhone HEIC/HEIF (by MIME or extension). */
export function isHeic(file: { type?: string; name?: string }): boolean {
  const type = (file.type ?? "").toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  const name = (file.name ?? "").toLowerCase();
  return name.endsWith(".heic") || name.endsWith(".heif");
}

/** Rewrite a filename's extension to `.jpg` (adds it when none). */
export function jpgName(name: string): string {
  return /\.[^.]+$/.test(name) ? name.replace(/\.[^.]+$/, ".jpg") : `${name}.jpg`;
}

/**
 * Compress/convert any phone photo to a small JPEG before upload. HEIC/HEIF is
 * converted first via a lazy-loaded heic2any (its ~1.4 MB libheif wasm is only
 * fetched when a HEIC is actually picked). Everything is then resized to
 * ≤1280px and re-encoded JPEG (~0.65). A non-HEIC failure falls back to the
 * original file so the upload still works; a HEIC that won't convert throws
 * (the server can't accept HEIC).
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  let input: File = file;
  if (isHeic(file)) {
    const heic2any = (await import("heic2any")).default as (
      opts: { blob: Blob; toType?: string; quality?: number },
    ) => Promise<Blob | Blob[]>;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.8 });
    const blob = Array.isArray(out) ? out[0] : out;
    input = new File([blob], jpgName(file.name), { type: "image/jpeg" });
  }
  try {
    const compressed = await imageCompression(input, {
      maxWidthOrHeight: MAX_DIMENSION,
      initialQuality: JPEG_QUALITY,
      useWebWorker: true,
      fileType: "image/jpeg",
    });
    return new File([compressed], jpgName(input.name), { type: "image/jpeg" });
  } catch (e) {
    if (isHeic(file)) throw e;
    return file;
  }
}
```
- [ ] **Step 3:** Run the test → PASS. `npx tsc --noEmit` → clean.
- [ ] **Step 4:** Commit:
```bash
git add src/lib/image/prepare-upload.ts tests/prepare-upload.test.ts
git commit -m "Feat(image) · prepareImageForUpload — HEIC→JPEG + resize/compress client-side"
```

---

## Task 3: Wire compression into the upload dialogs

**Files:** Modify `LoadTruckDialog.tsx`, `DeliveryProofDialog.tsx`, `SplitShipmentLoadModal.tsx`, `ReceiptPicker.tsx`. No unit test (UI) — verify tsc + build.

For EACH of the four, make two changes:
1. The file `<input>` `accept` becomes `accept="image/*,.heic,.heif"` (so the phone offers any photo, incl. HEIC).
2. Immediately before building the `FormData` (or before the existing per-file upload `fetch`), run the file through `prepareImageForUpload`. Show a brief "Тайёрланмоқда… · Preparing…" state while it runs.

- [ ] **Step 1 — `LoadTruckDialog.tsx`:** import `{ prepareImageForUpload }` from `@/lib/image/prepare-upload`. In `submit()`, replace `fd.append("file", file)` with:
```ts
      setError(null);
      const prepared = await prepareImageForUpload(file).catch(() => null);
      if (!prepared) { setError(t("Расмни ўқиб бўлмади, бошқа расм танланг", "Couldn't read this photo — pick another")); setLoading(false); return; }
      const fd = new FormData();
      fd.append("file", prepared);
```
Change the input `accept` to `image/*,.heic,.heif`. (The existing `loading` flag already covers the "preparing"+"uploading" window; optionally relabel the button to "Тайёрланмоқда…" while `loading`.)

- [ ] **Step 2 — `DeliveryProofDialog.tsx`:** find where it sends the file (it calls an `onUpload`/builds FormData — read the file). Before the file leaves the component, replace the raw `File` with `await prepareImageForUpload(file)`. Broaden its input `accept` to `image/*,.heic,.heif`. Add a "Preparing…" disabled state if it has its own submit; if it delegates upload to the parent (`orders/[id]/page.tsx`), do the `prepareImageForUpload` call there in the upload handler instead — wherever the `File` is first turned into FormData.

- [ ] **Step 3 — `SplitShipmentLoadModal.tsx`:** before `fd.append("file", file)`, set `const prepared = await prepareImageForUpload(file)` and append `prepared`. Broaden `accept` to `image/*,.heic,.heif`.

- [ ] **Step 4 — `ReceiptPicker.tsx`:** it loops over picked files and POSTs each to `/api/payments/upload-receipt`. Before each upload, replace the file with `await prepareImageForUpload(file)`. Broaden its input `accept` to `image/*,.heic,.heif`.

- [ ] **Step 5:** `npx tsc --noEmit` → clean. `npx next build` → succeeds. `npx vitest run` → green.

- [ ] **Step 6:** Commit:
```bash
git add src/components/orders/LoadTruckDialog.tsx src/components/orders/DeliveryProofDialog.tsx src/components/orders/SplitShipmentLoadModal.tsx src/components/payments/ReceiptPicker.tsx "src/app/(app)/orders/[id]/page.tsx"
git commit -m "Feat(uploads) · compress photos client-side before upload (accept image/* incl. HEIC)"
```
(Add `orders/[id]/page.tsx` to the commit only if you put the delivery-proof prep there.)

---

# PART B — Multiple loaded photos + delete

## Task 4: Return LOADED gallery photos on the order GET

**Files:** Modify `src/app/api/orders/[id]/route.ts` + `src/app/(app)/orders/[id]/page.tsx`

- [ ] **Step 1:** In the order GET `findUnique` `include`, add (the `Order.galleryPhotos` relation already exists):
```ts
      galleryPhotos: {
        where: { kind: "LOADED" },
        orderBy: { uploadedAt: "asc" },
        select: { id: true, url: true, uploadedAt: true },
      },
```
- [ ] **Step 2:** In `orders/[id]/page.tsx`, add to the `OrderDetail` TS type:
```ts
  galleryPhotos: Array<{ id: string; url: string; uploadedAt: string }>;
```
- [ ] **Step 3:** `npx tsc --noEmit` → clean. `npx next build` → succeeds.
- [ ] **Step 4:** Commit:
```bash
git add "src/app/api/orders/[id]/route.ts" "src/app/(app)/orders/[id]/page.tsx"
git commit -m "Feat(orders) · return LOADED gallery photos on the order detail GET"
```

---

## Task 5: Add-loaded-photo endpoint

**Files:** Create `src/lib/loaded-photos.ts`, `src/app/api/orders/[id]/loaded-photos/route.ts`; Test `tests/loaded-photos.test.ts`

- [ ] **Step 1 (failing test):** Create `tests/loaded-photos.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { canAddLoadedPhoto } from "@/lib/loaded-photos";

describe("canAddLoadedPhoto", () => {
  it("allows adding once the order is loaded or beyond", () => {
    expect(canAddLoadedPhoto("LOADED")).toBe(true);
    expect(canAddLoadedPhoto("DISPATCHED")).toBe(true);
    expect(canAddLoadedPhoto("DELIVERED")).toBe(true);
  });
  it("rejects before loading and when canceled", () => {
    expect(canAddLoadedPhoto("PLACED")).toBe(false);
    expect(canAddLoadedPhoto("IN_PRODUCTION")).toBe(false);
    expect(canAddLoadedPhoto("CANCELED")).toBe(false);
    expect(canAddLoadedPhoto("DRAFT")).toBe(false);
  });
});
```
Run `npx vitest run tests/loaded-photos.test.ts` → FAIL.

- [ ] **Step 2:** Create `src/lib/loaded-photos.ts`:
```ts
import type { OrderStatus } from "@prisma/client";

/** Extra loaded-truck photos may be added only once the order has been loaded
 *  (the FIRST photo goes through /load, which performs the PLACED→LOADED
 *  transition). Adding is allowed at LOADED / DISPATCHED / DELIVERED. */
export function canAddLoadedPhoto(status: OrderStatus | string): boolean {
  return status === "LOADED" || status === "DISPATCHED" || status === "DELIVERED";
}
```
- [ ] **Step 3:** Run the test → PASS.

- [ ] **Step 4:** Create `src/app/api/orders/[id]/loaded-photos/route.ts`:
```ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, created } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { saveImageFromFormData, UploadError } from "@/lib/uploads";
import { canAddLoadedPhoto } from "@/lib/loaded-photos";
import { recordAudit } from "@/lib/audit";

/** POST /api/orders/[id]/loaded-photos — order.edit. Append one more loaded-truck
 *  photo to an already-loaded order. Multipart: file. Does NOT change status. */
export const POST = withPermission<{ id: string }>("order.edit", async (req: NextRequest, { user, params }) => {
  const order = await prisma.order.findUnique({ where: { id: params.id }, select: { id: true, status: true, orderNumber: true } });
  if (!order) return fail("Order not found", 404);
  if (!canAddLoadedPhoto(order.status)) {
    return fail(`Order must be loaded first (current: ${order.status})`, 422);
  }
  let formData: FormData;
  try { formData = await req.formData(); } catch { return fail("Expected multipart/form-data", 400); }
  let url: string;
  try {
    const saved = await saveImageFromFormData(formData.get("file"), `orders/${params.id}`, `loaded-${Date.now()}`);
    url = saved.url;
  } catch (e) {
    if (e instanceof UploadError) return fail(e.message, e.status);
    throw e;
  }
  const photo = await prisma.galleryPhoto.create({
    data: { orderId: params.id, kind: "LOADED", url, uploadedById: user.id },
    select: { id: true, url: true, uploadedAt: true },
  });
  recordAudit({ userId: user.id, action: "order.loadedPhotoAdded", targetType: "order", targetId: params.id, message: `Loaded photo added to ${order.orderNumber}` });
  return created(photo);
});
```
- [ ] **Step 5:** `npx vitest run` (green incl. new test). `npx tsc --noEmit` → clean. `npx next build` → succeeds (route appears).
- [ ] **Step 6:** Commit:
```bash
git add src/lib/loaded-photos.ts "src/app/api/orders/[id]/loaded-photos/route.ts" tests/loaded-photos.test.ts
git commit -m "Feat(orders) · add-loaded-photo endpoint (append photos after LOADED)"
```

---

## Task 6: Delete-loaded-photo endpoint (+ repoint scalar)

**Files:** Create `src/app/api/orders/[id]/loaded-photos/[photoId]/route.ts`

- [ ] **Step 1:** Create the route:
```ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { deleteUpload } from "@/lib/uploads";
import { recordAudit } from "@/lib/audit";

/** DELETE /api/orders/[id]/loaded-photos/[photoId] — order.edit. Remove a loaded
 *  photo (row + file). Repoints Order.loadedPhotoUrl if it pointed at this one.
 *  Does NOT change order status. */
export const DELETE = withPermission<{ id: string; photoId: string }>("order.edit", async (_req: NextRequest, { user, params }) => {
  const photo = await prisma.galleryPhoto.findUnique({
    where: { id: params.photoId },
    select: { id: true, orderId: true, kind: true, url: true },
  });
  if (!photo || photo.orderId !== params.id || photo.kind !== "LOADED") {
    return fail("Photo not found", 404);
  }
  const order = await prisma.order.findUnique({ where: { id: params.id }, select: { loadedPhotoUrl: true, orderNumber: true } });

  await prisma.$transaction(async (tx) => {
    await tx.galleryPhoto.delete({ where: { id: photo.id } });
    // If the scalar mirror pointed at the deleted photo, repoint to the most
    // recent remaining LOADED photo (or null).
    if (order?.loadedPhotoUrl === photo.url) {
      const next = await tx.galleryPhoto.findFirst({
        where: { orderId: params.id, kind: "LOADED" },
        orderBy: { uploadedAt: "desc" },
        select: { url: true },
      });
      await tx.order.update({ where: { id: params.id }, data: { loadedPhotoUrl: next?.url ?? null } });
    }
  });

  // Best-effort file removal (never block on fs).
  await deleteUpload(photo.url).catch(() => {});
  recordAudit({ userId: user.id, action: "order.loadedPhotoDeleted", targetType: "order", targetId: params.id, message: `Loaded photo deleted from ${order?.orderNumber ?? params.id}` });
  return ok({ id: photo.id });
});
```
**Note:** confirm `deleteUpload` exists in `src/lib/uploads.ts`; if the helper has a different name (e.g. `removeUpload`/`unlinkUpload`), use the real one. If no such helper exists, add a tiny one: `export async function deleteUpload(publicUrl: string) { const p = path.join(process.cwd(), "public", publicUrl); await fs.unlink(p); }` (import `fs from "fs/promises"`, `path from "path"`), guarding that `publicUrl` starts with `/uploads/`.

- [ ] **Step 2:** `npx tsc --noEmit` → clean. `npx next build` → succeeds. `npx vitest run` → green.
- [ ] **Step 3:** Commit:
```bash
git add "src/app/api/orders/[id]/loaded-photos/[photoId]/route.ts" src/lib/uploads.ts
git commit -m "Feat(orders) · delete a loaded photo (+ repoint loadedPhotoUrl)"
```
(Add `src/lib/uploads.ts` only if you added the `deleteUpload` helper.)

---

## Task 7: Order page — loaded-photo strip (add + delete)

**Files:** Modify `src/app/(app)/orders/[id]/page.tsx`. No unit test (UI) — tsc + build + manual.

The current "Юкланган машина · Loaded truck" block (~lines 1543-1569) shows the single `order.loadedPhotoUrl`. Replace it with a strip driven by `order.galleryPhotos` (from Task 4):
- [ ] **Step 1:** Render each `galleryPhotos` entry as a ~80px thumbnail (reuse the existing `ImageViewer`/zoom the block already uses) with a **✕ delete** overlay button (visible to `order.edit` holders — reuse the page's existing permission signal). If `galleryPhotos` is empty but `order.loadedPhotoUrl` exists (legacy orders with no rows), show that single url.
- [ ] **Step 2:** Add an **"+ Расм қўшиш · Add photo"** button shown when `canAddLoadedPhoto(order.status)` and the user has `order.edit`. It opens a hidden file input (`accept="image/*,.heic,.heif"`); on pick → `await prepareImageForUpload(file)` → POST FormData to `/api/orders/${id}/loaded-photos` → invalidate the order query (`["order", id]`). Show a "Preparing…/Uploading…" state.
- [ ] **Step 3:** Delete: a `useMutation` calling `DELETE /api/orders/${id}/loaded-photos/${photoId}` (with a small confirm) → invalidate the order query.
- [ ] **Step 4:** `npx tsc --noEmit` → clean. `npx next build` → succeeds. `npx vitest run` → green.
- [ ] **Step 5:** Commit:
```bash
git add "src/app/(app)/orders/[id]/page.tsx"
git commit -m "Feat(orders) · loaded-truck photo strip — add more + delete"
```

---

## Task 8: Final verification

- [ ] `npx vitest run` (all green), `npx tsc --noEmit` (clean), `npx next build` (succeeds; `/api/orders/[id]/loaded-photos` and `…/[photoId]` appear).
- [ ] Manual: on a phone, pick a large photo and a HEIC in the Load dialog → both compress (small JPEG) and upload fast; add 2-3 photos to a LOADED order; delete one; confirm status stays LOADED and the print page still shows a loaded photo; record a receipt photo (compressed).
- [ ] No DB migration needed (no schema change). Deploy picks up the new npm deps via the Docker `npm ci`.

---

## Self-Review (completed during authoring)

**Spec coverage:** compression ≤1280px JPEG q0.65 → Task 2 ✓ · applied to load/delivery-proof/split/receipts → Task 3 ✓ · accept image/* incl HEIC → Tasks 3,7 ✓ · multiple loaded photos → Tasks 4,5,7 ✓ · delete + scalar repoint → Task 6 ✓ · status-decoupled → Tasks 5,6 (no status writes) ✓ · order.edit gate → Tasks 5,6 ✓ · lazy heic2any → Task 2 ✓ · libraries → Task 1 ✓.

**Placeholder scan:** novel code (util, both endpoints, pure helpers) is given in full with tests; UI wiring (Tasks 3,7) references the concrete existing block + patterns. The only conditional is `deleteUpload`'s real name (Task 6 note) — verified-at-implementation, with a fallback shown.

**Type consistency:** `prepareImageForUpload`/`isHeic`/`jpgName`/`canAddLoadedPhoto` names consistent across tasks; `galleryPhotos` shape `{ id, url, uploadedAt }` matches between the GET include (Task 4) and the page type/strip (Tasks 4,7); `kind: "LOADED"` consistent.

**Note:** UI tasks (3,7) and the multipart/prisma endpoints lack unit tests (no component harness; multipart+canvas not jsdom-testable) — covered by tsc + build + the manual script in Task 8; the pure pieces (`isHeic`, `jpgName`, `canAddLoadedPhoto`) carry the automated coverage.
