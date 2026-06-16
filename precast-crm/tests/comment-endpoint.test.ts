import { describe, it, expect } from "vitest";
import { commentBase } from "@/components/comments/comment-endpoint";

describe("commentBase", () => {
  it("routes an order comment to the order endpoint", () => {
    expect(commentBase({ orderId: "o1", projectId: null })).toBe("/api/orders/o1/comments");
  });
  it("routes a project (draft) comment to the project endpoint", () => {
    expect(commentBase({ orderId: null, projectId: "p1" })).toBe("/api/projects/p1/comments");
  });
  it("prefers the order endpoint if both are somehow set", () => {
    expect(commentBase({ orderId: "o1", projectId: "p1" })).toBe("/api/orders/o1/comments");
  });
});
