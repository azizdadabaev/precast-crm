# Truck-Loading Photos (multiple + delete) & Client-Side Image Compression — Design

**Date:** 2026-06-18
**Status:** Approved (design) — pending spec review

## 1. Summary

Two upgrades to the operator photo flow:

1. **Multiple loaded-truck photos + delete.** Today the LOADED step accepts exactly one photo
   (`Order.loadedPhotoUrl`, set during the PLACED→LOADED transition). Operators need to add
   *more* loaded photos — including **after** the order is already LOADED — and to **delete**
   uploaded photos. A `GalleryPhoto` table already stores a `LOADED` row per upload; we surface
   it as a managed photo strip.

2. **Fast, format-tolerant uploads.** Uploads are slow/buggy on older Android phones because
   full-size photos (3–8 MB) crawl over the operator's connection, and the server only accepts
   JPG/PNG/WEBP (no HEIC). Fix: **compress every photo client-side to a small JPEG before upload**
   (longest side ~1280 px, JPEG ~0.65), and accept any phone photo incl. **HEIC/HEIF** (converted
   client-side). Reaches the server as a small JPEG — which it already accepts — so the upload is
   fast and consistent on every phone.

## 2. Goals / Non-goals

**Goals**
- Loaded-truck step: add unlimited photos (any time the order is LOADED or later) + delete any.
- All operator photo uploads (load, add-loaded, delivery-proof, split-shipment, receipts) compress
  client-side to a small JPEG first; inputs accept `image/*` incl. HEIC.
- No server format/validation changes needed (server keeps accepting JPEG after client compression).

**Non-goals**
- Multiple/delete for the **delivery-proof** photo (stays single this round — operator's choice).
- No server-side image processing (no `sharp`); compression is client-side (that's what fixes the
  slow-upload, since a smaller payload is what travels the slow network).
- No change to the LOADED↔DELIVERED status flow; photos are managed independently of status.

## 3. Decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| Multiple + delete scope | **Loaded-truck only** (delivery-proof stays single) |
| Compression target | **~1280 px longest side, JPEG ~0.65** (~150–350 KB) — fastest |
| Where compression applies | **All** operator photo uploads (load, add-loaded, delivery-proof, split-shipment, receipts) |
| HEIC/HEIF | Converted to JPEG client-side via lazy-loaded `heic2any` |
| Libraries | `browser-image-compression` (resize/compress in a web worker) + `heic2any` (HEIC only, dynamic import) |
| Delete permission | `order.edit` (same as upload) |
| Status coupling | Deleting/adding photos does NOT change order status |

## 4. Part 1 — Multiple loaded photos + delete

**Data:** no schema change. Loaded photos are existing `GalleryPhoto` rows
(`orderId`, `kind: "LOADED"`). The `/load` route already creates one on the PLACED→LOADED
transition; we add endpoints to append/remove more.

**Endpoints (gated `order.edit`):**
- `POST /api/orders/[id]/loaded-photos` — multipart `file`. Allowed only when the order is
  **LOADED / DISPATCHED / DELIVERED** (i.e. already loaded; the *first* photo still goes through
  `/load` to flip the status). Compresses on the client first (Part 2). Saves to
  `uploads/orders/<id>/` and creates a `GalleryPhoto(kind: LOADED, uploadedById)`. Returns the new
  photo `{ id, url, uploadedAt }`.
- `DELETE /api/orders/[id]/loaded-photos/[photoId]` — verify the `GalleryPhoto` belongs to this
  order and is `kind: LOADED`; delete the row + best-effort delete the file. If its `url` equals
  `Order.loadedPhotoUrl` (the legacy scalar still read by the print page etc.), **repoint** the
  scalar to another remaining LOADED photo (most recent) or `null`. Does **not** change status.

**Order detail page** (`src/app/(app)/orders/[id]/page.tsx`):
- The order GET include gains `galleryPhotos: { where: { kind: "LOADED" }, orderBy: { uploadedAt:
  "asc" }, select: { id, url, uploadedAt } }` (Order↔GalleryPhoto back-relation already exists).
- The "Юкланган машина · Loaded truck" section becomes a **photo strip**: each photo is a thumbnail
  (click → existing `ImageViewer`) with a **✕ delete** (confirm), plus an **"+ Расм қўшиш · Add
  photo"** button. The strip + add button render whenever the order is LOADED or later and the user
  has `order.edit`. Falls back to the `loadedPhotoUrl` scalar only for orders with no gallery rows
  (legacy).
- Delete/add use a `useMutation` that invalidates the order query.

## 5. Part 2 — Client-side compression + format tolerance

**Shared util** `src/lib/image/prepare-upload.ts`:
```ts
export async function prepareImageForUpload(file: File): Promise<File>
```
1. If the file is HEIC/HEIF (by MIME `image/heic|image/heif` or `.heic/.heif` extension):
   `const heic2any = (await import("heic2any")).default;` → convert to a JPEG blob → wrap in a
   `File` (renamed `.jpg`, type `image/jpeg`). The dynamic import keeps `heic2any`'s ~1.4 MB
   libheif wasm out of the main bundle — downloaded only when a HEIC is actually picked.
2. Compress/resize via `browser-image-compression`: `{ maxWidthOrHeight: 1280, initialQuality:
   0.65, useWebWorker: true, fileType: "image/jpeg" }` → a small JPEG `File`.
3. On any failure: for a **non-HEIC** input, fall back to the original file (upload still works);
   for a **HEIC** input that fails to convert, throw a clear error (the server can't accept HEIC),
   surfaced as "Расмни ўқиб бўлмади, бошқа расм танланг · Couldn't read this photo".

**Call sites** (run `prepareImageForUpload` before building the FormData): `LoadTruckDialog`,
the new add-loaded-photo control, `DeliveryProofDialog`, `SplitShipmentLoadModal`, and
`ReceiptPicker`. Each file input's `accept` becomes `image/*,.heic,.heif` so the phone offers any
photo. Show a brief "Тайёрланмоқда… · Preparing…" state while compressing (older phones take a
moment), then upload.

**Server:** unchanged — it keeps validating magic bytes and accepting JPEG/PNG/WEBP ≤ 8 MB. After
client compression every upload arrives as a small JPEG, well under the cap.

## 6. Dependencies

Add `browser-image-compression` (~30 KB, web-worker) and `heic2any` (HEIC only, dynamic-imported).
Both are client-side; `heic2any` never enters the main bundle. `npm ci` in the Docker build picks
them up; no native/server deps.

## 7. Security / permissions

- Add + delete loaded photos: `order.edit` (same gate as `/load`). Delete verifies the photo
  belongs to the order and is a LOADED kind (no cross-order deletes).
- `/uploads` remains public-by-URL (same known posture as other media; out of scope here).
- Server-side magic-byte validation is unchanged — a tampered client can't push a non-image.

## 8. Testing

- **Pure helpers (unit):** a `targetDimensions(w, h, max)` (resize math → ≤1280 longest side,
  aspect kept) and `isHeic(file)` detection. The canvas/web-worker compression + `heic2any` are
  integration/manual (no canvas in jsdom).
- **Endpoints (unit/integration):** add-loaded-photo rejects when status < LOADED and accepts when
  LOADED+; delete rejects a photo from another order / wrong kind; delete repoints the
  `loadedPhotoUrl` scalar correctly.
- **Manual:** on an Android phone, pick a large photo and a HEIC → both compress and upload quickly;
  add several loaded photos to a LOADED order; delete one; confirm status unaffected and the print
  page still shows a loaded photo.

## 9. Phasing

1. **Part 2 (compression)** first — it's the urgent reliability fix and benefits every upload.
2. **Part 1 (multiple + delete)** — builds on the same compressed-upload util for the add flow.

Each part is independently shippable.
