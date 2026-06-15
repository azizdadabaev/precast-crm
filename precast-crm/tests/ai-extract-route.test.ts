import { describe, it, expect } from "vitest";
import { AiExtractBody } from "@/app/api/calculations/ai-extract/route";

describe("AiExtractBody", () => {
  it("accepts text-only", () => {
    expect(AiExtractBody.safeParse({ text: "Уз 4 × эни 3 зал" }).success).toBe(true);
  });

  it("accepts image-only", () => {
    expect(AiExtractBody.safeParse({ imageBase64: "abc", imageMime: "image/jpeg" }).success).toBe(true);
  });

  it("rejects an empty body", () => {
    expect(AiExtractBody.safeParse({}).success).toBe(false);
  });

  it("rejects over-long text", () => {
    expect(AiExtractBody.safeParse({ text: "x".repeat(5000) }).success).toBe(false);
  });
});
