import { describe, it, expect } from "vitest";
import { isAllowedAnnotationSource } from "@/lib/uploads";

// Guards the authz boundary for which client-supplied box.imagePath a saved
// project may copy into its own media (api/projects/route.ts). A regression
// here would let a malicious payload pull another chat's or operator's images
// into a project — so these cases are deliberately exhaustive.

const ctx = { projectId: "P1", conversationId: "C1", userId: "U1" };

describe("isAllowedAnnotationSource — allowed sources", () => {
  it("allows the project's own media", () => {
    expect(isAllowedAnnotationSource("/uploads/projects/P1/abc.jpg", ctx)).toBe(true);
  });
  it("allows the linked conversation's media", () => {
    expect(isAllowedAnnotationSource("/uploads/inbox/C1/photo.png", ctx)).toBe(true);
  });
  it("allows the requesting operator's own drafts", () => {
    expect(isAllowedAnnotationSource("/uploads/drafts/U1/uuid.webp", ctx)).toBe(true);
  });
});

describe("isAllowedAnnotationSource — rejected sources", () => {
  it("rejects another conversation's media", () => {
    expect(isAllowedAnnotationSource("/uploads/inbox/C2/photo.png", ctx)).toBe(false);
  });
  it("rejects another operator's drafts", () => {
    expect(isAllowedAnnotationSource("/uploads/drafts/U2/uuid.webp", ctx)).toBe(false);
  });
  it("rejects inbox media when the project is not chat-linked", () => {
    expect(
      isAllowedAnnotationSource("/uploads/inbox/C1/photo.png", { ...ctx, conversationId: null }),
    ).toBe(false);
  });
  it("rejects another project's media", () => {
    expect(isAllowedAnnotationSource("/uploads/projects/P2/abc.jpg", ctx)).toBe(false);
  });
  it("rejects arbitrary uploads paths", () => {
    expect(isAllowedAnnotationSource("/uploads/random/x.jpg", ctx)).toBe(false);
  });
  it("rejects non-/uploads paths and absolute URLs", () => {
    expect(isAllowedAnnotationSource("https://evil.example/x.jpg", ctx)).toBe(false);
    expect(isAllowedAnnotationSource("/etc/passwd", ctx)).toBe(false);
  });
  it("rejects path traversal even under an allowed prefix", () => {
    expect(
      isAllowedAnnotationSource("/uploads/drafts/U1/../../inbox/C2/x.jpg", ctx),
    ).toBe(false);
    expect(
      isAllowedAnnotationSource("/uploads/projects/P1/../P2/x.jpg", ctx),
    ).toBe(false);
  });
  it("rejects prefix-confusion (trailing slash boundary)", () => {
    // P1evil must not be accepted just because it begins with P1.
    expect(isAllowedAnnotationSource("/uploads/projects/P1evil/x.jpg", ctx)).toBe(false);
    expect(isAllowedAnnotationSource("/uploads/drafts/U1evil/x.jpg", ctx)).toBe(false);
    expect(isAllowedAnnotationSource("/uploads/inbox/C1evil/x.jpg", ctx)).toBe(false);
  });
  it("rejects non-string inputs", () => {
    expect(isAllowedAnnotationSource(null, ctx)).toBe(false);
    expect(isAllowedAnnotationSource(undefined, ctx)).toBe(false);
    expect(isAllowedAnnotationSource(123, ctx)).toBe(false);
    expect(isAllowedAnnotationSource("", ctx)).toBe(false);
  });
});
