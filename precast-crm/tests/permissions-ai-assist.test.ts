import { describe, it, expect } from "vitest";
import { ACTIONS, ACTION_LABELS, PERMISSION_GROUPS } from "@/lib/permissions";

describe("calculator.aiAssist permission", () => {
  it("is registered in ACTIONS", () => {
    expect(ACTIONS).toContain("calculator.aiAssist");
  });

  it("has a bilingual label", () => {
    expect(ACTION_LABELS["calculator.aiAssist"]).toMatch(/·/);
  });

  it("sits in the calculator permission group", () => {
    const group = PERMISSION_GROUPS.find((g) => g.key === "calculator");
    expect(group?.actions).toContain("calculator.aiAssist");
  });
});
