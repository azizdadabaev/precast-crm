import { describe, it, expect } from "vitest";
import path from "path";
import { resolveOwnDraftImagePath } from "@/app/api/calculations/ai-extract/resolve-image-path";

describe("resolveOwnDraftImagePath", () => {
  it("resolves the caller's own draft image to an on-disk path", () => {
    const out = resolveOwnDraftImagePath("/uploads/drafts/u1/a.jpg", "u1");
    expect(out).not.toBeNull();
    expect(out!.endsWith(path.join("public", "uploads", "drafts", "u1", "a.jpg"))).toBe(true);
  });

  it("rejects another user's draft path", () => {
    expect(resolveOwnDraftImagePath("/uploads/drafts/other/a.jpg", "u1")).toBeNull();
  });

  it("rejects path traversal", () => {
    expect(resolveOwnDraftImagePath("/uploads/drafts/u1/../../etc/passwd", "u1")).toBeNull();
  });

  it("rejects a non-image extension", () => {
    expect(resolveOwnDraftImagePath("/uploads/drafts/u1/a.txt", "u1")).toBeNull();
  });

  it("rejects a non-drafts uploads path", () => {
    expect(resolveOwnDraftImagePath("/uploads/inbox/x/a.jpg", "u1")).toBeNull();
  });
});
