import { describe, it, expect } from "vitest";
import { assembleGalleryPosts, postKey, type GalleryPhotoView } from "@/lib/gallery-posts";

function photo(over: Partial<GalleryPhotoView> & { id: string; orderId: string; kind: GalleryPhotoView["kind"]; uploadedAt: string }): GalleryPhotoView {
  return {
    url: `/u/${over.id}.jpg`,
    uploadedBy: { id: "u1", name: "Op" },
    orderNumber: "2026-06-0016",
    clientId: "c1",
    clientName: "Akmal jon",
    clientPhone: "998950952293",
    clientAddress: "Toshkent",
    orderStatus: "DISPATCHED",
    ...over,
  };
}

describe("assembleGalleryPosts", () => {
  it("groups same (orderId, kind) photos into one post, images chronological", () => {
    const photos = [
      photo({ id: "b", orderId: "o1", kind: "SHIPMENT_LOADED", uploadedAt: "2026-06-18T10:00:00.000Z" }),
      photo({ id: "a", orderId: "o1", kind: "SHIPMENT_LOADED", uploadedAt: "2026-06-18T09:00:00.000Z" }),
    ];
    const posts = assembleGalleryPosts(photos, [postKey("o1", "SHIPMENT_LOADED")]);
    expect(posts).toHaveLength(1);
    expect(posts[0].images.map((i) => i.id)).toEqual(["a", "b"]); // oldest → newest
    expect(posts[0].uploadedAt).toBe("2026-06-18T10:00:00.000Z"); // most recent
  });

  it("keeps different kinds of the same order as separate posts", () => {
    const photos = [
      photo({ id: "s", orderId: "o1", kind: "SHIPMENT_LOADED", uploadedAt: "2026-06-18T10:00:00.000Z" }),
      photo({ id: "l", orderId: "o1", kind: "LOADED", uploadedAt: "2026-06-18T11:00:00.000Z" }),
    ];
    const posts = assembleGalleryPosts(photos, [postKey("o1", "LOADED"), postKey("o1", "SHIPMENT_LOADED")]);
    expect(posts.map((p) => p.kind)).toEqual(["LOADED", "SHIPMENT_LOADED"]);
    expect(posts.every((p) => p.images.length === 1)).toBe(true);
  });

  it("returns posts in the order of orderedKeys and skips keys with no photos", () => {
    const photos = [
      photo({ id: "x", orderId: "o2", kind: "LOADED", uploadedAt: "2026-06-18T08:00:00.000Z" }),
      photo({ id: "y", orderId: "o1", kind: "LOADED", uploadedAt: "2026-06-18T12:00:00.000Z" }),
    ];
    const ordered = [postKey("o1", "LOADED"), postKey("o2", "LOADED"), postKey("o9", "DELIVERY_PROOF")];
    const posts = assembleGalleryPosts(photos, ordered);
    expect(posts.map((p) => p.orderId)).toEqual(["o1", "o2"]); // o9 skipped (no photos)
  });
});
