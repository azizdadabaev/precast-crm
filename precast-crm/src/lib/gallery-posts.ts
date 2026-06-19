// Groups a flat list of gallery photos into "posts" — one per (orderId, kind) —
// so an order's multiple same-kind uploads (e.g. several split-shipment photos)
// collapse into a single swipeable card. Pure + side-effect free so the
// grouping/ordering is unit-testable; the API does the DB work and hands the
// already-page-scoped rows + the desired post order here.

export type GalleryKind = "LOADED" | "DELIVERY_PROOF" | "SHIPMENT_LOADED";

export interface GalleryUploader {
  id: string;
  name: string;
}

export interface GalleryImageView {
  id: string;
  url: string;
  uploadedAt: string;
  uploadedBy: GalleryUploader | null;
}

/** A flat photo row as the API maps it from Prisma (image + order/client ctx). */
export interface GalleryPhotoView extends GalleryImageView {
  orderId: string;
  orderNumber: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  clientAddress: string | null;
  kind: GalleryKind;
  orderStatus: string;
}

/** A grouped post: the shared order/client context plus its images. */
export interface GalleryPost {
  key: string;
  orderId: string;
  orderNumber: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  clientAddress: string | null;
  kind: GalleryKind;
  orderStatus: string;
  /** Most-recent image's timestamp — what the card shows + how posts are ordered. */
  uploadedAt: string;
  images: GalleryImageView[];
}

export function postKey(orderId: string, kind: string): string {
  return `${orderId}:${kind}`;
}

/**
 * Assemble posts from page-scoped photo rows. `orderedKeys` is the desired post
 * order (the API derives it from a groupBy ordered by most-recent upload), so a
 * post appears exactly where its group ranked. Images within a post are sorted
 * chronologically (oldest → newest) so the carousel reads left-to-right in
 * upload order. A key with no matching photos is skipped.
 */
export function assembleGalleryPosts(
  photos: GalleryPhotoView[],
  orderedKeys: string[],
): GalleryPost[] {
  const byKey = new Map<string, GalleryPost>();

  for (const p of photos) {
    const key = postKey(p.orderId, p.kind);
    let post = byKey.get(key);
    if (!post) {
      post = {
        key,
        orderId: p.orderId,
        orderNumber: p.orderNumber,
        clientId: p.clientId,
        clientName: p.clientName,
        clientPhone: p.clientPhone,
        clientAddress: p.clientAddress,
        kind: p.kind,
        orderStatus: p.orderStatus,
        uploadedAt: p.uploadedAt,
        images: [],
      };
      byKey.set(key, post);
    }
    post.images.push({ id: p.id, url: p.url, uploadedAt: p.uploadedAt, uploadedBy: p.uploadedBy });
    if (p.uploadedAt > post.uploadedAt) post.uploadedAt = p.uploadedAt;
  }

  for (const post of byKey.values()) {
    post.images.sort((a, b) => (a.uploadedAt < b.uploadedAt ? -1 : a.uploadedAt > b.uploadedAt ? 1 : 0));
  }

  const posts: GalleryPost[] = [];
  for (const key of orderedKeys) {
    const post = byKey.get(key);
    if (post) posts.push(post);
  }
  return posts;
}
