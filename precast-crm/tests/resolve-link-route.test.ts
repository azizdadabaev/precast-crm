import { describe, it, expect } from "vitest";
import { ResolveLinkBody } from "@/app/api/geo/resolve-link/schema";

describe("ResolveLinkBody", () => {
  it("accepts { url: 'x' }", () => {
    expect(ResolveLinkBody.safeParse({ url: "x" }).success).toBe(true);
  });

  it("rejects an empty body", () => {
    expect(ResolveLinkBody.safeParse({}).success).toBe(false);
  });

  it("rejects a 3000-char url", () => {
    expect(ResolveLinkBody.safeParse({ url: "x".repeat(3000) }).success).toBe(false);
  });
});
