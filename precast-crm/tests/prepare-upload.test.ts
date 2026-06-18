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
